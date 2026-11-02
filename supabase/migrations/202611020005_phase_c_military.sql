create table app_private.unit_definitions (
  unit_code text primary key,
  name text not null,
  category text not null check (category in ('Infanterie', 'Kavallerie', 'Belagerung')),
  attack integer not null check (attack >= 0),
  defense_infantry integer not null check (defense_infantry >= 0),
  defense_cavalry integer not null check (defense_cavalry >= 0),
  speed_minutes_per_field integer not null check (speed_minutes_per_field > 0),
  carry_capacity integer not null check (carry_capacity >= 0),
  population_cost integer not null check (population_cost > 0),
  wood_cost integer not null check (wood_cost >= 0),
  clay_cost integer not null check (clay_cost >= 0),
  iron_cost integer not null check (iron_cost >= 0),
  recruit_seconds integer not null check (recruit_seconds > 0),
  prerequisites jsonb not null check (jsonb_typeof(prerequisites) = 'object')
);

alter table app_private.unit_definitions enable row level security;
revoke all on app_private.unit_definitions from public, anon, authenticated;

insert into app_private.unit_definitions (
  unit_code, name, category, attack, defense_infantry, defense_cavalry,
  speed_minutes_per_field, carry_capacity, population_cost,
  wood_cost, clay_cost, iron_cost, recruit_seconds, prerequisites
) values
  ('spearman', 'Speerträger', 'Infanterie', 10, 15, 45, 18, 25, 1, 50, 30, 10, 60, '{"barracks":1}'),
  ('swordsman', 'Schwertkämpfer', 'Infanterie', 25, 50, 15, 22, 15, 1, 30, 30, 70, 90, '{"barracks":2,"smithy":1}'),
  ('axeman', 'Axtkämpfer', 'Infanterie', 40, 10, 5, 18, 10, 1, 60, 30, 40, 100, '{"barracks":3,"smithy":2}'),
  ('scout', 'Späher', 'Kavallerie', 0, 10, 5, 9, 0, 2, 50, 50, 20, 120, '{"stable":1}'),
  ('light_cavalry', 'Leichte Kavallerie', 'Kavallerie', 130, 30, 40, 10, 80, 4, 125, 100, 250, 180, '{"stable":2,"smithy":1}'),
  ('heavy_cavalry', 'Schwere Kavallerie', 'Kavallerie', 150, 200, 80, 11, 50, 6, 200, 150, 600, 240, '{"stable":3,"smithy":3}'),
  ('ram', 'Rammbock', 'Belagerung', 2, 20, 50, 30, 0, 5, 300, 200, 200, 300, '{"workshop":1,"smithy":2}'),
  ('catapult', 'Katapult', 'Belagerung', 100, 50, 100, 60, 0, 8, 320, 400, 100, 360, '{"workshop":3,"smithy":4}');

create table public.village_troops (
  village_id uuid not null references public.villages (id) on delete cascade,
  unit_code text not null references app_private.unit_definitions (unit_code),
  quantity bigint not null default 0 check (quantity >= 0),
  primary key (village_id, unit_code)
);

create table public.recruitment_queue (
  id uuid primary key default gen_random_uuid(),
  village_id uuid not null references public.villages (id) on delete cascade,
  request_id uuid not null,
  unit_code text not null references app_private.unit_definitions (unit_code),
  quantity integer not null check (quantity between 1 and 10000),
  started_at timestamptz not null,
  completes_at timestamptz not null check (completes_at > started_at),
  status text not null default 'queued' check (status in ('queued', 'completed')),
  created_at timestamptz not null default now(),
  unique (village_id, request_id)
);

create index recruitment_queue_pending_idx
  on public.recruitment_queue (village_id, unit_code, completes_at, id)
  where status = 'queued';

alter table public.village_troops enable row level security;
alter table public.recruitment_queue enable row level security;
revoke all on public.village_troops, public.recruitment_queue from anon, authenticated;

create or replace function public._unit_facility(p_unit_code text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_unit_code in ('spearman', 'swordsman', 'axeman') then 'barracks'
    when p_unit_code in ('scout', 'light_cavalry', 'heavy_cavalry') then 'stable'
    when p_unit_code in ('ram', 'catapult') then 'workshop'
  end;
$$;

create or replace function public._unit_is_unlocked(p_village_id uuid, p_unit_code text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select exists (
    select 1
    from app_private.unit_definitions definition
    where definition.unit_code = p_unit_code
      and not exists (
        select 1
        from jsonb_each_text(definition.prerequisites) prerequisite
        where public._economy_level(p_village_id, prerequisite.key) < prerequisite.value::integer
      )
  );
$$;

create or replace function public._sync_village_military(
  p_village_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  finished_job public.recruitment_queue%rowtype;
begin
  perform 1
  from public.village_resources r
  where r.village_id = p_village_id
  for update;

  if not found then
    raise exception 'Rohstoffbestand des Dorfs fehlt' using errcode = 'P0002';
  end if;

  loop
    select q.* into finished_job
    from public.recruitment_queue q
    where q.village_id = p_village_id
      and q.status = 'queued'
      and q.completes_at <= p_now
    order by q.completes_at, q.id
    limit 1
    for update;

    exit when not found;

    insert into public.village_troops (village_id, unit_code, quantity)
    values (p_village_id, finished_job.unit_code, finished_job.quantity)
    on conflict (village_id, unit_code)
    do update set quantity = public.village_troops.quantity + excluded.quantity;

    update public.recruitment_queue
    set status = 'completed'
    where id = finished_job.id;
  end loop;
end;
$$;

create or replace function public._military_payload(p_village_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select jsonb_build_object(
    'recruitment_time_factor', greatest(
      0.5,
      1 - 0.1 * greatest(0, public._economy_level(p_village_id, 'headquarters') - 1)
    ),
    'troops', coalesce((
      select jsonb_object_agg(definition.unit_code, coalesce(stock.quantity, 0))
      from app_private.unit_definitions definition
      left join public.village_troops stock
        on stock.village_id = p_village_id and stock.unit_code = definition.unit_code
    ), '{}'::jsonb),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit_code', definition.unit_code,
        'name', definition.name,
        'category', definition.category,
        'attack', definition.attack,
        'defense_infantry', definition.defense_infantry,
        'defense_cavalry', definition.defense_cavalry,
        'speed_minutes_per_field', definition.speed_minutes_per_field,
        'carry_capacity', definition.carry_capacity,
        'population_cost', definition.population_cost,
        'costs', jsonb_build_object(
          'wood', definition.wood_cost,
          'clay', definition.clay_cost,
          'iron', definition.iron_cost
        ),
        'recruit_seconds', definition.recruit_seconds,
        'facility', public._unit_facility(definition.unit_code),
        'prerequisites', definition.prerequisites,
        'unlocked', public._unit_is_unlocked(p_village_id, definition.unit_code)
      ) order by
        case definition.category when 'Infanterie' then 1 when 'Kavallerie' then 2 else 3 end,
        definition.unit_code)
      from app_private.unit_definitions definition
    ), '[]'::jsonb),
    'recruitment_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'unit_code', q.unit_code,
        'quantity', q.quantity,
        'started_at', q.started_at,
        'completes_at', q.completes_at,
        'status', q.status,
        'remaining_seconds', greatest(0, ceil(extract(epoch from (q.completes_at - now())))::bigint)
      ) order by q.started_at, q.id)
      from public.recruitment_queue q
      where q.village_id = p_village_id and q.status = 'queued'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_my_starting_village()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_village_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;

  select v.id into v_village_id
  from public.villages v
  where v.owner_id = auth.uid() and not v.is_barbarian
  order by v.created_at, v.id
  limit 1
  for update;

  if v_village_id is null then
    return null;
  end if;

  perform public._sync_village_economy(v_village_id, v_now);
  perform public._sync_village_military(v_village_id, v_now);
  return public._village_payload(v_village_id) || public._military_payload(v_village_id);
end;
$$;

create or replace function public.get_village_state(p_village_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_village_id is null or not exists (
    select 1 from public.villages v
    where v.id = p_village_id and v.owner_id = auth.uid() and not v.is_barbarian
  ) then
    raise exception 'Eigenes Dorf nicht gefunden' using errcode = 'P0002';
  end if;

  perform public._sync_village_economy(p_village_id, v_now);
  perform public._sync_village_military(p_village_id, v_now);
  return public._village_payload(p_village_id) || public._military_payload(p_village_id);
end;
$$;

create or replace function public.start_recruitment(
  p_village_id uuid,
  p_unit_code text,
  p_quantity integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_unit app_private.unit_definitions%rowtype;
  v_stock public.village_resources%rowtype;
  v_existing_id uuid;
  v_facility text;
  v_facility_level integer;
  v_headquarters_level integer;
  v_population_needed integer;
  v_wood_needed bigint;
  v_clay_needed bigint;
  v_iron_needed bigint;
  v_recruit_seconds bigint;
  v_scheduled_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_village_id is null or not exists (
    select 1 from public.villages v
    where v.id = p_village_id and v.owner_id = auth.uid() and not v.is_barbarian
  ) then
    raise exception 'Eigenes Dorf nicht gefunden' using errcode = 'P0002';
  end if;
  if p_request_id is null then
    raise exception 'Eine Anfragekennung ist erforderlich' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then
    raise exception 'Die Anzahl muss zwischen 1 und 10.000 liegen' using errcode = '22023';
  end if;

  perform 1 from public.villages v where v.id = p_village_id for update;
  perform public._sync_village_economy(p_village_id, v_now);
  perform public._sync_village_military(p_village_id, v_now);

  select q.id into v_existing_id
  from public.recruitment_queue q
  where q.village_id = p_village_id and q.request_id = p_request_id;
  if v_existing_id is not null then
    return public._village_payload(p_village_id) || public._military_payload(p_village_id);
  end if;

  select definition.* into v_unit
  from app_private.unit_definitions definition
  where definition.unit_code = p_unit_code;
  if not found then
    raise exception 'Dieser Einheitentyp ist unbekannt' using errcode = '22023';
  end if;
  if not public._unit_is_unlocked(p_village_id, p_unit_code) then
    raise exception 'Die Voraussetzungen für diese Einheit sind nicht erfüllt' using errcode = 'P0001';
  end if;

  v_population_needed := v_unit.population_cost * p_quantity;
  v_wood_needed := v_unit.wood_cost::bigint * p_quantity;
  v_clay_needed := v_unit.clay_cost::bigint * p_quantity;
  v_iron_needed := v_unit.iron_cost::bigint * p_quantity;

  select r.* into v_stock
  from public.village_resources r
  where r.village_id = p_village_id
  for update;

  if v_stock.wood < v_wood_needed or v_stock.clay < v_clay_needed or v_stock.iron < v_iron_needed then
    raise exception 'Nicht genügend Rohstoffe für diese Rekrutierung' using errcode = 'P0001';
  end if;
  if v_stock.population + v_population_needed > v_stock.population_capacity then
    raise exception 'Nicht genügend freie Bevölkerung' using errcode = 'P0001';
  end if;

  v_facility := public._unit_facility(p_unit_code);
  v_facility_level := public._economy_level(p_village_id, v_facility);
  v_headquarters_level := public._economy_level(p_village_id, 'headquarters');
  v_recruit_seconds := greatest(
    1,
    ceil(v_unit.recruit_seconds * p_quantity
      * greatest(0.5, 1 - 0.1 * greatest(0, v_headquarters_level - 1)))
  )::bigint;

  select coalesce(max(q.completes_at), v_now) into v_scheduled_start
  from public.recruitment_queue q
  where q.village_id = p_village_id
    and q.status = 'queued'
    and public._unit_facility(q.unit_code) = v_facility;

  update public.village_resources r
  set wood = r.wood - v_wood_needed,
      clay = r.clay - v_clay_needed,
      iron = r.iron - v_iron_needed,
      population = r.population + v_population_needed
  where r.village_id = p_village_id;

  insert into public.recruitment_queue (
    village_id, request_id, unit_code, quantity, started_at, completes_at
  ) values (
    p_village_id, p_request_id, p_unit_code, p_quantity, v_scheduled_start,
    v_scheduled_start + make_interval(secs => v_recruit_seconds)
  );

  return public._village_payload(p_village_id) || public._military_payload(p_village_id);
end;
$$;

create or replace function public.release_troops(
  p_village_id uuid,
  p_unit_code text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_population_to_release integer;
  v_current_quantity bigint;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_village_id is null or not exists (
    select 1 from public.villages v
    where v.id = p_village_id and v.owner_id = auth.uid() and not v.is_barbarian
  ) then
    raise exception 'Eigenes Dorf nicht gefunden' using errcode = 'P0002';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Die Anzahl muss mindestens 1 betragen' using errcode = '22023';
  end if;

  perform 1 from public.villages v where v.id = p_village_id for update;
  perform public._sync_village_economy(p_village_id, clock_timestamp());
  perform public._sync_village_military(p_village_id, clock_timestamp());

  select definition.population_cost into v_population_to_release
  from app_private.unit_definitions definition
  where definition.unit_code = p_unit_code;
  if not found then
    raise exception 'Dieser Einheitentyp ist unbekannt' using errcode = '22023';
  end if;

  select stock.quantity into v_current_quantity
  from public.village_troops stock
  where stock.village_id = p_village_id and stock.unit_code = p_unit_code
  for update;
  if coalesce(v_current_quantity, 0) < p_quantity then
    raise exception 'Nicht genügend Einheiten im Dorfbestand' using errcode = 'P0001';
  end if;

  update public.village_troops
  set quantity = quantity - p_quantity
  where village_id = p_village_id and unit_code = p_unit_code;

  update public.village_resources
  set population = greatest(0, population - v_population_to_release * p_quantity)
  where village_id = p_village_id;

  return public._village_payload(p_village_id) || public._military_payload(p_village_id);
end;
$$;

revoke all on function public._unit_facility(text) from public, anon, authenticated;
revoke all on function public._unit_is_unlocked(uuid, text) from public, anon, authenticated;
revoke all on function public._sync_village_military(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public._military_payload(uuid) from public, anon, authenticated;
revoke all on function public.get_my_starting_village() from public, anon;
revoke all on function public.get_village_state(uuid) from public, anon;
revoke all on function public.start_recruitment(uuid, text, integer, uuid) from public, anon;
revoke all on function public.release_troops(uuid, text, integer) from public, anon;
grant execute on function public.get_my_starting_village() to authenticated;
grant execute on function public.get_village_state(uuid) to authenticated;
grant execute on function public.start_recruitment(uuid, text, integer, uuid) to authenticated;
grant execute on function public.release_troops(uuid, text, integer) to authenticated;
