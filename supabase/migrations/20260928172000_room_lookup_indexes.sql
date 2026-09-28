-- Keep invite creation and membership cleanup responsive as rooms accumulate.
create index rooms_host_created on public.rooms(host_user_id, created_at desc);
create index game_views_room on public.game_views(room_id);
create index room_events_actor on public.room_events(actor_id) where actor_id is not null;
