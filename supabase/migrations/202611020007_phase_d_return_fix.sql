create or replace function public._create_return_movement(
  p_parent_id uuid,
  p_owner_id uuid,
  p_source_village_id uuid,
  p_target_village_id uuid,
  p_troops jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  distance numeric;
  travel_seconds bigint;
  return_id uuid;
begin
  if public._movement_total(p_troops) = 0 then
    return null;
  end if;

  distance := public._movement_distance(p_source_village_id, p_target_village_id);
  travel_seconds := public._movement_seconds(p_troops, distance);
  insert into public.troop_movements (
    owner_id, source_village_id, target_village_id, parent_movement_id,
    movement_type, troops, sent_at, arrives_at, status
  ) values (
    p_owner_id, p_source_village_id, p_target_village_id, p_parent_id,
    'return', p_troops, p_now, p_now + make_interval(secs => travel_seconds), 'returning'
  )
  returning id into return_id;
  return return_id;
end;
$$;
