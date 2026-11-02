alter table public.alliances drop constraint alliances_founder_id_fkey;
alter table public.alliances
  add constraint alliances_founder_id_fkey
  foreign key (founder_id) references public.profiles (id) on delete cascade;

alter table public.alliances drop constraint alliances_founder_membership_fk;
alter table public.alliances
  add constraint alliances_founder_membership_fk
  foreign key (id, founder_id) references public.alliance_members (alliance_id, player_id)
  on delete cascade deferrable initially deferred;
