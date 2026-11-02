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
