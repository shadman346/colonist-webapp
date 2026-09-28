-- Keep new rooms and changed capacities on the matching board size.
create function private.sync_room_map() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.map := case when new.max_players >= 5 then 'large' else 'base' end;
  return new;
end;
$$;
revoke execute on function private.sync_room_map() from public, anon, authenticated, service_role;
create trigger sync_room_map_before_capacity
before insert or update of max_players on public.rooms
for each row execute function private.sync_room_map();

update public.rooms
set map = case when max_players >= 5 then 'large' else 'base' end
where map is distinct from case when max_players >= 5 then 'large' else 'base' end;
alter table public.rooms add constraint room_map_matches_capacity
check (map = case when max_players >= 5 then 'large' else 'base' end);
