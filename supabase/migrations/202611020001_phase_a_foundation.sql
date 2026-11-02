create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);

create table public.worlds (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.world_tiles (
  world_id uuid not null references public.worlds (id) on delete cascade,
  x integer not null check (x between -100 and 100),
  y integer not null check (y between -100 and 100),
  terrain text not null check (terrain in ('plains', 'forest', 'hills', 'marsh')),
  primary key (world_id, x, y)
);

create table public.villages (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id),
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 32),
  x integer not null,
  y integer not null,
  points integer not null default 100 check (points >= 0),
  is_barbarian boolean not null default false,
  created_at timestamptz not null default now(),
  unique (world_id, x, y),
  check (
    (is_barbarian and owner_id is null)
    or (not is_barbarian and owner_id is not null)
  ),
  foreign key (world_id, x, y) references public.world_tiles (world_id, x, y)
);

create table public.village_resources (
  village_id uuid primary key references public.villages (id) on delete cascade,
  wood bigint not null default 0 check (wood >= 0),
  clay bigint not null default 0 check (clay >= 0),
  iron bigint not null default 0 check (iron >= 0),
  food bigint not null default 0 check (food >= 0),
  storage_capacity bigint not null default 1000 check (storage_capacity >= 0)
);

create table public.village_buildings (
  village_id uuid not null references public.villages (id) on delete cascade,
  building_code text not null check (
    building_code in (
      'headquarters', 'woodcutter', 'clay_pit', 'iron_mine', 'farm',
      'warehouse', 'barracks', 'smithy', 'stable', 'workshop', 'market', 'rally_point'
    )
  ),
  level integer not null default 1 check (level between 1 and 20),
  primary key (village_id, building_code)
);

create index world_tiles_region_idx on public.world_tiles (world_id, y, x);
create index villages_owner_idx on public.villages (owner_id, created_at);

alter table public.profiles enable row level security;
alter table public.worlds enable row level security;
alter table public.world_tiles enable row level security;
alter table public.villages enable row level security;
alter table public.village_resources enable row level security;
alter table public.village_buildings enable row level security;

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles, public.worlds, public.world_tiles, public.villages,
  public.village_resources, public.village_buildings from anon, authenticated;
grant select, update on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_name text;
begin
  requested_name := btrim(new.raw_user_meta_data ->> 'display_name');
  if requested_name is null or char_length(requested_name) not between 3 and 24 then
    requested_name := 'Herrscher-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_name);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, username)
select
  users.id,
  case
    when char_length(btrim(users.raw_user_meta_data ->> 'display_name')) between 3 and 24
      then btrim(users.raw_user_meta_data ->> 'display_name')
    else 'Herrscher-' || left(replace(users.id::text, '-', ''), 6)
  end
from auth.users users
on conflict (id) do nothing;

insert into public.worlds (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'koenigslande', 'Königslande')
on conflict (id) do nothing;

insert into public.world_tiles (world_id, x, y, terrain)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  x,
  y,
  case
    when mod(abs((x * 31 + y * 17 + x * y * 7)::bigint), 100) < 12 then 'marsh'
    when mod(abs((x * 31 + y * 17 + x * y * 7)::bigint), 100) < 31 then 'hills'
    when mod(abs((x * 31 + y * 17 + x * y * 7)::bigint), 100) < 57 then 'forest'
    else 'plains'
  end
from generate_series(-100, 100) as x
cross join generate_series(-100, 100) as y
on conflict (world_id, x, y) do nothing;

insert into public.villages (world_id, name, x, y, points, is_barbarian)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  seed.name,
  seed.x,
  seed.y,
  seed.points,
  true
from (values
  ('Rabenfels', 6, 2, 120),
  ('Wolfsbruch', -12, 8, 145),
  ('Eichenwacht', 18, -9, 185),
  ('Moorstein', -22, -15, 110),
  ('Dornhain', 31, 17, 160),
  ('Krähenfurt', -35, 22, 130),
  ('Steinwacht', 42, -28, 210),
  ('Nebelgrund', -48, -36, 175),
  ('Falkenruh', 57, 41, 195)
) as seed(name, x, y, points)
on conflict (world_id, x, y) do nothing;

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
      'storage_capacity', r.storage_capacity
    ),
    'buildings', coalesce((
      select jsonb_object_agg(b.building_code, b.level)
      from public.village_buildings b
      where b.village_id = v.id
    ), '{}'::jsonb)
  )
  from public.villages v
  join public.village_resources r on r.village_id = v.id
  where v.id = p_village_id;
$$;

revoke all on function public._village_payload(uuid) from public, anon, authenticated;

create or replace function public.get_my_starting_village()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;

  select public._village_payload(v.id)
  into result
  from public.villages v
  where v.owner_id = auth.uid() and not v.is_barbarian
  order by v.created_at, v.id
  limit 1;

  return result;
end;
$$;

create or replace function public.found_starting_village(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_world_id constant uuid := '00000000-0000-0000-0000-000000000001';
  user_id uuid := auth.uid();
  village_id uuid;
  spawn_x integer;
  spawn_y integer;
  village_name text := btrim(p_name);
begin
  if user_id is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if village_name is null or char_length(village_name) not between 3 and 32 then
    raise exception 'Der Dorfname muss 3 bis 32 Zeichen lang sein' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_world_id::text)::bigint);

  select v.id into village_id
  from public.villages v
  where v.owner_id = user_id and not v.is_barbarian
  order by v.created_at, v.id
  limit 1;

  if village_id is not null then
    return public._village_payload(village_id);
  end if;

  select tile.x, tile.y
  into spawn_x, spawn_y
  from public.world_tiles tile
  where tile.world_id = target_world_id
    and tile.x between -30 and 30
    and tile.y between -30 and 30
    and not exists (
      select 1
      from public.villages occupied
      where occupied.world_id = tile.world_id
        and abs(occupied.x - tile.x) + abs(occupied.y - tile.y) < 8
    )
  order by abs(tile.x) + abs(tile.y), tile.y, tile.x
  for update of tile skip locked
  limit 1;

  if spawn_x is null then
    raise exception 'Im Startgebiet wurde kein freier Siedlungsplatz gefunden' using errcode = 'P0001';
  end if;

  insert into public.villages (world_id, owner_id, name, x, y, points, is_barbarian)
  values (target_world_id, user_id, village_name, spawn_x, spawn_y, 100, false)
  returning id into village_id;

  insert into public.village_resources (village_id, wood, clay, iron, food, storage_capacity)
  values (village_id, 250, 220, 180, 300, 1000);

  insert into public.village_buildings (village_id, building_code, level)
  values
    (village_id, 'headquarters', 1),
    (village_id, 'woodcutter', 1),
    (village_id, 'clay_pit', 1),
    (village_id, 'iron_mine', 1),
    (village_id, 'farm', 1),
    (village_id, 'warehouse', 1),
    (village_id, 'barracks', 1),
    (village_id, 'smithy', 1),
    (village_id, 'stable', 1),
    (village_id, 'workshop', 1),
    (village_id, 'market', 1),
    (village_id, 'rally_point', 1);

  return public._village_payload(village_id);
end;
$$;

create or replace function public.get_world_map(
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
  is_barbarian boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich' using errcode = '28000';
  end if;
  if p_radius not between 4 and 20 then
    raise exception 'Der Kartenradius muss zwischen 4 und 20 liegen' using errcode = '22023';
  end if;

  return query
  select
    tile.x,
    tile.y,
    tile.terrain,
    village.id,
    village.name,
    profile.username,
    village.points,
    village.is_barbarian
  from public.world_tiles tile
  left join public.villages village
    on village.world_id = tile.world_id and village.x = tile.x and village.y = tile.y
  left join public.profiles profile on profile.id = village.owner_id
  where tile.world_id = '00000000-0000-0000-0000-000000000001'::uuid
    and tile.x between greatest(-100, p_center_x - p_radius) and least(100, p_center_x + p_radius)
    and tile.y between greatest(-100, p_center_y - p_radius) and least(100, p_center_y + p_radius)
  order by tile.y desc, tile.x;
end;
$$;

revoke all on function public.get_my_starting_village() from public, anon;
revoke all on function public.found_starting_village(text) from public, anon;
revoke all on function public.get_world_map(integer, integer, integer) from public, anon;
grant execute on function public.get_my_starting_village() to authenticated;
grant execute on function public.found_starting_village(text) to authenticated;
grant execute on function public.get_world_map(integer, integer, integer) to authenticated;
