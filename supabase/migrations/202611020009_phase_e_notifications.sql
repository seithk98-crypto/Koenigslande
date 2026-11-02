create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_name text;
  fallback_name text;
begin
  requested_name := btrim(new.raw_user_meta_data ->> 'display_name');
  if requested_name is null or char_length(requested_name) not between 3 and 24
    or requested_name !~ '^[[:alnum:] _.-]+$'
    or exists (select 1 from public.profiles where lower(username) = lower(requested_name)) then
    fallback_name := 'Herrscher-' || left(replace(new.id::text, '-', ''), 12);
  else
    fallback_name := requested_name;
  end if;
  insert into public.profiles (id, username)
  values (new.id, fallback_name);
  return new;
end;
$$;

create or replace function public.notify_movement_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_owner uuid;
begin
  if new.movement_type not in ('attack', 'scout') then return new; end if;
  select owner_id into target_owner from public.villages where id = new.target_village_id;
  if target_owner is not null and target_owner <> new.owner_id then
    perform public._notify_player(target_owner, 'incoming_movement');
  end if;
  return new;
end;
$$;

create trigger troop_movement_notify_participants
after insert on public.troop_movements
for each row execute function public.notify_movement_participants();

create or replace function public.notify_new_combat_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._notify_player(new.viewer_id, 'combat_report');
  return new;
end;
$$;

create trigger combat_report_notify_viewer
after insert on public.combat_reports
for each row execute function public.notify_new_combat_report();

revoke all on function public.notify_movement_participants() from public, anon, authenticated;
revoke all on function public.notify_new_combat_report() from public, anon, authenticated;
