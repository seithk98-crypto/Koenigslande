-- Kronenreich: Erweiterung des Truppenkaders
-- Sicher: ergänzt/aktualisiert nur Einheitendefinitionen. Vorhandene Truppenbestände bleiben unangetastet.

begin;

insert into public.unit_types (
  code, name, required_building_code, required_building_level,
  wood_cost, clay_cost, iron_cost, population_cost, build_seconds,
  attack, defense_infantry, defense_cavalry, carry_capacity
)
values
  ('axe', 'Axtkämpfer', 'barracks', 2, 60, 30, 40, 1, 180, 40, 10, 5, 10),
  ('archer', 'Bogenschütze', 'barracks', 3, 100, 30, 60, 1, 240, 25, 50, 40, 10),
  ('light_cavalry', 'Leichte Kavallerie', 'stable', 1, 125, 100, 250, 4, 300, 130, 30, 40, 80),
  ('heavy_cavalry', 'Schwere Kavallerie', 'stable', 3, 200, 150, 600, 6, 600, 150, 200, 80, 50),
  ('ram', 'Rammbock', 'workshop', 1, 300, 200, 200, 5, 900, 2, 20, 50, 0),
  ('catapult', 'Katapult', 'workshop', 3, 320, 400, 100, 8, 1200, 100, 100, 50, 0),
  ('paladin', 'Paladin', 'smithy', 8, 200, 200, 500, 10, 1800, 150, 250, 200, 100)
on conflict (code) do update set
  name = excluded.name,
  required_building_code = excluded.required_building_code,
  required_building_level = excluded.required_building_level,
  wood_cost = excluded.wood_cost,
  clay_cost = excluded.clay_cost,
  iron_cost = excluded.iron_cost,
  population_cost = excluded.population_cost,
  build_seconds = excluded.build_seconds,
  attack = excluded.attack,
  defense_infantry = excluded.defense_infantry,
  defense_cavalry = excluded.defense_cavalry,
  carry_capacity = excluded.carry_capacity;

commit;
