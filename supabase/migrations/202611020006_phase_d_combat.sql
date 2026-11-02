insert into public.village_resources (village_id, wood, clay, iron, food, storage_capacity)
select v.id, 0, 0, 0, 0, 1000
from public.villages v
left join public.village_resources r on r.village_id = v.id
where r.village_id is null;

insert into public.village_buildings (village_id, building_code, level)
select v.id, 'rally_point', 1
from public.villages v
where not exists (
  select 1 from public.village_buildings b
  where b.village_id = v.id and b.building_code = 'rally_point'
);

create table public.troop_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_village_id uuid not null references public.villages (id) on delete cascade,
  target_village_id uuid not null references public.villages (id) on delete cascade,
  parent_movement_id uuid references public.troop_movements (id) on delete set null,
  movement_type text not null check (movement_type in ('attack', 'scout', 'return')),
  troops jsonb not null check (jsonb_typeof(troops) = 'object'),
  sent_at timestamptz not null,
  arrives_at timestamptz not null,
  status text not null default 'travelling' check (status in ('travelling', 'returning', 'resolved', 'completed')),
  result jsonb,
  processed_at timestamptz,
  request_id uuid,
  created_at timestamptz not null default now(),
  check (source_village_id <> target_village_id),
  check (arrives_at > sent_at),
  unique (owner_id, request_id)
);

create index troop_movements_due_idx
  on public.troop_movements (arrives_at, id)
  where status in ('travelling', 'returning');
create index troop_movements_target_idx
  on public.troop_movements (target_village_id, arrives_at)
  where status = 'travelling';

create table public.combat_reports (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.troop_movements (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  report_type text not null check (report_type in ('combat', 'scout')),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  created_at timestamptz not null default now(),
  unique (movement_id, viewer_id, report_type)
);

create index combat_reports_viewer_idx
  on public.combat_reports (viewer_id, created_at desc);

alter table public.troop_movements enable row level security;
alter table public.combat_reports enable row level security;
revoke all on public.troop_movements, public.combat_reports from anon, authenticated;

create or replace function public._movement_distance(p_source uuid, p_target uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sqrt(
    power((source.x - target.x)::numeric, 2)
    + power((source.y - target.y)::numeric, 2)
  )
  from public.villages source
  join public.villages target on target.id = p_target
  where source.id = p_source;
$$;

create or replace function public._movement_seconds(p_troops jsonb, p_distance numeric)
returns bigint
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select greatest(1, ceil(
    p_distance * max(definition.speed_minutes_per_field) * 60
  ))::bigint
  from jsonb_each_text(p_troops) troop
  join app_private.unit_definitions definition on definition.unit_code = troop.key
  where troop.value::integer > 0;
$$;

create or replace function public._movement_attack_power(p_troops jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(sum(troop.value::numeric * definition.attack), 0)
  from jsonb_each_text(p_troops) troop
  join app_private.unit_definitions definition on definition.unit_code = troop.key;
$$;

create or replace function public._movement_defense_power(
  p_defenders jsonb,
  p_attackers jsonb,
  p_fortification_level integer
)
returns numeric
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  with attacking as (
    select
      coalesce(sum(troop.value::numeric) filter (where definition.category = 'Kavallerie'), 0) as cavalry,
      coalesce(sum(troop.value::numeric) filter (where definition.category <> 'Kavallerie'), 0) as infantry
    from jsonb_each_text(p_attackers) troop
    join app_private.unit_definitions definition on definition.unit_code = troop.key
  ),
  composition as (
    select
      case when cavalry + infantry = 0 then 0.5 else cavalry / (cavalry + infantry) end as cavalry_ratio,
      case when cavalry + infantry = 0 then 0.5 else infantry / (cavalry + infantry) end as infantry_ratio
    from attacking
  )
  select
    coalesce(sum(
      troop.value::numeric
      * (definition.defense_infantry * composition.infantry_ratio
        + definition.defense_cavalry * composition.cavalry_ratio)
    ), 0)
    + 100 * (1 + greatest(0, p_fortification_level) * 0.25)
  from jsonb_each_text(p_defenders) troop
  join app_private.unit_definitions definition on definition.unit_code = troop.key
  cross join composition;
$$;

create or replace function public._movement_population_cost(p_troops jsonb)
returns integer
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(sum(troop.value::integer * definition.population_cost), 0)::integer
  from jsonb_each_text(p_troops) troop
  join app_private.unit_definitions definition on definition.unit_code = troop.key;
$$;

create or replace function public._movement_losses(p_troops jsonb, p_loss_ratio numeric)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(jsonb_object_agg(troop.key, least(
    troop.value::integer,
    floor(troop.value::numeric * greatest(0, least(1, p_loss_ratio)))::integer
  )), '{}'::jsonb)
  from jsonb_each_text(p_troops) troop;
$$;

create or replace function public._movement_subtract(p_troops jsonb, p_losses jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_object_agg(troop.key, greatest(
    0,
    troop.value::integer - coalesce((p_losses ->> troop.key)::integer, 0)
  )), '{}'::jsonb)
  from jsonb_each_text(p_troops) troop;
$$;

create or replace function public._movement_total(p_troops jsonb)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(sum(troop.value::bigint), 0)
  from jsonb_each_text(p_troops) troop;
$$;

create or replace function public._movement_carry_capacity(p_troops jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(sum(troop.value::bigint * definition.carry_capacity), 0)
  from jsonb_each_text(p_troops) troop
  join app_private.unit_definitions definition on definition.unit_code = troop.key;
$$;

create or replace function public._movement_loot(
  p_source_village_id uuid,
  p_target_village_id uuid,
  p_capacity bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_stock public.village_resources%rowtype;
  target_stock public.village_resources%rowtype;
  remaining bigint := greatest(0, p_capacity);
  free_wood bigint;
  free_clay bigint;
  free_iron bigint;
  loot_wood bigint;
  loot_clay bigint;
  loot_iron bigint;
begin
  select r.* into source_stock
  from public.village_resources r
  where r.village_id = p_source_village_id
  for update;
  if not found then
    raise exception 'Rohstoffbestand des Ausgangsdorfs fehlt' using errcode = 'P0002';
  end if;

  select r.* into target_stock
  from public.village_resources r
  where r.village_id = p_target_village_id
  for update;
  if not found then
    raise exception 'Rohstoffbestand des Zieldorfs fehlt' using errcode = 'P0002';
  end if;

  free_wood := greatest(0, source_stock.storage_capacity - source_stock.wood);
  free_clay := greatest(0, source_stock.storage_capacity - source_stock.clay);
  free_iron := greatest(0, source_stock.storage_capacity - source_stock.iron);
  remaining := least(remaining, free_wood + free_clay + free_iron);
  loot_wood := least(target_stock.wood, free_wood, remaining);
  remaining := remaining - loot_wood;
  loot_clay := least(target_stock.clay, free_clay, remaining);
  remaining := remaining - loot_clay;
  loot_iron := least(target_stock.iron, free_iron, remaining);

  update public.village_resources
  set wood = wood - loot_wood,
      clay = clay - loot_clay,
      iron = iron - loot_iron
  where village_id = p_target_village_id;

  update public.village_resources
  set wood = wood + loot_wood,
      clay = clay + loot_clay,
      iron = iron + loot_iron
  where village_id = p_source_village_id;

  return jsonb_build_object('wood', loot_wood, 'clay', loot_clay, 'iron', loot_iron);
end;
$$;

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

create or replace function public._resolve_troop_movement(
  p_movement_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  movement public.troop_movements%rowtype;
  target_owner uuid;
  target_is_barbarian boolean;
  source_name text;
  target_name text;
  source_x integer;
  source_y integer;
  target_x integer;
  target_y integer;
  defenders jsonb;
  attacker_losses jsonb;
  defender_losses jsonb;
  attacker_survivors jsonb;
  defender_survivors jsonb;
  attack_strength numeric;
  defense_strength numeric;
  roll numeric;
  scout_count bigint;
  defender_scouts bigint;
  success_probability numeric;
  spy_loss_ratio numeric;
  loot jsonb := '{"wood":0,"clay":0,"iron":0}'::jsonb;
  loot_capacity bigint;
  winner text;
  return_id uuid;
  troop record;
  defenders_visible jsonb;
  scout_report jsonb;
begin
  select m.* into movement
  from public.troop_movements m
  where m.id = p_movement_id
  for update;

  if not found or movement.status not in ('travelling', 'returning') or movement.arrives_at > p_now then
    return;
  end if;

  perform v.id
  from public.villages v
  where v.id in (movement.source_village_id, movement.target_village_id)
  order by v.id
  for update;

  if movement.movement_type = 'return' then
    perform public._sync_village_economy(movement.target_village_id, p_now);
    perform public._sync_village_military(movement.target_village_id, p_now);

    for troop in select key, value from jsonb_each_text(movement.troops)
    loop
      insert into public.village_troops (village_id, unit_code, quantity)
      values (movement.target_village_id, troop.key, troop.value::bigint)
      on conflict (village_id, unit_code)
      do update set quantity = public.village_troops.quantity + excluded.quantity;
    end loop;

    update public.troop_movements
    set status = 'completed', processed_at = p_now
    where id = movement.id;
    return;
  end if;

  select v.name, v.x, v.y
  into source_name, source_x, source_y
  from public.villages v where v.id = movement.source_village_id;
  select v.owner_id, v.name, v.x, v.y
  into target_owner, target_name, target_x, target_y
  from public.villages v where v.id = movement.target_village_id;

  perform public._sync_village_economy(movement.source_village_id, p_now);
  perform public._sync_village_economy(movement.target_village_id, p_now);
  perform public._sync_village_military(movement.source_village_id, p_now);
  perform public._sync_village_military(movement.target_village_id, p_now);

  select coalesce(jsonb_object_agg(stock.unit_code, stock.quantity), '{}'::jsonb)
  into defenders
  from public.village_troops stock
  where stock.village_id = movement.target_village_id and stock.quantity > 0;

  if movement.movement_type = 'scout' then
    select coalesce((movement.troops ->> 'scout')::bigint, 0) into scout_count;
    select coalesce((defenders ->> 'scout')::bigint, 0) into defender_scouts;
    success_probability := greatest(0.05, least(
      0.95,
      0.15 + scout_count::numeric / greatest(1, defender_scouts)::numeric * 0.08
    ));
    roll := random();
    spy_loss_ratio := least(
      0.9,
      0.1 + defender_scouts::numeric / greatest(1, scout_count)::numeric * 0.75
    );
    attacker_losses := public._movement_losses(movement.troops, spy_loss_ratio);
    attacker_survivors := public._movement_subtract(movement.troops, attacker_losses);

    if roll <= success_probability then
      select coalesce(jsonb_object_agg(stock.unit_code, stock.quantity), '{}'::jsonb)
      into defenders_visible
      from public.village_troops stock
      where stock.village_id = movement.target_village_id and stock.quantity > 0;
      select jsonb_build_object('wood', r.wood, 'clay', r.clay, 'iron', r.iron)
      into scout_report
      from public.village_resources r where r.village_id = movement.target_village_id;
      insert into public.combat_reports (movement_id, viewer_id, report_type, report_data)
      values (movement.id, movement.owner_id, 'scout', jsonb_build_object(
        'result', 'success',
        'origin', jsonb_build_object('id', movement.source_village_id, 'name', source_name, 'x', source_x, 'y', source_y),
        'target', jsonb_build_object('id', movement.target_village_id, 'name', target_name, 'x', target_x, 'y', target_y),
        'arrived_at', movement.arrives_at,
        'scouts_sent', scout_count,
        'scouts_lost', (attacker_losses ->> 'scout')::bigint,
        'scouts_returned', (attacker_survivors ->> 'scout')::bigint,
        'intel', jsonb_build_object(
          'troops', coalesce(defenders_visible, '{}'::jsonb),
          'resources', coalesce(scout_report, '{"wood":0,"clay":0,"iron":0}'::jsonb)
        )
      ))
      on conflict (movement_id, viewer_id, report_type) do nothing;
    else
      insert into public.combat_reports (movement_id, viewer_id, report_type, report_data)
      values (movement.id, movement.owner_id, 'scout', jsonb_build_object(
        'result', 'failed',
        'origin', jsonb_build_object('id', movement.source_village_id, 'name', source_name, 'x', source_x, 'y', source_y),
        'target', jsonb_build_object('id', movement.target_village_id, 'name', target_name, 'x', target_x, 'y', target_y),
        'arrived_at', movement.arrives_at,
        'scouts_sent', scout_count,
        'scouts_lost', (attacker_losses ->> 'scout')::bigint,
        'scouts_returned', (attacker_survivors ->> 'scout')::bigint,
        'message', 'Die Späher konnten keine verwertbaren Informationen erlangen.'
      ))
      on conflict (movement_id, viewer_id, report_type) do nothing;
    end if;

    update public.village_resources
    set population = greatest(0, population - public._movement_population_cost(attacker_losses))
    where village_id = movement.source_village_id;

    return_id := public._create_return_movement(
      movement.id, movement.owner_id, movement.target_village_id,
      movement.source_village_id, attacker_survivors, p_now
    );
    update public.troop_movements
    set status = 'resolved', processed_at = p_now,
        result = jsonb_build_object('result', case when roll <= success_probability then 'success' else 'failed' end,
          'return_movement_id', return_id)
    where id = movement.id;
    return;
  end if;

  select public._movement_defense_power(
    defenders,
    movement.troops,
    coalesce((
      select b.level from public.village_buildings b
      where b.village_id = movement.target_village_id and b.building_code = 'rally_point'
    ), 0)
  ) into defense_strength;
  select public._movement_attack_power(movement.troops) into attack_strength;
  roll := 0.9 + random() * 0.2;
  attack_strength := attack_strength * roll;

  if attack_strength >= defense_strength then
    winner := 'attacker';
    attacker_losses := public._movement_losses(movement.troops, least(0.8, defense_strength / greatest(1, attack_strength)));
    defender_losses := defenders;
  else
    winner := 'defender';
    attacker_losses := movement.troops;
    defender_losses := public._movement_losses(defenders, least(0.8, attack_strength / greatest(1, defense_strength)));
  end if;

  attacker_survivors := public._movement_subtract(movement.troops, attacker_losses);
  defender_survivors := public._movement_subtract(defenders, defender_losses);

  for troop in select key, value from jsonb_each_text(defender_losses)
  loop
    update public.village_troops
    set quantity = greatest(0, quantity - troop.value::bigint)
    where village_id = movement.target_village_id and unit_code = troop.key;
  end loop;
  for troop in select key, value from jsonb_each_text(attacker_losses)
  loop
    update public.village_resources
    set population = greatest(0, population - troop.value::integer * (
      select definition.population_cost
      from app_private.unit_definitions definition where definition.unit_code = troop.key
    ))
    where village_id = movement.source_village_id;
  end loop;
  for troop in select key, value from jsonb_each_text(defender_losses)
  loop
    update public.village_resources
    set population = greatest(0, population - troop.value::integer * (
      select definition.population_cost
      from app_private.unit_definitions definition where definition.unit_code = troop.key
    ))
    where village_id = movement.target_village_id;
  end loop;

  if winner = 'attacker' then
    loot_capacity := public._movement_carry_capacity(attacker_survivors);
    loot := public._movement_loot(movement.source_village_id, movement.target_village_id, loot_capacity);
  end if;

  return_id := public._create_return_movement(
    movement.id, movement.owner_id, movement.target_village_id,
    movement.source_village_id, attacker_survivors, p_now
  );
  insert into public.combat_reports (movement_id, viewer_id, report_type, report_data)
  values (
    movement.id, movement.owner_id, 'combat',
    jsonb_build_object(
      'result', winner,
      'origin', jsonb_build_object('id', movement.source_village_id, 'name', source_name, 'x', source_x, 'y', source_y),
      'target', jsonb_build_object('id', movement.target_village_id, 'name', target_name, 'x', target_x, 'y', target_y),
      'arrived_at', movement.arrives_at,
      'attack_strength', round(attack_strength, 2),
      'defense_strength', round(defense_strength, 2),
      'random_factor', round(roll, 4),
      'attacking_troops', movement.troops,
      'defending_troops', defenders,
      'attacker_losses', attacker_losses,
      'defender_losses', defender_losses,
      'attacker_survivors', attacker_survivors,
      'defender_survivors', defender_survivors,
      'loot', loot,
      'return_movement_id', return_id
    )
  )
  on conflict (movement_id, viewer_id, report_type) do nothing;

  if target_owner is not null then
    insert into public.combat_reports (movement_id, viewer_id, report_type, report_data)
    values (
      movement.id, target_owner, 'combat',
      jsonb_build_object(
        'result', case when winner = 'attacker' then 'defeat' else 'defense' end,
        'origin', jsonb_build_object('name', source_name, 'x', source_x, 'y', source_y),
        'target', jsonb_build_object('id', movement.target_village_id, 'name', target_name, 'x', target_x, 'y', target_y),
        'arrived_at', movement.arrives_at,
        'attack_strength', round(attack_strength, 2),
        'defense_strength', round(defense_strength, 2),
        'defending_troops', defenders,
        'defender_losses', defender_losses,
        'defender_survivors', defender_survivors,
        'loot', loot
      )
    )
    on conflict (movement_id, viewer_id, report_type) do nothing;
  end if;

  update public.troop_movements
  set status = 'resolved', processed_at = p_now,
      result = jsonb_build_object(
        'winner', winner,
        'attacker_losses', attacker_losses,
        'defender_losses', defender_losses,
        'attacker_survivors', attacker_survivors,
        'defender_survivors', defender_survivors,
        'loot', loot,
        'return_movement_id', return_id
      )
  where id = movement.id;
end;
$$;

create or replace function public._process_due_movements(p_user_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  due_movement uuid;
begin
  loop
    select m.id into due_movement
    from public.troop_movements m
    join public.villages target on target.id = m.target_village_id
    where m.status in ('travelling', 'returning')
      and m.arrives_at <= p_now
      and (m.owner_id = p_user_id or target.owner_id = p_user_id)
    order by m.arrives_at, m.id
    limit 1
    for update of m skip locked;

    exit when not found;
    perform public._resolve_troop_movement(due_movement, p_now);
  end loop;
end;
$$;

create or replace function public.send_troop_movement(
  p_source_village_id uuid,
  p_target_village_id uuid,
  p_movement_type text,
  p_troops jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  distance numeric;
  travel_seconds bigint;
  existing_id uuid;
  target_owner uuid;
  troop record;
  available bigint;
  normalized_troops jsonb := '{}'::jsonb;
  movement_id uuid;
  target_is_barbarian boolean;
begin
  if user_id is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_movement_type is null or p_movement_type not in ('attack', 'scout') then
    raise exception 'Ungültige Bewegungsart' using errcode = '22023';
  end if;
  perform public._process_due_movements(user_id, v_now);
  if p_request_id is null then
    raise exception 'Eine Anfragekennung ist erforderlich' using errcode = '22023';
  end if;
  if p_source_village_id is null or p_target_village_id is null
    or p_source_village_id = p_target_village_id
    or jsonb_typeof(p_troops) <> 'object'
    or public._movement_total(p_troops) < 1 then
    raise exception 'Quelle, Ziel und Truppen müssen gültig sein' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.villages source
    where source.id = p_source_village_id and source.owner_id = user_id and not source.is_barbarian
  ) then
    raise exception 'Das Ausgangsdorf gehört dir nicht' using errcode = '42501';
  end if;

  perform v.id
  from public.villages v
  where v.id in (p_source_village_id, p_target_village_id)
  order by v.id
  for update;

  select v.owner_id into target_owner
  from public.villages v
  where v.id = p_target_village_id;
  select v.is_barbarian into target_is_barbarian
  from public.villages v
  where v.id = p_target_village_id;
  if target_owner = user_id or (target_owner is null and not coalesce(target_is_barbarian, false)) then
    raise exception 'Du kannst dieses eigene oder unbekannte Dorf nicht angreifen' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.villages source
    join public.villages target on target.id = p_target_village_id
    where source.id = p_source_village_id and source.world_id = target.world_id
  ) then
    raise exception 'Quelle und Ziel müssen in derselben Welt liegen' using errcode = '22023';
  end if;


  perform public._sync_village_economy(p_source_village_id, v_now);
  perform public._sync_village_military(p_source_village_id, v_now);

  select m.id into existing_id
  from public.troop_movements m
  where m.owner_id = user_id and m.request_id = p_request_id;
  if existing_id is not null then
    return public.get_movement_overview();
  end if;

  for troop in select key, value from jsonb_each_text(p_troops)
  loop
    if troop.value !~ '^[1-9][0-9]*$' then
      raise exception 'Truppenanzahlen müssen positive ganze Zahlen sein' using errcode = '22023';
    end if;
    if not exists (
      select 1 from app_private.unit_definitions definition
      where definition.unit_code = troop.key
    ) then
      raise exception 'Unbekannter Einheitentyp: %', troop.key using errcode = '22023';
    end if;
    if p_movement_type = 'scout' and troop.key <> 'scout' then
      raise exception 'Spähbewegungen dürfen nur Späher enthalten' using errcode = '22023';
    end if;

    select coalesce((
      select stock.quantity
      from public.village_troops stock
      where stock.village_id = p_source_village_id and stock.unit_code = troop.key
      for update
    ), 0) into available;
    if available < troop.value::bigint then
      raise exception 'Nicht genügend Einheiten im Ausgangsdorf: %', troop.key using errcode = 'P0001';
    end if;
    normalized_troops := normalized_troops || jsonb_build_object(troop.key, troop.value::bigint);
  end loop;

  distance := public._movement_distance(p_source_village_id, p_target_village_id);
  travel_seconds := public._movement_seconds(normalized_troops, distance);

  for troop in select key, value from jsonb_each_text(normalized_troops)
  loop
    update public.village_troops
    set quantity = quantity - troop.value::bigint
    where village_id = p_source_village_id and unit_code = troop.key;
  end loop;

  insert into public.troop_movements (
    owner_id, source_village_id, target_village_id, movement_type,
    troops, sent_at, arrives_at, status, request_id
  ) values (
    user_id, p_source_village_id, p_target_village_id, p_movement_type,
    normalized_troops, v_now, v_now + make_interval(secs => travel_seconds),
    'travelling', p_request_id
  )
  returning id into movement_id;

  return public.get_movement_overview();
end;
$$;

create or replace function public.get_movement_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if user_id is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;

  perform public._process_due_movements(user_id, v_now);

  return jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'x', v.x, 'y', v.y,
        'troops', coalesce((
          select jsonb_object_agg(unit.unit_code, coalesce(stock.quantity, 0))
          from app_private.unit_definitions unit
          left join public.village_troops stock
            on stock.village_id = v.id and stock.unit_code = unit.unit_code
        ), '{}'::jsonb)
      ) order by v.created_at, v.id)
      from public.villages v
      where v.owner_id = user_id and not v.is_barbarian
    ), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'x', v.x, 'y', v.y,
        'owner_name', profile.username, 'is_barbarian', v.is_barbarian
      ) order by v.y, v.x)
      from public.villages v
      left join public.profiles profile on profile.id = v.owner_id
      where v.world_id = '00000000-0000-0000-0000-000000000001'::uuid
        and (v.owner_id is null or v.owner_id <> user_id)
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'movement_type', m.movement_type, 'status', m.status,
        'source_village_id', m.source_village_id, 'source_name', source.name,
        'source_x', source.x, 'source_y', source.y,
        'target_village_id', m.target_village_id, 'target_name', target.name,
        'target_x', target.x, 'target_y', target.y,
        'troops', case when m.owner_id = user_id then m.troops else null end,
        'arrives_at', m.arrives_at,
        'remaining_seconds', greatest(0, ceil(extract(epoch from (m.arrives_at - v_now)))::bigint),
        'is_incoming', target.owner_id = user_id and m.owner_id <> user_id
      ) order by m.arrives_at, m.id)
      from public.troop_movements m
      join public.villages source on source.id = m.source_village_id
      join public.villages target on target.id = m.target_village_id
      where m.status in ('travelling', 'returning')
        and (m.owner_id = user_id or target.owner_id = user_id)
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'movement_id', recent.movement_id,
        'report_type', recent.report_type, 'report_data', recent.report_data,
        'created_at', recent.created_at
      ) order by recent.created_at desc, recent.id desc)
      from (
        select report.id, report.movement_id, report.report_type, report.report_data, report.created_at
        from public.combat_reports report
        where report.viewer_id = user_id
        order by report.created_at desc, report.id desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_my_starting_village()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_village_id uuid;
begin
  if user_id is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;

  perform public._process_due_movements(user_id, v_now);

  select v.id into v_village_id
  from public.villages v
  where v.owner_id = user_id and not v.is_barbarian
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

revoke all on function public._movement_distance(uuid, uuid) from public, anon, authenticated;
revoke all on function public._movement_seconds(jsonb, numeric) from public, anon, authenticated;
revoke all on function public._movement_attack_power(jsonb) from public, anon, authenticated;
revoke all on function public._movement_defense_power(jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public._movement_population_cost(jsonb) from public, anon, authenticated;
revoke all on function public._movement_losses(jsonb, numeric) from public, anon, authenticated;
revoke all on function public._movement_subtract(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._movement_total(jsonb) from public, anon, authenticated;
revoke all on function public._movement_carry_capacity(jsonb) from public, anon, authenticated;
revoke all on function public._movement_loot(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public._create_return_movement(uuid, uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public._resolve_troop_movement(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public._process_due_movements(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.send_troop_movement(uuid, uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.get_movement_overview() from public, anon;
revoke all on function public.get_my_starting_village() from public, anon;
grant execute on function public.send_troop_movement(uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.get_movement_overview() to authenticated;
grant execute on function public.get_my_starting_village() to authenticated;
