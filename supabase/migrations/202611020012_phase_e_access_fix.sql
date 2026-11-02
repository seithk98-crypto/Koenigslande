create or replace function public.respond_diplomacy(p_relation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  relation public.diplomatic_relations%rowtype;
  own_alliance uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select alliance_id into own_alliance from public.alliance_members
  where player_id = user_id and role in ('founder', 'leader', 'diplomat');
  if own_alliance is null then
    raise exception 'Diplomatie ist nur für Allianzführung und Diplomaten verfügbar' using errcode = '42501';
  end if;
  select * into relation from public.diplomatic_relations
  where id = p_relation_id for update;
  if not found or relation.status <> 'pending'
    or relation.initiator_alliance_id = own_alliance
    or own_alliance not in (relation.alliance_low, relation.alliance_high) then
    raise exception 'Keine annehmbare Diplomatieanfrage gefunden' using errcode = '42501';
  end if;
  if p_accept then
    update public.diplomatic_relations set status = 'active', updated_at = now() where id = relation.id;
  else
    delete from public.diplomatic_relations where id = relation.id;
  end if;
  perform public._notify_player(membership.player_id, 'diplomacy')
  from public.alliance_members membership
  where membership.alliance_id = relation.initiator_alliance_id
    and membership.role in ('founder', 'leader', 'diplomat');
end;
$$;

create or replace function public.capture_village_after_battle()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  rules jsonb;
  noble_survivors integer;
  owned_count integer;
  target_owner uuid;
begin
  if old.status in ('resolved', 'completed') or new.status <> 'resolved'
    or new.movement_type <> 'attack' or new.result ->> 'winner' <> 'attacker' then
    return new;
  end if;
  noble_survivors := coalesce((new.result -> 'attacker_survivors' ->> 'noble')::integer, 0);
  if noble_survivors < 1 then return new; end if;
  select rule_value into rules from app_private.realm_rules where rule_code = 'village_expansion';
  select owner_id into target_owner from public.villages where id = new.target_village_id;
  select count(*) into owned_count from public.villages
  where owner_id = new.owner_id and not is_barbarian;
  if target_owner = new.owner_id or owned_count >= coalesce((rules ->> 'max_villages')::integer, 10) then
    return new;
  end if;
  update public.villages
  set owner_id = new.owner_id, is_barbarian = false
  where id = new.target_village_id;
  new.result := jsonb_set(new.result, '{captured}', 'true'::jsonb);
  update public.combat_reports
  set report_data = jsonb_set(report_data, '{captured}', 'true'::jsonb)
  where movement_id = new.id and viewer_id = new.owner_id;
  if target_owner is not null then perform public._notify_player(target_owner, 'combat_report'); end if;
  perform public._notify_player(new.owner_id, 'combat_report');
  return new;
end;
$$;

create or replace function public.get_multiplayer_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select alliance_id into own_alliance from public.alliance_members where player_id = user_id;
  return jsonb_build_object(
    'profile', public._player_stats(user_id),
    'alliance', (
      select jsonb_build_object(
        'id', alliance.id, 'name', alliance.name, 'tag', alliance.tag,
        'description', alliance.description, 'role', membership.role, 'founder_id', alliance.founder_id,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', player.id, 'username', player.username, 'avatar_url', player.avatar_url,
            'role', members.role, 'joined_at', members.joined_at,
            'points', coalesce((select sum(village.points) from public.villages village where village.owner_id = player.id), 0),
            'village_count', (select count(*) from public.villages village where village.owner_id = player.id)
          ) order by case members.role when 'founder' then 1 when 'leader' then 2 when 'diplomat' then 3 else 4 end, player.username)
          from public.alliance_members members join public.profiles player on player.id = members.player_id
          where members.alliance_id = alliance.id
        ), '[]'::jsonb),
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', message.id, 'sender_id', message.sender_id, 'sender_name', player.username,
            'body', message.body, 'created_at', message.created_at
          ) order by message.created_at desc)
          from (
            select * from public.alliance_messages
            where alliance_id = alliance.id order by created_at desc limit 50
          ) message
          join public.profiles player on player.id = message.sender_id
        ), '[]'::jsonb)
      )
      from public.alliances alliance
      join public.alliance_members membership on membership.alliance_id = alliance.id
      where membership.player_id = user_id
    ),
    'alliances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', alliance.id, 'name', alliance.name, 'tag', alliance.tag,
        'description', alliance.description,
        'member_count', (select count(*) from public.alliance_members member where member.alliance_id = alliance.id),
        'points', coalesce((
          select sum(village.points)
          from public.alliance_members member
          join public.villages village on village.owner_id = member.player_id
          where member.alliance_id = alliance.id
        ), 0)
      ) order by alliance.name)
      from public.alliances alliance
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invitation.id, 'alliance_id', invitation.alliance_id,
        'alliance_name', alliance.name, 'alliance_tag', alliance.tag,
        'inviter_name', inviter.username, 'created_at', invitation.created_at
      ) order by invitation.created_at desc)
      from public.alliance_invitations invitation
      join public.alliances alliance on alliance.id = invitation.alliance_id
      join public.profiles inviter on inviter.id = invitation.inviter_id
      where invitation.invitee_id = user_id and invitation.status = 'pending'
    ), '[]'::jsonb),
    'diplomacy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', relation.id, 'relation_type', relation.relation_type, 'status', relation.status,
        'initiator_alliance_id', relation.initiator_alliance_id,
        'own_side', case when relation.alliance_low = own_alliance then 'low' else 'high' end,
        'other_alliance_id', case when relation.alliance_low = own_alliance then relation.alliance_high else relation.alliance_low end,
        'other_alliance_name', other_alliance.name, 'other_alliance_tag', other_alliance.tag,
        'created_at', relation.created_at
      ) order by relation.created_at desc)
      from public.diplomatic_relations relation
      join public.alliances other_alliance
        on other_alliance.id = case when relation.alliance_low = own_alliance then relation.alliance_high else relation.alliance_low end
      where own_alliance in (relation.alliance_low, relation.alliance_high)
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', message.id, 'sender_id', message.sender_id, 'sender_name', sender.username,
        'recipient_id', message.recipient_id, 'recipient_name', recipient.username,
        'body', message.body, 'created_at', message.created_at, 'read_at', message.read_at
      ) order by message.created_at desc)
      from (
        select * from public.private_messages
        where (sender_id = user_id and sender_deleted_at is null and sender_archived_at is null)
          or (recipient_id = user_id and recipient_deleted_at is null and recipient_archived_at is null)
        order by created_at desc limit 50
      ) message
      join public.profiles sender on sender.id = message.sender_id
      join public.profiles recipient on recipient.id = message.recipient_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', notification.id, 'event_type', notification.event_type,
        'created_at', notification.created_at, 'read_at', notification.read_at
      ) order by notification.created_at desc)
      from (
        select * from public.multiplayer_notifications
        where recipient_id = user_id order by created_at desc limit 50
      ) notification
    ), '[]'::jsonb)
  );
end;
$$;
