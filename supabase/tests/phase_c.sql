begin;
select plan(18);

select has_table('app_private', 'unit_definitions', 'central unit balance definitions exist');
select has_table('public', 'village_troops', 'village troop inventory exists');
select has_table('public', 'recruitment_queue', 'recruitment queue exists');
select is((select count(*) from app_private.unit_definitions), 9::bigint, 'all nine unit types are centrally configured');
select is((select count(*) from app_private.unit_definitions where attack >= 0 and defense_infantry >= 0 and defense_cavalry >= 0), 9::bigint, 'all units have combat values');
select is((select count(*) from app_private.unit_definitions where speed_minutes_per_field > 0 and carry_capacity >= 0), 9::bigint, 'all units have movement and carrying values');
select is((select count(*) from app_private.unit_definitions where population_cost > 0 and recruit_seconds > 0), 9::bigint, 'all units have population and training costs');
select is((select count(*) from app_private.unit_definitions where jsonb_typeof(prerequisites) = 'object'), 9::bigint, 'all units have building prerequisites');

select ok((select relrowsecurity from pg_class where oid = 'public.village_troops'::regclass), 'troop inventory RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.recruitment_queue'::regclass), 'recruitment queue RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.village_troops', 'SELECT'), 'authenticated clients cannot directly read troop inventory');
select ok(not has_table_privilege('authenticated', 'public.village_troops', 'INSERT'), 'authenticated clients cannot directly add troops');
select ok(not has_table_privilege('authenticated', 'public.recruitment_queue', 'INSERT'), 'authenticated clients cannot directly create recruitment jobs');

select has_function('public', 'get_village_state', array['uuid'], 'owned village state uses a server RPC');
select has_function('public', 'start_recruitment', array['uuid', 'text', 'integer', 'uuid'], 'recruitment uses a server RPC');
select has_function('public', 'release_troops', array['uuid', 'text', 'integer'], 'troop release uses a server RPC');
select ok(has_function_privilege('authenticated', 'public.start_recruitment(uuid,text,integer,uuid)', 'EXECUTE'), 'authenticated clients can request recruitment');
select ok(not has_function_privilege('anon', 'public.start_recruitment(uuid,text,integer,uuid)', 'EXECUTE'), 'anonymous clients cannot request recruitment');

select * from finish();
rollback;
