-- Kronenreich: sicheren Angriff starten
-- Truppen werden atomar aus dem Ursprungsdorf abgezogen und als Bewegung gespeichert.

begin;

create or replace function public.start_attack(
  p_origin_village_id uuid,
  p_target_village_id uuid,
  p_units jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_player_id uuid;
  v_origin_world_id uuid;
  v_target_world_id uuid;
  v_target_owner_id uuid;
  v_origin_x integer;
  v_origin_y integer;
  v_target_x integer;
  v_target_y integer;
  v_world_speed numeric;
  v_distance numeric;
  v_max_speed numeric := 0;
  v_travel_seconds integer;
  v_sent_at timestamptz := clock_timestamp();
  v_movement_id uuid;
  v_unit_code text;
  v_quantity_text text;
  v_quantity integer;
  v_available integer;
begin
  if auth.uid() is null then
    raise exception 'Du musst angemeldet sein, um einen Angriff zu starten.';
  end if;

  if p_origin_village_id is null or p_target_village_id is null
     or p_origin_village_id = p_target_village_id then
    raise exception 'Bitte wähle zwei unterschiedliche Dörfer.';
  end if;

  if p_units is null or jsonb_typeof(p_units) <> 'object'
     or p_units = '{}'::jsonb then
    raise exception 'Wähle mindestens eine Einheit für den Angriff.';
  end if;

  -- Sperrt das Ursprungsdorf: parallele Angriffe können denselben Bestand
  -- nicht gleichzeitig verwenden.
  select v.owner_player_id, v.world_id, v.x, v.y
    into v_player_id, v_origin_world_id, v_origin_x, v_origin_y
  from public.villages v
  join public.players p on p.id = v.owner_player_id
  where v.id = p_origin_village_id
    and p.profile_id = auth.uid()
  for update of v;

  if not found then
    raise exception 'Das Ausgangsdorf gehört nicht zu deinem Spieler.';
  end if;

  select v.world_id, v.owner_player_id, v.x, v.y
    into v_target_world_id, v_target_owner_id, v_target_x, v_target_y
  from public.villages v
  where v.id = p_target_village_id;

  if not found then
    raise exception 'Das Zieldorf wurde nicht gefunden.';
  end if;

  if v_target_world_id <> v_origin_world_id then
    raise exception 'Angriffe sind nur innerhalb derselben Welt möglich.';
  end if;

  if v_target_owner_id = v_player_id then
    raise exception 'Du kannst dein eigenes Dorf nicht angreifen.';
  end if;

  select w.speed
    into v_world_speed
  from public.worlds w
  where w.id = v_origin_world_id;

  if v_world_speed is null or v_world_speed <= 0 then
    raise exception 'Die Weltgeschwindigkeit ist ungültig.';
  end if;

  -- Erst alle Angaben prüfen. Bis hierhin wird kein Truppenbestand verändert.
  for v_unit_code, v_quantity_text in
    select e.key, e.value
    from jsonb_each_text(p_units) as e
  loop
    if v_quantity_text !~ '^[1-9][0-9]*$' then
      raise exception 'Die Truppenanzahl für % ist ungültig.', v_unit_code;
    end if;

    v_quantity := v_quantity_text::integer;

    if not exists (
      select 1 from public.unit_types ut where ut.code = v_unit_code
    ) then
      raise exception 'Unbekannter Einheitentyp: %.', v_unit_code;
    end if;

    select vu.quantity
      into v_available
    from public.village_units vu
    where vu.village_id = p_origin_village_id
      and vu.unit_code = v_unit_code
    for update;

    if not found or v_available < v_quantity then
      raise exception 'Nicht genügend Einheiten vom Typ % im Ausgangsdorf.', v_unit_code;
    end if;

    select greatest(v_max_speed, ut.speed_minutes_per_field)
      into v_max_speed
    from public.unit_types ut
    where ut.code = v_unit_code;
  end loop;

  if v_max_speed <= 0 then
    raise exception 'Für diese Truppen ist keine gültige Reisegeschwindigkeit hinterlegt.';
  end if;

  v_distance := sqrt(
    power((v_target_x - v_origin_x)::numeric, 2)
    + power((v_target_y - v_origin_y)::numeric, 2)
  );

  v_travel_seconds := greatest(
    1,
    ceil(v_distance * v_max_speed * 60 / v_world_speed)::integer
  );

  insert into public.troop_movements (
    world_id, owner_player_id, origin_village_id, target_village_id,
    movement_type, status, sent_at, arrives_at
  )
  values (
    v_origin_world_id, v_player_id, p_origin_village_id, p_target_village_id,
    'attack', 'traveling', v_sent_at,
    v_sent_at + make_interval(secs => v_travel_seconds)
  )
  returning id into v_movement_id;

  -- Bestand abziehen und die Truppen der Bewegung zuordnen.
  for v_unit_code, v_quantity_text in
    select e.key, e.value
    from jsonb_each_text(p_units) as e
  loop
    v_quantity := v_quantity_text::integer;

    update public.village_units vu
      set quantity = vu.quantity - v_quantity
    where vu.village_id = p_origin_village_id
      and vu.unit_code = v_unit_code;

    delete from public.village_units vu
    where vu.village_id = p_origin_village_id
      and vu.unit_code = v_unit_code
      and vu.quantity = 0;

    insert into public.troop_movement_units (movement_id, unit_code, quantity)
    values (v_movement_id, v_unit_code, v_quantity);
  end loop;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'status', 'traveling',
    'arrives_at', v_sent_at + make_interval(secs => v_travel_seconds),
    'distance', round(v_distance, 2),
    'travel_seconds', v_travel_seconds
  );
end;
$function$;

revoke all on function public.start_attack(uuid, uuid, jsonb) from public;
revoke all on function public.start_attack(uuid, uuid, jsonb) from anon;
grant execute on function public.start_attack(uuid, uuid, jsonb) to authenticated;

commit;
