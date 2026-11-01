-- Kronenreich: Grundlage fuer Truppenbewegungen und Kampfberichte
-- Diese Migration legt nur neue Tabellen und eine Bewegungsgeschwindigkeit an.
-- Bestehende Doerfer, Gebaeude, Truppen und Rekrutierungen werden nicht veraendert.

begin;

-- Reisezeit je Feldeinheit. Die Weltgeschwindigkeit wird spaeter bei der
-- Berechnung der Ankunftszeit beruecksichtigt.
alter table public.unit_types
  add column if not exists speed_minutes_per_field numeric(8,2) not null default 18.00;

update public.unit_types
set speed_minutes_per_field = case code
  when 'spear' then 18.00
  when 'sword' then 22.00
  when 'axe' then 18.00
  when 'archer' then 18.00
  when 'light_cavalry' then 10.00
  when 'heavy_cavalry' then 11.00
  when 'ram' then 30.00
  when 'catapult' then 30.00
  when 'paladin' then 10.00
  else speed_minutes_per_field
end;

do $
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unit_types_speed_minutes_per_field_check'
      and conrelid = 'public.unit_types'::regclass
  ) then
    alter table public.unit_types
      add constraint unit_types_speed_minutes_per_field_check
      check (speed_minutes_per_field > 0);
  end if;
end
$;

-- Eine Zeile pro Reisebewegung. Truppen werden beim Start serverseitig
-- aus dem Ursprungsdorf abgezogen; die Einheiten werden separat gespeichert.
create table if not exists public.troop_movements (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete restrict,
  owner_player_id uuid not null references public.players(id) on delete restrict,
  origin_village_id uuid not null references public.villages(id) on delete restrict,
  target_village_id uuid not null references public.villages(id) on delete restrict,
  movement_type text not null
    check (movement_type in ('attack', 'return')),
  status text not null default 'traveling'
    check (status in ('traveling', 'resolved', 'cancelled')),
  parent_movement_id uuid null
    references public.troop_movements(id) on delete restrict,
  sent_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint troop_movements_distinct_villages_check
    check (origin_village_id <> target_village_id),
  constraint troop_movements_arrival_check
    check (arrives_at > sent_at),
  constraint troop_movements_parent_type_check
    check (
      (movement_type = 'attack' and parent_movement_id is null)
      or (movement_type = 'return' and parent_movement_id is not null)
    )
);

create index if not exists troop_movements_due_idx
  on public.troop_movements (status, arrives_at);

create index if not exists troop_movements_owner_idx
  on public.troop_movements (owner_player_id, created_at desc);

create index if not exists troop_movements_target_idx
  on public.troop_movements (target_village_id, status, arrives_at);

-- Einheiten pro Bewegung, normalisiert und gegen unit_types abgesichert.
create table if not exists public.troop_movement_units (
  movement_id uuid not null
    references public.troop_movements(id) on delete cascade,
  unit_code text not null
    references public.unit_types(code) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (movement_id, unit_code)
);

-- Ein Bericht pro ausgewertetem Angriff. Die JSONB-Felder sind unveraenderliche
-- Momentaufnahmen fuer den spaeteren Bericht im Spiel.
create table if not exists public.battle_reports (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null unique
    references public.troop_movements(id) on delete restrict,
  world_id uuid not null references public.worlds(id) on delete restrict,
  attacker_player_id uuid not null references public.players(id) on delete restrict,
  defender_player_id uuid null references public.players(id) on delete set null,
  attacker_village_id uuid not null references public.villages(id) on delete restrict,
  defender_village_id uuid not null references public.villages(id) on delete restrict,
  outcome text not null
    check (outcome in ('attacker_won', 'defender_won', 'draw')),
  attacker_units_sent jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attacker_units_sent) = 'object'),
  defender_units_before jsonb not null default '{}'::jsonb
    check (jsonb_typeof(defender_units_before) = 'object'),
  attacker_losses jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attacker_losses) = 'object'),
  defender_losses jsonb not null default '{}'::jsonb
    check (jsonb_typeof(defender_losses) = 'object'),
  attacker_survivors jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attacker_survivors) = 'object'),
  loot jsonb not null default '{"wood":0,"clay":0,"iron":0}'::jsonb
    check (jsonb_typeof(loot) = 'object'),
  wall_level_before integer not null default 0 check (wall_level_before >= 0),
  wall_level_after integer not null default 0 check (wall_level_after >= 0),
  building_damage jsonb not null default '{}'::jsonb
    check (jsonb_typeof(building_damage) = 'object'),
  attacker_power numeric(18,2) not null default 0 check (attacker_power >= 0),
  defender_power numeric(18,2) not null default 0 check (defender_power >= 0),
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint battle_reports_distinct_villages_check
    check (attacker_village_id <> defender_village_id)
);

create index if not exists battle_reports_attacker_idx
  on public.battle_reports (attacker_player_id, resolved_at desc);

create index if not exists battle_reports_defender_idx
  on public.battle_reports (defender_player_id, resolved_at desc);

-- Leserechte nur fuer beteiligte Spieler. Schreibzugriffe erfolgen spaeter
-- ausschliesslich ueber abgesicherte SECURITY DEFINER-RPCs.
alter table public.troop_movements enable row level security;
alter table public.troop_movement_units enable row level security;
alter table public.battle_reports enable row level security;

drop policy if exists "Players can read own troop movements"
  on public.troop_movements;
create policy "Players can read own troop movements"
  on public.troop_movements
  for select to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id = troop_movements.owner_player_id
        and p.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Players can read units in own troop movements"
  on public.troop_movement_units;
create policy "Players can read units in own troop movements"
  on public.troop_movement_units
  for select to authenticated
  using (
    exists (
      select 1
      from public.troop_movements tm
      join public.players p on p.id = tm.owner_player_id
      where tm.id = troop_movement_units.movement_id
        and p.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Players can read own battle reports"
  on public.battle_reports;
create policy "Players can read own battle reports"
  on public.battle_reports
  for select to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.profile_id = (select auth.uid())
        and p.id in (
          battle_reports.attacker_player_id,
          battle_reports.defender_player_id
        )
    )
  );

revoke all on public.troop_movements from anon, authenticated;
revoke all on public.troop_movement_units from anon, authenticated;
revoke all on public.battle_reports from anon, authenticated;

grant select on public.troop_movements to authenticated;
grant select on public.troop_movement_units to authenticated;
grant select on public.battle_reports to authenticated;

commit;
