begin;
select plan(21);

select has_table('public', 'troop_movements', 'troop movements are persisted');
select has_table('public', 'combat_reports', 'combat and scouting reports are persisted');
select has_column('public', 'troop_movements', 'request_id', 'movement requests support idempotency');

select ok((select relrowsecurity from pg_class where oid = 'public.troop_movements'::regclass), 'movement RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.combat_reports'::regclass), 'report RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.troop_movements', 'SELECT'), 'authenticated clients cannot query movements directly');
select ok(not has_table_privilege('authenticated', 'public.troop_movements', 'INSERT'), 'authenticated clients cannot insert movements directly');
select ok(not has_table_privilege('authenticated', 'public.combat_reports', 'SELECT'), 'authenticated clients cannot query reports directly');

select has_function('public', 'send_troop_movement', array['uuid', 'uuid', 'text', 'jsonb', 'uuid'], 'movement dispatch uses a server RPC');
select has_function('public', 'get_movement_overview', array[]::text[], 'movement and report access uses a server RPC');
select ok(has_function_privilege('authenticated', 'public.send_troop_movement(uuid,uuid,text,jsonb,uuid)', 'EXECUTE'), 'authenticated clients can request movements');
select ok(not has_function_privilege('anon', 'public.send_troop_movement(uuid,uuid,text,jsonb,uuid)', 'EXECUTE'), 'anonymous clients cannot request movements');
select ok(not has_function_privilege('authenticated', 'public._resolve_troop_movement(uuid,timestamp with time zone)', 'EXECUTE'), 'clients cannot directly resolve combat');

select is(public._movement_attack_power('{"spearman":10}'::jsonb), 100::numeric, 'attack power sums unit counts and attack values');
select is(public._movement_defense_power('{"spearman":10}'::jsonb, '{"spearman":10}'::jsonb, 1), 275::numeric, 'infantry defense includes the rally-point fortification');
select is(public._movement_defense_power('{"spearman":10}'::jsonb, '{"scout":1}'::jsonb, 1), 575::numeric, 'cavalry defense is weighted by the incoming composition');
select is(public._movement_seconds('{"spearman":1}'::jsonb, 1), 1080::bigint, 'server travel time uses the slowest unit');
select is(public._movement_population_cost('{"spearman":10}'::jsonb), 10, 'population loss follows unit population cost');
select is(public._movement_carry_capacity('{"spearman":10}'::jsonb), 250::bigint, 'loot capacity follows surviving unit carry values');
select is(public._movement_losses('{"spearman":10}'::jsonb, 0.5), '{"spearman":5}'::jsonb, 'casualties are bounded by sent unit counts');
select is(public._movement_subtract('{"spearman":10}'::jsonb, '{"spearman":5}'::jsonb), '{"spearman":5}'::jsonb, 'survivors cannot become negative');

select * from finish();
rollback;
