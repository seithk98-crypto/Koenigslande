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

  perform pg_advisory_xact_lock(hashtext('village-expansion:' || new.owner_id::text)::bigint);
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
