alter table public.village_resources
  add column population integer not null default 100 check (population >= 0),
  add column population_capacity integer not null default 240 check (population_capacity >= 0),
  add column economy_last_updated_at timestamptz not null default now(),
  add column wood_remainder numeric not null default 0 check (wood_remainder >= 0 and wood_remainder < 1),
  add column clay_remainder numeric not null default 0 check (clay_remainder >= 0 and clay_remainder < 1),
  add column iron_remainder numeric not null default 0 check (iron_remainder >= 0 and iron_remainder < 1);

update public.village_resources r
set wood = least(r.wood, floor(1000 * power(1.5, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'warehouse'
    ), 0))))::bigint),
    clay = least(r.clay, floor(1000 * power(1.5, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'warehouse'
    ), 0))))::bigint),
    iron = least(r.iron, floor(1000 * power(1.5, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'warehouse'
    ), 0))))::bigint),
    food = least(r.food, floor(1000 * power(1.5, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'warehouse'
    ), 0))))::bigint),
    population = case when r.population = 0 then 100 else r.population end,
    population_capacity = floor(240 * power(1.2, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'farm'
    ), 0))))::integer,
    storage_capacity = floor(1000 * power(1.5, greatest(0, coalesce((
      select b.level - 1
      from public.village_buildings b
      where b.village_id = r.village_id and b.building_code = 'warehouse'
    ), 0))))::bigint;

create table public.construction_queue (
  id uuid primary key default gen_random_uuid(),
  village_id uuid not null references public.villages (id) on delete cascade,
  request_id uuid not null,
  building_code text not null check (
    building_code in (
      'headquarters', 'woodcutter', 'clay_pit', 'iron_mine', 'farm',
      'warehouse', 'barracks', 'smithy', 'stable', 'workshop', 'market', 'rally_point'
    )
  ),
  target_level integer not null check (target_level between 2 and 20),
  started_at timestamptz not null,
  completes_at timestamptz not null check (completes_at > started_at),
  status text not null default 'queued' check (status in ('queued', 'completed')),
  created_at timestamptz not null default now(),
  unique (village_id, request_id)
);

create index construction_queue_pending_idx
  on public.construction_queue (village_id, completes_at, id)
  where status = 'queued';

alter table public.construction_queue enable row level security;
revoke all on public.construction_queue from anon, authenticated;

create or replace function public._economy_level(p_village_id uuid, p_building_code text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select b.level
    from public.village_buildings b
    where b.village_id = p_village_id and b.building_code = p_building_code
  ), 0);
$$;

create or replace function public._economy_rate(p_village_id uuid, p_building_code text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public._economy_level(p_village_id, p_building_code) = 0 then 0
    else floor(30 * power(1.2, public._economy_level(p_village_id, p_building_code) - 1))::bigint
  end;
$$;

create or replace function public._economy_storage_capacity(p_village_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select floor(1000 * power(1.5, greatest(0, public._economy_level(p_village_id, 'warehouse') - 1)))::bigint;
$$;

create or replace function public._economy_population_capacity(p_village_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select floor(240 * power(1.2, greatest(0, public._economy_level(p_village_id, 'farm') - 1)))::integer;
$$;

create or replace function public._building_upgrade_cost(
  p_building_code text,
  p_target_level integer
)
returns table (wood_cost bigint, clay_cost bigint, iron_cost bigint)
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select
    floor(base.wood * power(1.26, p_target_level - 2))::bigint,
    floor(base.clay * power(1.26, p_target_level - 2))::bigint,
    floor(base.iron * power(1.26, p_target_level - 2))::bigint
  from (values
    ('headquarters', 90, 80, 70),
    ('woodcutter', 60, 50, 40),
    ('clay_pit', 50, 60, 40),
    ('iron_mine', 60, 50, 60),
    ('warehouse', 100, 100, 50),
    ('farm', 45, 40, 30),
    ('barracks', 90, 90, 70),
    ('smithy', 120, 110, 80),
    ('stable', 150, 100, 120),
    ('workshop', 180, 160, 120),
    ('market', 100, 120, 80),
    ('rally_point', 80, 70, 60)
  ) as base(building_code, wood, clay, iron)
  where base.building_code = p_building_code;
$$;

create or replace function public._building_upgrade_seconds(
  p_target_level integer,
  p_headquarters_level integer
)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select greatest(
    30,
    floor(
      60 * power(1.7, p_target_level - 2)
      * greatest(0.5, 1 - 0.1 * greatest(0, p_headquarters_level - 1))
    )
  )::bigint;
$$;

create or replace function public._accrue_village_resources(
  p_village_id uuid,
  p_elapsed_seconds numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stock public.village_resources%rowtype;
  capacity bigint;
  wood_total numeric;
  clay_total numeric;
  iron_total numeric;
begin
  select r.* into stock
  from public.village_resources r
  where r.village_id = p_village_id
  for update;

  if not found then
    raise exception 'Rohstoffbestand des Dorfs fehlt' using errcode = 'P0002';
  end if;

  capacity := public._economy_storage_capacity(p_village_id);
  wood_total := stock.wood + stock.wood_remainder
    + public._economy_rate(p_village_id, 'woodcutter') * greatest(0, p_elapsed_seconds) / 3600;
  clay_total := stock.clay + stock.clay_remainder
    + public._economy_rate(p_village_id, 'clay_pit') * greatest(0, p_elapsed_seconds) / 3600;
  iron_total := stock.iron + stock.iron_remainder
    + public._economy_rate(p_village_id, 'iron_mine') * greatest(0, p_elapsed_seconds) / 3600;

  update public.village_resources
  set wood = least(capacity, floor(wood_total)::bigint),
      wood_remainder = case when wood_total >= capacity then 0 else wood_total - floor(wood_total) end,
      clay = least(capacity, floor(clay_total)::bigint),
      clay_remainder = case when clay_total >= capacity then 0 else clay_total - floor(clay_total) end,
      iron = least(capacity, floor(iron_total)::bigint),
      iron_remainder = case when iron_total >= capacity then 0 else iron_total - floor(iron_total) end,
      storage_capacity = capacity,
      population_capacity = public._economy_population_capacity(p_village_id)
  where village_id = p_village_id;
end;
$$;

create or replace function public._sync_village_economy(
  p_village_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cursor_at timestamptz;
  next_job public.construction_queue%rowtype;
begin
  select r.economy_last_updated_at into cursor_at
  from public.village_resources r
  where r.village_id = p_village_id
  for update;

  if not found then
    raise exception 'Rohstoffbestand des Dorfs fehlt' using errcode = 'P0002';
  end if;

  loop
    select q.* into next_job
    from public.construction_queue q
    where q.village_id = p_village_id
      and q.status = 'queued'
      and q.completes_at <= p_now
    order by q.completes_at, q.id
    limit 1
    for update;

    exit when not found;

    perform public._accrue_village_resources(
      p_village_id,
      greatest(0, extract(epoch from (next_job.completes_at - cursor_at)))
    );

    insert into public.village_buildings (village_id, building_code, level)
    values (p_village_id, next_job.building_code, next_job.target_level)
    on conflict (village_id, building_code)
    do update set level = greatest(public.village_buildings.level, excluded.level);

    update public.construction_queue
    set status = 'completed'
    where id = next_job.id;

    cursor_at := greatest(cursor_at, next_job.completes_at);
  end loop;

  perform public._accrue_village_resources(
    p_village_id,
    greatest(0, extract(epoch from (p_now - cursor_at)))
  );

  update public.village_resources
  set economy_last_updated_at = greatest(economy_last_updated_at, p_now)
  where village_id = p_village_id;
end;
$$;

create or replace function public._village_payload(p_village_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', v.id,
    'world_id', v.world_id,
    'name', v.name,
    'x', v.x,
    'y', v.y,
    'points', v.points,
    'resources', jsonb_build_object(
      'wood', r.wood,
      'clay', r.clay,
      'iron', r.iron,
      'food', r.food,
      'storage_capacity', r.storage_capacity,
      'population', r.population,
      'population_capacity', r.population_capacity
    ),
    'buildings', coalesce((
      select jsonb_object_agg(b.building_code, b.level)
      from public.village_buildings b
      where b.village_id = v.id
    ), '{}'::jsonb),
    'production_per_hour', jsonb_build_object(
      'wood', public._economy_rate(v.id, 'woodcutter'),
      'clay', public._economy_rate(v.id, 'clay_pit'),
      'iron', public._economy_rate(v.id, 'iron_mine')
    ),
    'construction_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'building_code', q.building_code,
        'target_level', q.target_level,
        'started_at', q.started_at,
        'completes_at', q.completes_at,
        'remaining_seconds', greatest(0, ceil(extract(epoch from (q.completes_at - now())))::bigint)
      ) order by q.started_at, q.id)
      from public.construction_queue q
      where q.village_id = v.id and q.status = 'queued'
    ), '[]'::jsonb),
    'building_quotes', (
      select jsonb_object_agg(quotes.building_code, jsonb_build_object(
        'target_level', quotes.target_level,
        'costs', jsonb_build_object(
          'wood', costs.wood_cost,
          'clay', costs.clay_cost,
          'iron', costs.iron_cost
        ),
        'build_seconds', public._building_upgrade_seconds(
          quotes.target_level,
          public._economy_level(v.id, 'headquarters') + quotes.queued_headquarters
        )
      ))
      from (
        select codes.building_code,
          (public._economy_level(v.id, codes.building_code)
            + (select count(*) from public.construction_queue pending
               where pending.village_id = v.id and pending.building_code = codes.building_code
                 and pending.status = 'queued') + 1)::integer as target_level,
          (select count(*) from public.construction_queue pending
           where pending.village_id = v.id and pending.building_code = 'headquarters'
             and pending.status = 'queued')::integer as queued_headquarters
        from (values
          ('headquarters'), ('woodcutter'), ('clay_pit'), ('iron_mine'), ('farm'),
          ('warehouse'), ('barracks'), ('smithy'), ('stable'), ('workshop'), ('market'), ('rally_point')
        ) as codes(building_code)
      ) quotes
      cross join lateral public._building_upgrade_cost(quotes.building_code, quotes.target_level) costs
    )
  )
  from public.villages v
  join public.village_resources r on r.village_id = v.id
  where v.id = p_village_id;
$$;

create or replace function public.get_my_starting_village()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_village_id uuid;
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

  perform public._sync_village_economy(v_village_id, clock_timestamp());
  return public._village_payload(v_village_id);
end;
$$;

create or replace function public.start_building_upgrade(
  p_building_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_village_id uuid;
  existing_request uuid;
  village_now timestamptz := clock_timestamp();
  scheduled_start timestamptz;
  target_level integer;
  headquarters_level integer;
  build_seconds bigint;
  costs record;
  stock public.village_resources%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'Eine Anfragekennung ist erforderlich' using errcode = '22023';
  end if;
  if p_building_code is null or p_building_code not in (
    'headquarters', 'woodcutter', 'clay_pit', 'iron_mine', 'farm',
    'warehouse', 'barracks', 'smithy', 'stable', 'workshop', 'market', 'rally_point'
  ) then
    raise exception 'Dieses Gebäude ist nicht ausbaubar' using errcode = '22023';
  end if;

  select v.id into v_village_id
  from public.villages v
  where v.owner_id = auth.uid() and not v.is_barbarian
  order by v.created_at, v.id
  limit 1
  for update;

  if v_village_id is null then
    raise exception 'Eigenes Dorf nicht gefunden' using errcode = 'P0002';
  end if;

  perform public._sync_village_economy(v_village_id, village_now);

  select q.id into existing_request
  from public.construction_queue q
  where q.village_id = v_village_id and q.request_id = p_request_id;
  if existing_request is not null then
    return public._village_payload(v_village_id);
  end if;

  target_level := public._economy_level(v_village_id, p_building_code)
    + (select count(*) from public.construction_queue q
       where q.village_id = v_village_id and q.building_code = p_building_code and q.status = 'queued')
    + 1;
  if target_level > 20 then
    raise exception 'Die höchste Ausbaustufe ist bereits erreicht oder vorgemerkt' using errcode = '22023';
  end if;

  select coalesce(max(q.completes_at), village_now) into scheduled_start
  from public.construction_queue q
  where q.village_id = v_village_id and q.status = 'queued';

  headquarters_level := public._economy_level(v_village_id, 'headquarters')
    + (select count(*) from public.construction_queue q
       where q.village_id = v_village_id and q.building_code = 'headquarters' and q.status = 'queued');
  build_seconds := public._building_upgrade_seconds(target_level, headquarters_level);
  select * into costs from public._building_upgrade_cost(p_building_code, target_level);

  select r.* into stock
  from public.village_resources r
  where r.village_id = v_village_id
  for update;

  if stock.wood < costs.wood_cost or stock.clay < costs.clay_cost or stock.iron < costs.iron_cost then
    raise exception 'Nicht genügend Rohstoffe für diesen Ausbau' using errcode = 'P0001';
  end if;

  update public.village_resources r
  set wood = r.wood - costs.wood_cost,
      clay = r.clay - costs.clay_cost,
      iron = r.iron - costs.iron_cost
  where r.village_id = v_village_id;

  insert into public.construction_queue (
    village_id, request_id, building_code, target_level, started_at, completes_at
  )
  values (
    v_village_id,
    p_request_id,
    p_building_code,
    target_level,
    scheduled_start,
    scheduled_start + make_interval(secs => build_seconds)
  );

  return public._village_payload(v_village_id);
end;
$$;

revoke all on function public._economy_level(uuid, text) from public, anon, authenticated;
revoke all on function public._economy_rate(uuid, text) from public, anon, authenticated;
revoke all on function public._economy_storage_capacity(uuid) from public, anon, authenticated;
revoke all on function public._economy_population_capacity(uuid) from public, anon, authenticated;
revoke all on function public._building_upgrade_cost(text, integer) from public, anon, authenticated;
revoke all on function public._building_upgrade_seconds(integer, integer) from public, anon, authenticated;
revoke all on function public._accrue_village_resources(uuid, numeric) from public, anon, authenticated;
revoke all on function public._sync_village_economy(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public._village_payload(uuid) from public, anon, authenticated;
revoke all on function public.get_my_starting_village() from public, anon;
revoke all on function public.start_building_upgrade(text, uuid) from public, anon;
grant execute on function public.get_my_starting_village() to authenticated;
grant execute on function public.start_building_upgrade(text, uuid) to authenticated;
