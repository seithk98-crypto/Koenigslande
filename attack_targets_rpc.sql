-- Kronenreich: oeffentliche Angriffsziele der eigenen Welt
-- Gibt nur Dorfname und Koordinaten zur Zielauswahl aus, keine Ressourcen oder Truppen.

begin;

create or replace function public.get_attack_targets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_world_id uuid;
  v_player_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Du musst angemeldet sein.';
  end if;

  select p.id, p.world_id
    into v_player_id, v_world_id
  from public.players p
  where p.profile_id = auth.uid()
  order by p.created_at
  limit 1;

  if not found then
    raise exception 'Für dein Konto wurde kein Spieler gefunden.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'x', v.x,
        'y', v.y
      )
      order by v.x, v.y
    ),
    '[]'::jsonb
  )
  into v_result
  from public.villages v
  where v.world_id = v_world_id
    and v.owner_player_id <> v_player_id;

  return v_result;
end;
$function$;

revoke all on function public.get_attack_targets() from public;
revoke all on function public.get_attack_targets() from anon;
grant execute on function public.get_attack_targets() to authenticated;

commit;
