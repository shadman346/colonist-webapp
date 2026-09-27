-- All writes are made by the authenticated Edge Function through narrowly granted
-- RPCs in the next migration. Browser clients can only read member-scoped rows.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique check (invite_code ~ '^[A-F0-9]{16}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'in_game', 'completed', 'closed')),
  max_players smallint not null default 4 check (max_players in (3, 4)),
  mode text not null default 'base' check (mode = 'base'),
  map text not null default 'base' check (map = 'base'),
  victory_points smallint not null default 10 check (victory_points = 10),
  turn_timer_seconds smallint,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint turn_timer_disabled check (turn_timer_seconds is null)
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_no smallint check (seat_no between 0 and 3),
  display_name text not null check (char_length(display_name) between 1 and 24),
  status text not null default 'active' check (status in ('active', 'left', 'kicked')),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint active_member_has_seat check (status <> 'active' or seat_no is not null)
);
create unique index room_members_active_seat on public.room_members(room_id, seat_no) where status = 'active';
create index room_members_user_active on public.room_members(user_id, room_id) where status = 'active';

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_game_per_room on public.games(room_id) where status = 'active';
create index games_room_created on public.games(room_id, created_at desc);

create table public.game_views (
  game_id uuid not null references public.games(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  view jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index game_views_user_room on public.game_views(user_id, room_id);

create table public.room_events (
  room_id uuid not null references public.rooms(id) on delete cascade,
  revision bigint not null,
  kind text not null,
  actor_id uuid references auth.users(id) on delete set null,
  public_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (room_id, revision)
);

-- This schema is never exposed by the Data API or Realtime. It contains the
-- server-owned seed, deck, hidden hands, and command receipts.
create table private.game_states (
  game_id uuid primary key references public.games(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  state jsonb not null,
  seed text not null,
  updated_at timestamptz not null default now()
);

create table private.command_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  scope text not null check (scope in ('room', 'game')),
  target_id uuid not null,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, action_id)
);
create index command_receipts_target on private.command_receipts(scope, target_id, created_at desc);
alter table private.game_states enable row level security;
alter table private.command_receipts enable row level security;
revoke all on all tables in schema private from public, anon, authenticated, service_role;

-- Used by RLS and Realtime authorization. A caller only learns whether its
-- own verified auth UID is an active member of the supplied room.
create function private.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.room_members as m
    where m.room_id = p_room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;
revoke execute on function private.is_room_member(uuid) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.games enable row level security;
alter table public.game_views enable row level security;
alter table public.room_events enable row level security;

create policy rooms_active_members_read on public.rooms for select to authenticated
using ((select private.is_room_member(id)));
create policy room_members_active_members_read on public.room_members for select to authenticated
using ((select private.is_room_member(room_id)));
create policy games_active_members_read on public.games for select to authenticated
using ((select private.is_room_member(room_id)));
create policy game_views_own_read on public.game_views for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_room_member(room_id)));
create policy room_events_active_members_read on public.room_events for select to authenticated
using ((select private.is_room_member(room_id)));

-- Explicit grants work whether automatic Data API exposure is enabled or not.
revoke all on public.rooms, public.room_members, public.games, public.game_views, public.room_events from anon, authenticated;
grant select on public.rooms, public.room_members, public.games, public.game_views, public.room_events to authenticated;

-- Do not ALTER realtime.messages: Supabase owns that table and already enables
-- RLS. Only a member may subscribe to room:<uuid>; clients cannot broadcast.
create policy private_room_revisions on realtime.messages for select to authenticated
using (
  case
    when (select realtime.topic()) ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (select private.is_room_member(substring((select realtime.topic()) from 6)::uuid))
    else false
  end
);

create function private.broadcast_room_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('roomId', new.id, 'revision', new.revision),
    'revision', 'room:' || new.id::text, true
  );
  return new;
end;
$$;
revoke execute on function private.broadcast_room_revision() from public, anon, authenticated, service_role;
create trigger room_revision_broadcast after update of revision on public.rooms
for each row when (new.revision <> old.revision)
execute function private.broadcast_room_revision();

create function private.broadcast_game_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('roomId', new.room_id, 'gameId', new.id, 'revision', new.revision),
    'game-revision', 'room:' || new.room_id::text, true
  );
  return new;
end;
$$;
revoke execute on function private.broadcast_game_revision() from public, anon, authenticated, service_role;
create trigger game_revision_broadcast after update of revision on public.games
for each row when (new.revision <> old.revision)
execute function private.broadcast_game_revision();
