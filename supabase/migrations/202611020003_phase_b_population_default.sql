alter table public.village_resources
  alter column population set default 100;

update public.village_resources
set population = 100
where population = 0;
