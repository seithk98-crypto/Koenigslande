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
