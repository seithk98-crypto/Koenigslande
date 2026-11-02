begin;
select plan(16);

select has_table('public', 'profiles', 'profiles exist');
select has_table('public', 'worlds', 'worlds exist');
select has_table('public', 'world_tiles', 'world tiles exist');
select has_table('public', 'villages', 'villages exist');
select has_table('public', 'village_resources', 'village resources exist');
select has_table('public', 'village_buildings', 'village buildings exist');

select is((select count(*) from public.world_tiles), 40401::bigint, 'world I has 201 by 201 persistent tiles');
select is((
  select count(*) from public.villages
  where world_id = '00000000-0000-0000-0000-000000000001'
    and (x, y) in ((6,2),(-12,8),(18,-9),(-22,-15),(31,17),(-35,22),(42,-28),(-48,-36),(57,41))
), 9::bigint, 'the nine seeded settlements persist after captures');

select ok((select relrowsecurity from pg_class where oid = 'public.villages'::regclass), 'village RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.village_resources'::regclass), 'resource RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.village_buildings'::regclass), 'building RLS is enabled');

select ok(not has_function_privilege('anon', 'public.get_world_map(integer,integer,integer)', 'EXECUTE'), 'anonymous role cannot query the world RPC');
select ok(has_function_privilege('authenticated', 'public.get_world_map(integer,integer,integer)', 'EXECUTE'), 'authenticated role can query the world RPC');
select ok(not has_table_privilege('authenticated', 'public.villages', 'SELECT'), 'authenticated role cannot read village rows directly');
select ok(not has_table_privilege('authenticated', 'public.village_resources', 'UPDATE'), 'authenticated role cannot update resources directly');
select throws_ok(
	$$select * from public.get_world_map(0, 0, 10)$$,
	'28000',
	'Anmeldung erforderlich',
	'world RPC rejects requests without an authenticated user'
);

select * from finish();
rollback;