begin;
select plan(15);

select has_table('public', 'construction_queue', 'construction queue exists');
select has_column('public', 'village_resources', 'population', 'villages track population');
select has_column('public', 'village_resources', 'population_capacity', 'farms track population capacity');
select has_column('public', 'village_resources', 'economy_last_updated_at', 'offline production has a server timestamp');
select has_column('public', 'village_resources', 'wood_remainder', 'fractional production is retained');
select has_column('public', 'village_resources', 'clay_remainder', 'clay production remainder is retained');
select has_column('public', 'village_resources', 'iron_remainder', 'iron production remainder is retained');

select ok((select relrowsecurity from pg_class where oid = 'public.construction_queue'::regclass), 'construction queue RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.construction_queue', 'SELECT'), 'authenticated clients cannot read the queue directly');
select ok(not has_table_privilege('authenticated', 'public.construction_queue', 'INSERT'), 'authenticated clients cannot insert queue items directly');
select has_function('public', 'start_building_upgrade', array['text', 'uuid'], 'building upgrades use a server RPC');
select ok(has_function_privilege('authenticated', 'public.start_building_upgrade(text,uuid)', 'EXECUTE'), 'authenticated clients can request an upgrade');
select ok(not has_function_privilege('anon', 'public.start_building_upgrade(text,uuid)', 'EXECUTE'), 'anonymous clients cannot request an upgrade');
select ok(not has_function_privilege('authenticated', 'public._sync_village_economy(uuid,timestamp with time zone)', 'EXECUTE'), 'clients cannot directly invoke economy settlement');
select ok(not has_function_privilege('authenticated', 'public._accrue_village_resources(uuid,numeric)', 'EXECUTE'), 'clients cannot directly accrue resources');

select * from finish();
rollback;
