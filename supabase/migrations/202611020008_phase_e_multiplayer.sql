alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists description text not null default '';

with duplicate_names as (
  select id, username,
    row_number() over (partition by lower(username) order by created_at, id) as duplicate_number
  from public.profiles
)
update public.profiles profile
set username = left(duplicate_names.username, 17) || '-' || left(replace(profile.id::text, '-', ''), 6)
from duplicate_names
where duplicate_names.id = profile.id and duplicate_names.duplicate_number > 1;

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username));
revoke update on public.profiles from authenticated;

create table app_private.realm_rules (
  rule_code text primary key,
  rule_value jsonb not null
);
alter table app_private.realm_rules enable row level security;
revoke all on app_private.realm_rules from public, anon, authenticated;

insert into app_private.realm_rules (rule_code, rule_value) values
  ('village_expansion', '{"max_villages":10,"minimum_points":100,"minimum_distance":5,"wood_cost":1500,"clay_cost":1500,"iron_cost":1000}'),
  ('noble_unit', '{"unit_code":"noble","capture_requires_survivor":true}')
on conflict (rule_code) do nothing;

insert into app_private.unit_definitions (
  unit_code, name, category, attack, defense_infantry, defense_cavalry,
  speed_minutes_per_field, carry_capacity, population_cost,
  wood_cost, clay_cost, iron_cost, recruit_seconds, prerequisites
) values (
  'noble', 'Adliger', 'Infanterie', 30, 50, 50, 35, 0, 80,
  1000, 1000, 1000, 3600, '{"stable":5,"smithy":5,"headquarters":10}'
)
on conflict (unit_code) do nothing;

create or replace function public._unit_facility(p_unit_code text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_unit_code in ('spearman', 'swordsman', 'axeman') then 'barracks'
    when p_unit_code in ('scout', 'light_cavalry', 'heavy_cavalry', 'noble') then 'stable'
    when p_unit_code in ('ram', 'catapult') then 'workshop'
  end;
$$;

create table public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 40),
  tag text not null check (char_length(btrim(tag)) between 2 and 6),
  description text not null default '' check (char_length(description) <= 1000),
  founder_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index alliances_name_ci_unique on public.alliances (lower(name));
create unique index alliances_tag_ci_unique on public.alliances (upper(tag));

create table public.alliance_members (
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  player_id uuid not null unique references public.profiles (id) on delete cascade,
  role text not null check (role in ('founder', 'leader', 'diplomat', 'member')),
  joined_at timestamptz not null default now(),
  primary key (alliance_id, player_id)
);

alter table public.alliances
  add constraint alliances_founder_membership_fk
  foreign key (id, founder_id) references public.alliance_members (alliance_id, player_id)
  deferrable initially deferred;

create table public.alliance_invitations (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create unique index alliance_invitations_pending_unique
  on public.alliance_invitations (alliance_id, invitee_id) where status = 'pending';

create table public.diplomatic_relations (
  id uuid primary key default gen_random_uuid(),
  alliance_low uuid not null references public.alliances (id) on delete cascade,
  alliance_high uuid not null references public.alliances (id) on delete cascade,
  relation_type text not null check (relation_type in ('alliance', 'non_aggression', 'war')),
  initiator_alliance_id uuid not null references public.alliances (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alliance_low < alliance_high),
  check (initiator_alliance_id in (alliance_low, alliance_high))
);
create unique index diplomatic_relations_pair_unique
  on public.diplomatic_relations (alliance_low, alliance_high);

create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sender_archived_at timestamptz,
  recipient_archived_at timestamptz,
  sender_deleted_at timestamptz,
  recipient_deleted_at timestamptz,
  check (sender_id <> recipient_id)
);
create index private_messages_sender_idx on public.private_messages (sender_id, created_at desc);
create index private_messages_recipient_idx on public.private_messages (recipient_id, created_at desc);

create table public.alliance_messages (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index alliance_messages_history_idx on public.alliance_messages (alliance_id, created_at desc);

create table public.multiplayer_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('message', 'alliance_invitation', 'alliance_message', 'combat_report', 'incoming_movement', 'diplomacy')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index multiplayer_notifications_recipient_idx
  on public.multiplayer_notifications (recipient_id, created_at desc);

alter table public.alliances enable row level security;
alter table public.alliance_members enable row level security;
alter table public.alliance_invitations enable row level security;
alter table public.diplomatic_relations enable row level security;
alter table public.private_messages enable row level security;
alter table public.alliance_messages enable row level security;
alter table public.multiplayer_notifications enable row level security;

revoke all on public.alliances, public.alliance_members, public.alliance_invitations,
  public.diplomatic_relations, public.private_messages, public.alliance_messages,
  public.multiplayer_notifications from anon, authenticated;
grant select on public.multiplayer_notifications to authenticated;

create policy multiplayer_notifications_read_self on public.multiplayer_notifications
  for select to authenticated using (recipient_id = (select auth.uid()));

create or replace function public._notify_player(p_player_id uuid, p_event_type text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.multiplayer_notifications (recipient_id, event_type)
  values (p_player_id, p_event_type);
$$;

create or replace function public._player_stats(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'avatar_url', profile.avatar_url,
    'description', profile.description,
    'created_at', profile.created_at,
    'points', coalesce(sum(village.points), 0),
    'village_count', count(village.id),
    'alliance_id', membership.alliance_id,
    'alliance_name', alliance.name,
    'alliance_tag', alliance.tag
  )
  from public.profiles profile
  left join public.villages village on village.owner_id = profile.id and not village.is_barbarian
  left join public.alliance_members membership on membership.player_id = profile.id
  left join public.alliances alliance on alliance.id = membership.alliance_id
  where profile.id = p_player_id
  group by profile.id, membership.alliance_id, alliance.name, alliance.tag;
$$;

create or replace function public.update_player_profile(
  p_username text,
  p_avatar_url text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  normalized_name text := btrim(p_username);
  normalized_avatar text := nullif(btrim(p_avatar_url), '');
  normalized_description text := btrim(p_description);
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if normalized_name is null or char_length(normalized_name) not between 3 and 24
    or normalized_name !~ '^[[:alnum:] _.-]+$' then
    raise exception 'Der Spielername muss 3 bis 24 zulässige Zeichen enthalten' using errcode = '22023';
  end if;
  if normalized_avatar is not null and
    (char_length(normalized_avatar) > 500 or normalized_avatar !~ '^https://') then
    raise exception 'Profilbilder benötigen eine gültige HTTPS-Adresse' using errcode = '22023';
  end if;
  if normalized_description is null or char_length(normalized_description) > 500 then
    raise exception 'Die Beschreibung darf höchstens 500 Zeichen enthalten' using errcode = '22023';
  end if;

  update public.profiles
  set username = normalized_name, avatar_url = normalized_avatar, description = normalized_description
  where id = user_id;
  return public._player_stats(user_id);
exception
  when unique_violation then
    raise exception 'Dieser Spielername ist bereits vergeben' using errcode = '23505';
end;
$$;

create or replace function public.get_public_player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  return public._player_stats(p_player_id);
end;
$$;

create or replace function public.get_owned_villages()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  village_id uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  perform public._process_due_movements(user_id, v_now);
  for village_id in
    select village.id from public.villages village
    where village.owner_id = user_id and not village.is_barbarian
    order by village.created_at, village.id
  loop
    perform public._sync_village_economy(village_id, v_now);
    perform public._sync_village_military(village_id, v_now);
  end loop;
  return coalesce((
    select jsonb_agg(public._village_payload(village.id) || public._military_payload(village.id)
      order by village.created_at, village.id)
    from public.villages village
    where village.owner_id = user_id and not village.is_barbarian
  ), '[]'::jsonb);
end;
$$;

create or replace function public.found_additional_village(
  p_source_village_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  rule jsonb;
  now_at timestamptz := clock_timestamp();
  village_count integer;
  total_points bigint;
  source_stock public.village_resources%rowtype;
  source_village public.villages%rowtype;
  target_x integer;
  target_y integer;
  new_village_id uuid;
  village_name text := btrim(p_name);
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if village_name is null or char_length(village_name) not between 3 and 32 then
    raise exception 'Der Dorfname muss 3 bis 32 Zeichen lang sein' using errcode = '22023';
  end if;

  select rule_value into rule from app_private.realm_rules where rule_code = 'village_expansion';
  if rule is null then raise exception 'Die Expansionsregeln sind nicht konfiguriert' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('village-expansion:' || user_id::text)::bigint);
  select count(*), coalesce(sum(village.points), 0)
  into village_count, total_points
  from public.villages village
  where village.owner_id = user_id and not village.is_barbarian;
  if village_count >= (rule ->> 'max_villages')::integer then
    raise exception 'Die maximale Dorfanzahl ist erreicht' using errcode = 'P0001';
  end if;
  if total_points < (rule ->> 'minimum_points')::bigint then
    raise exception 'Die Mindestpunktzahl für eine weitere Gründung ist noch nicht erreicht' using errcode = 'P0001';
  end if;
  select * into source_village from public.villages
  where id = p_source_village_id and owner_id = user_id and not is_barbarian
  for update;
  if not found then raise exception 'Ausgangsdorf gehört dir nicht' using errcode = '42501'; end if;

  select resources.* into source_stock from public.village_resources resources
  where resources.village_id = p_source_village_id for update;
  if source_stock.wood < (rule ->> 'wood_cost')::bigint
    or source_stock.clay < (rule ->> 'clay_cost')::bigint
    or source_stock.iron < (rule ->> 'iron_cost')::bigint then
    raise exception 'Nicht genügend Rohstoffe für die Dorfgründung' using errcode = 'P0001';
  end if;

  select tile.x, tile.y into target_x, target_y
  from public.world_tiles tile
  where tile.world_id = source_village.world_id
    and not exists (
      select 1 from public.villages occupied
      where occupied.world_id = tile.world_id
        and (occupied.x, occupied.y) = (tile.x, tile.y)
    )
    and not exists (
      select 1 from public.villages nearby
      where nearby.world_id = tile.world_id
        and sqrt(power((nearby.x - tile.x)::numeric, 2) + power((nearby.y - tile.y)::numeric, 2))
          < (rule ->> 'minimum_distance')::numeric
    )
  order by abs(tile.x - source_village.x) + abs(tile.y - source_village.y), tile.y, tile.x
  for update of tile skip locked
  limit 1;
  if target_x is null then raise exception 'Kein freier Siedlungsplatz gefunden' using errcode = 'P0001'; end if;

  update public.village_resources
  set wood = wood - (rule ->> 'wood_cost')::bigint,
      clay = clay - (rule ->> 'clay_cost')::bigint,
      iron = iron - (rule ->> 'iron_cost')::bigint
  where village_id = p_source_village_id;

  insert into public.villages (world_id, owner_id, name, x, y, points, is_barbarian)
  values (source_village.world_id, user_id, village_name, target_x, target_y, 100, false)
  returning id into new_village_id;

  insert into public.village_resources (
    village_id, wood, clay, iron, food, storage_capacity, population, population_capacity, economy_last_updated_at
  ) values (new_village_id, 200, 200, 150, 200, 1000, 0, 240, now_at);
  insert into public.village_buildings (village_id, building_code, level) values
    (new_village_id, 'headquarters', 1),
    (new_village_id, 'woodcutter', 1),
    (new_village_id, 'clay_pit', 1),
    (new_village_id, 'iron_mine', 1),
    (new_village_id, 'farm', 1),
    (new_village_id, 'warehouse', 1),
    (new_village_id, 'rally_point', 1);
  insert into public.village_troops (village_id, unit_code, quantity)
    select new_village_id, unit_code, 0 from app_private.unit_definitions;

  return public._village_payload(new_village_id) || public._military_payload(new_village_id);
end;
$$;

create or replace function public.create_alliance(
  p_name text,
  p_tag text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  alliance_id uuid;
  name_value text := btrim(p_name);
  tag_value text := upper(btrim(p_tag));
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if name_value is null or char_length(name_value) not between 3 and 40
    or name_value !~ '^[[:alnum:] _.-]+$' then
    raise exception 'Der Allianzname muss 3 bis 40 zulässige Zeichen enthalten' using errcode = '22023';
  end if;
  if tag_value is null or char_length(tag_value) not between 2 and 6
    or tag_value !~ '^[A-Z0-9]+$' then
    raise exception 'Das Kürzel muss 2 bis 6 Buchstaben oder Ziffern enthalten' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Die Allianzbeschreibung darf höchstens 1000 Zeichen enthalten' using errcode = '22023';
  end if;
  if exists (select 1 from public.alliance_members where player_id = user_id) then
    raise exception 'Du bist bereits Mitglied einer Allianz' using errcode = 'P0001';
  end if;
  insert into public.alliances (name, tag, description, founder_id)
  values (name_value, tag_value, coalesce(btrim(p_description), ''), user_id)
  returning id into alliance_id;
  insert into public.alliance_members (alliance_id, player_id, role)
  values (alliance_id, user_id, 'founder');
  return jsonb_build_object('id', alliance_id, 'name', name_value, 'tag', tag_value);
exception
  when unique_violation then raise exception 'Allianzname oder Kürzel ist bereits vergeben' using errcode = '23505';
end;
$$;

create or replace function public.invite_alliance_member(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
  invitee uuid;
  invitation_id uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select membership.alliance_id into own_alliance
  from public.alliance_members membership
  where membership.player_id = user_id and membership.role in ('founder', 'leader');
  if own_alliance is null then raise exception 'Nur Gründer und Anführer dürfen einladen' using errcode = '42501'; end if;
  select profile.id into invitee from public.profiles profile
  where lower(profile.username) = lower(btrim(p_username));
  if invitee is null then raise exception 'Spieler nicht gefunden' using errcode = 'P0002'; end if;
  if invitee = user_id or exists (
    select 1 from public.alliance_members membership where membership.player_id = invitee
  ) then raise exception 'Spieler ist bereits in einer Allianz oder kann nicht eingeladen werden' using errcode = 'P0001'; end if;
  insert into public.alliance_invitations (alliance_id, inviter_id, invitee_id)
  values (own_alliance, user_id, invitee)
  returning id into invitation_id;
  perform public._notify_player(invitee, 'alliance_invitation');
  return invitation_id;
exception
  when unique_violation then raise exception 'Eine offene Einladung besteht bereits' using errcode = '23505';
end;
$$;

create or replace function public.respond_alliance_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  invitation public.alliance_invitations%rowtype;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select * into invitation from public.alliance_invitations
  where id = p_invitation_id and invitee_id = user_id and status = 'pending'
  for update;
  if not found then raise exception 'Offene Einladung nicht gefunden' using errcode = 'P0002'; end if;
  if p_accept and exists (select 1 from public.alliance_members where player_id = user_id) then
    raise exception 'Du bist bereits Mitglied einer Allianz' using errcode = 'P0001';
  end if;
  update public.alliance_invitations
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = invitation.id;
  if p_accept then
    insert into public.alliance_members (alliance_id, player_id, role)
    values (invitation.alliance_id, user_id, 'member');
    perform public._notify_player(invitation.inviter_id, 'alliance_invitation');
  end if;
end;
$$;

create or replace function public.manage_alliance_member(
  p_player_id uuid,
  p_action text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
  actor_role text;
  target_role text;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select alliance_id, role into own_alliance, actor_role
  from public.alliance_members where player_id = user_id;
  if actor_role not in ('founder', 'leader') then raise exception 'Keine Berechtigung zur Mitgliederverwaltung' using errcode = '42501'; end if;
  select role into target_role from public.alliance_members
  where alliance_id = own_alliance and player_id = p_player_id for update;
  if not found then raise exception 'Mitglied nicht gefunden' using errcode = 'P0002'; end if;
  if target_role = 'founder' then raise exception 'Der Gründer kann nicht entfernt oder herabgestuft werden' using errcode = '42501'; end if;
  if p_action = 'remove' then
    delete from public.alliance_members where alliance_id = own_alliance and player_id = p_player_id;
  elsif p_action = 'role' and actor_role = 'founder' and p_role in ('leader', 'diplomat', 'member') then
    update public.alliance_members set role = p_role
    where alliance_id = own_alliance and player_id = p_player_id;
  else
    raise exception 'Aktion oder Rolle ist nicht zulässig' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.leave_alliance()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_role text;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select role into own_role from public.alliance_members where player_id = user_id for update;
  if not found then raise exception 'Du bist keiner Allianz beigetreten' using errcode = 'P0002'; end if;
  if own_role = 'founder' then raise exception 'Der Gründer muss die Allianz auflösen oder vorher eine Leitung übertragen' using errcode = 'P0001'; end if;
  delete from public.alliance_members where player_id = user_id;
end;
$$;

create or replace function public.dissolve_alliance()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select alliance_id into own_alliance from public.alliance_members
  where player_id = user_id and role = 'founder';
  if own_alliance is null then raise exception 'Nur der Gründer darf die Allianz auflösen' using errcode = '42501'; end if;
  delete from public.alliances where id = own_alliance;
end;
$$;

create or replace function public.propose_diplomacy(p_target_alliance uuid, p_relation_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
  low_id uuid;
  high_id uuid;
  relation_id uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if p_relation_type not in ('alliance', 'non_aggression', 'war') then
    raise exception 'Unbekannte Beziehungsart' using errcode = '22023';
  end if;
  select alliance_id into own_alliance from public.alliance_members
  where player_id = user_id and role in ('founder', 'leader', 'diplomat');
  if own_alliance is null then raise exception 'Diplomatie ist nur für Allianzführung und Diplomaten verfügbar' using errcode = '42501'; end if;
  if p_target_alliance = own_alliance or not exists (select 1 from public.alliances where id = p_target_alliance) then
    raise exception 'Ungültige Zielallianz' using errcode = '22023';
  end if;
  low_id := least(own_alliance, p_target_alliance);
  high_id := greatest(own_alliance, p_target_alliance);
  insert into public.diplomatic_relations (
    alliance_low, alliance_high, relation_type, initiator_alliance_id, status
  ) values (low_id, high_id, p_relation_type, own_alliance, 'pending')
  returning id into relation_id;
  perform public._notify_player(membership.player_id, 'diplomacy')
  from public.alliance_members membership
  where membership.alliance_id = p_target_alliance
    and membership.role in ('founder', 'leader', 'diplomat');
  return relation_id;
exception
  when unique_violation then raise exception 'Zwischen diesen Allianzen besteht bereits eine offene oder aktive Beziehung' using errcode = '23505';
end;
$$;

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

create or replace function public.end_diplomacy(p_relation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  delete from public.diplomatic_relations relation
  where relation.id = p_relation_id
    and exists (
      select 1 from public.alliance_members membership
      where membership.player_id = user_id
        and membership.role in ('founder', 'leader', 'diplomat')
        and membership.alliance_id in (relation.alliance_low, relation.alliance_high)
    );
  if not found then raise exception 'Keine berechtigte Diplomatiebeziehung gefunden' using errcode = '42501'; end if;
end;
$$;

create or replace function public.send_private_message(p_recipient_username text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  recipient uuid;
  message_id uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select id into recipient from public.profiles
  where lower(username) = lower(btrim(p_recipient_username));
  if recipient is null then raise exception 'Empfänger nicht gefunden' using errcode = 'P0002'; end if;
  if recipient = user_id then raise exception 'Du kannst dir keine Nachricht selbst senden' using errcode = '22023'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Nachrichten müssen 1 bis 4000 Zeichen lang sein' using errcode = '22023';
  end if;
  insert into public.private_messages (sender_id, recipient_id, body)
  values (user_id, recipient, btrim(p_body))
  returning id into message_id;
  perform public._notify_player(recipient, 'message');
  return message_id;
end;
$$;

create or replace function public.manage_private_message(p_message_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if p_action = 'read' then
    update public.private_messages set read_at = coalesce(read_at, now())
    where id = p_message_id and recipient_id = user_id and recipient_deleted_at is null;
  elsif p_action = 'archive' then
    update public.private_messages set
      sender_archived_at = case when sender_id = user_id then now() else sender_archived_at end,
      recipient_archived_at = case when recipient_id = user_id then now() else recipient_archived_at end
    where id = p_message_id and user_id in (sender_id, recipient_id);
  elsif p_action = 'delete' then
    update public.private_messages set
      sender_deleted_at = case when sender_id = user_id then now() else sender_deleted_at end,
      recipient_deleted_at = case when recipient_id = user_id then now() else recipient_deleted_at end
    where id = p_message_id and user_id in (sender_id, recipient_id);
  else
    raise exception 'Unbekannte Nachrichtenaktion' using errcode = '22023';
  end if;
  if not found then raise exception 'Nachricht nicht gefunden oder nicht zugänglich' using errcode = '42501'; end if;
end;
$$;

create or replace function public.send_alliance_message(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  own_alliance uuid;
  message_id uuid;
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  select alliance_id into own_alliance from public.alliance_members where player_id = user_id;
  if own_alliance is null then raise exception 'Du bist keiner Allianz beigetreten' using errcode = '42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Nachrichten müssen 1 bis 4000 Zeichen lang sein' using errcode = '22023';
  end if;
  insert into public.alliance_messages (alliance_id, sender_id, body)
  values (own_alliance, user_id, btrim(p_body))
  returning id into message_id;
  perform public._notify_player(membership.player_id, 'alliance_message')
  from public.alliance_members membership
  where membership.alliance_id = own_alliance and membership.player_id <> user_id;
  return message_id;
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
  update public.private_messages set read_at = coalesce(read_at, now())
  where recipient_id = user_id and read_at is null and recipient_deleted_at is null
    and recipient_archived_at is null;
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

create or replace function public.get_player_rankings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  return jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(player_row order by (player_row ->> 'points')::bigint desc, player_row ->> 'username')
      from (
        select jsonb_build_object(
          'id', profile.id, 'username', profile.username, 'avatar_url', profile.avatar_url,
          'points', coalesce(sum(village.points), 0), 'village_count', count(village.id),
          'alliance_tag', alliance.tag
        ) as player_row
        from public.profiles profile
        left join public.villages village on village.owner_id = profile.id and not village.is_barbarian
        left join public.alliance_members membership on membership.player_id = profile.id
        left join public.alliances alliance on alliance.id = membership.alliance_id
        group by profile.id, alliance.tag
        order by coalesce(sum(village.points), 0) desc, profile.username
        limit 100
      ) players
    ), '[]'::jsonb),
    'alliances', coalesce((
      select jsonb_agg(alliance_row order by (alliance_row ->> 'points')::bigint desc, alliance_row ->> 'name')
      from (
        select jsonb_build_object(
          'id', alliance.id, 'name', alliance.name, 'tag', alliance.tag,
          'points', coalesce(sum(village.points), 0), 'member_count', count(distinct membership.player_id)
        ) as alliance_row
        from public.alliances alliance
        left join public.alliance_members membership on membership.alliance_id = alliance.id
        left join public.villages village on village.owner_id = membership.player_id and not village.is_barbarian
        group by alliance.id
        order by coalesce(sum(village.points), 0) desc, alliance.name
        limit 100
      ) alliances
    ), '[]'::jsonb),
    'villages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', village.id, 'name', village.name, 'x', village.x, 'y', village.y,
        'points', village.points, 'owner_name', profile.username, 'alliance_tag', alliance.tag
      ) order by village.points desc, village.name)
      from (
        select * from public.villages
        where not is_barbarian order by points desc, name limit 100
      ) village
      join public.profiles profile on profile.id = village.owner_id
      left join public.alliance_members membership on membership.player_id = profile.id
      left join public.alliances alliance on alliance.id = membership.alliance_id
    ), '[]'::jsonb)
  );
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
  did_capture boolean := false;
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
  update public.villages set owner_id = new.owner_id where id = new.target_village_id;
  did_capture := true;
  new.result := jsonb_set(new.result, '{captured}', 'true'::jsonb);
  update public.combat_reports
  set report_data = jsonb_set(report_data, '{captured}', 'true'::jsonb)
  where movement_id = new.id and viewer_id = new.owner_id;
  if target_owner is not null then
    perform public._notify_player(target_owner, 'combat_report');
  end if;
  perform public._notify_player(new.owner_id, 'combat_report');
  return new;
end;
$$;

create trigger troop_movement_capture_village
before update of status on public.troop_movements
for each row execute function public.capture_village_after_battle();

drop function public.get_world_map(integer, integer, integer);
create function public.get_world_map(
  p_center_x integer default 0,
  p_center_y integer default 0,
  p_radius integer default 10
)
returns table (
  x integer,
  y integer,
  terrain text,
  village_id uuid,
  village_name text,
  owner_name text,
  points integer,
  is_barbarian boolean,
  alliance_tag text,
  has_movement boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Anmeldung erforderlich' using errcode = '28000'; end if;
  if p_radius not between 4 and 20 then
    raise exception 'Der Kartenradius muss zwischen 4 und 20 liegen' using errcode = '22023';
  end if;
  return query
  select tile.x, tile.y, tile.terrain, village.id, village.name,
    profile.username, village.points, village.is_barbarian, alliance.tag,
    exists (
      select 1 from public.troop_movements movement
      join public.villages source on source.id = movement.source_village_id
      join public.villages target on target.id = movement.target_village_id
      where movement.status in ('travelling', 'returning')
        and ((movement.owner_id = user_id and (source.id = village.id or target.id = village.id))
          or (target.owner_id = user_id and target.id = village.id))
    )
  from public.world_tiles tile
  left join public.villages village
    on village.world_id = tile.world_id and village.x = tile.x and village.y = tile.y
  left join public.profiles profile on profile.id = village.owner_id
  left join public.alliance_members membership on membership.player_id = village.owner_id
  left join public.alliances alliance on alliance.id = membership.alliance_id
  where tile.world_id = '00000000-0000-0000-0000-000000000001'::uuid
    and tile.x between greatest(-100, p_center_x - p_radius) and least(100, p_center_x + p_radius)
    and tile.y between greatest(-100, p_center_y - p_radius) and least(100, p_center_y + p_radius)
  order by tile.y desc, tile.x;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_notifications'
    ) then
    alter publication supabase_realtime add table public.multiplayer_notifications;
  end if;
end;
$$;

revoke all on function public._notify_player(uuid, text) from public, anon, authenticated;
revoke all on function public._player_stats(uuid) from public, anon, authenticated;
revoke all on function public._unit_facility(text) from public, anon, authenticated;
revoke all on function public.update_player_profile(text, text, text) from public, anon;
revoke all on function public.get_public_player_profile(uuid) from public, anon;
revoke all on function public.get_owned_villages() from public, anon;
revoke all on function public.found_additional_village(uuid, text) from public, anon;
revoke all on function public.create_alliance(text, text, text) from public, anon;
revoke all on function public.invite_alliance_member(text) from public, anon;
revoke all on function public.respond_alliance_invitation(uuid, boolean) from public, anon;
revoke all on function public.manage_alliance_member(uuid, text, text) from public, anon;
revoke all on function public.leave_alliance() from public, anon;
revoke all on function public.dissolve_alliance() from public, anon;
revoke all on function public.propose_diplomacy(uuid, text) from public, anon;
revoke all on function public.respond_diplomacy(uuid, boolean) from public, anon;
revoke all on function public.end_diplomacy(uuid) from public, anon;
revoke all on function public.send_private_message(text, text) from public, anon;
revoke all on function public.manage_private_message(uuid, text) from public, anon;
revoke all on function public.send_alliance_message(text) from public, anon;
revoke all on function public.get_multiplayer_overview() from public, anon;
revoke all on function public.get_player_rankings() from public, anon;
revoke all on function public.capture_village_after_battle() from public, anon, authenticated;
revoke all on function public.get_world_map(integer, integer, integer) from public, anon;
grant execute on function public.update_player_profile(text, text, text) to authenticated;
grant execute on function public.get_public_player_profile(uuid) to authenticated;
grant execute on function public.get_owned_villages() to authenticated;
grant execute on function public.found_additional_village(uuid, text) to authenticated;
grant execute on function public.create_alliance(text, text, text) to authenticated;
grant execute on function public.invite_alliance_member(text) to authenticated;
grant execute on function public.respond_alliance_invitation(uuid, boolean) to authenticated;
grant execute on function public.manage_alliance_member(uuid, text, text) to authenticated;
grant execute on function public.leave_alliance() to authenticated;
grant execute on function public.dissolve_alliance() to authenticated;
grant execute on function public.propose_diplomacy(uuid, text) to authenticated;
grant execute on function public.respond_diplomacy(uuid, boolean) to authenticated;
grant execute on function public.end_diplomacy(uuid) to authenticated;
grant execute on function public.send_private_message(text, text) to authenticated;
grant execute on function public.manage_private_message(uuid, text) to authenticated;
grant execute on function public.send_alliance_message(text) to authenticated;
grant execute on function public.get_multiplayer_overview() to authenticated;
grant execute on function public.get_player_rankings() to authenticated;
grant execute on function public.get_world_map(integer, integer, integer) to authenticated;
