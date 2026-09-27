-- These are transaction boundaries for Edge Functions. No browser role can
-- execute them. The Edge Function verifies the JWT, then passes its user ID.
create function public.apply_room_command(
  p_actor uuid,
  p_action_id uuid,
  p_type text,
  p_expected_revision bigint,
  p_room_id uuid default null,
  p_code text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_receipt private.command_receipts%rowtype;
  v_request jsonb;
  v_response jsonb;
  v_name text;
  v_code text;
  v_seat smallint;
  v_max_players smallint;
  v_next_host uuid;
  v_message text;
  v_target_id uuid;
begin
  if p_actor is null or p_action_id is null or p_type is null
     or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_COMMAND' using errcode = 'P0001';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  v_request := jsonb_build_object(
    'type', p_type, 'expectedRevision', p_expected_revision,
    'roomId', p_room_id, 'code', p_code, 'payload', p_payload
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor::text || ':' || p_action_id::text, 0)
  );
  select * into v_receipt from private.command_receipts
  where actor_id = p_actor and action_id = p_action_id;
  if found then
    if v_receipt.scope <> 'room' or v_receipt.request <> v_request then
      raise exception 'ACTION_ID_REUSED' using errcode = 'P0001';
    end if;
    return v_receipt.response;
  end if;

  if p_type = 'CREATE_ROOM' then
    if p_room_id is not null or p_code is not null or p_expected_revision <> 0
       or (p_payload - 'displayName' - 'maxPlayers') <> '{}'::jsonb then
      raise exception 'INVALID_COMMAND' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_payload->'displayName') <> 'string'
       or (p_payload ? 'maxPlayers' and (
         jsonb_typeof(p_payload->'maxPlayers') <> 'number'
         or p_payload->>'maxPlayers' not in ('3', '4')
       )) then
      raise exception 'INVALID_CONFIG' using errcode = 'P0001';
    end if;
    v_name := pg_catalog.btrim(p_payload->>'displayName');
    v_max_players := coalesce((p_payload->>'maxPlayers')::smallint, 4);
    if v_name is null or pg_catalog.char_length(v_name) not between 1 and 24
       or v_max_players not in (3, 4) then
      raise exception 'INVALID_CONFIG' using errcode = 'P0001';
    end if;
    if (select count(*) from public.rooms
        where host_user_id = p_actor and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'ROOM_CREATE_LIMIT' using errcode = 'P0001';
    end if;
    v_code := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(8), 'hex'));
    insert into public.rooms(invite_code, host_user_id, max_players)
    values (v_code, p_actor, v_max_players) returning * into v_room;
    insert into public.room_members(room_id, user_id, seat_no, display_name, is_ready)
    values (v_room.id, p_actor, 0, v_name, true);
    insert into public.room_events(room_id, revision, kind, actor_id)
    values (v_room.id, v_room.revision, 'ROOM_CREATED', p_actor);

  elsif p_type = 'JOIN_ROOM' then
    if p_room_id is not null or p_code is null or p_expected_revision <> 0
       or (p_payload - 'displayName') <> '{}'::jsonb then
      raise exception 'INVALID_COMMAND' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_payload->'displayName') <> 'string' then
      raise exception 'INVALID_NAME' using errcode = 'P0001';
    end if;
    v_name := pg_catalog.btrim(p_payload->>'displayName');
    if v_name is null or pg_catalog.char_length(v_name) not between 1 and 24 then
      raise exception 'INVALID_NAME' using errcode = 'P0001';
    end if;
    select * into v_room from public.rooms
      where invite_code = pg_catalog.upper(pg_catalog.btrim(p_code)) for update;
    if not found then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_room.status not in ('waiting', 'completed') then
      raise exception 'ROOM_NOT_JOINABLE' using errcode = 'P0001';
    end if;
    select * into v_member from public.room_members
      where room_id = v_room.id and user_id = p_actor;
    if found and v_member.status = 'kicked' then
      raise exception 'MEMBER_BLOCKED' using errcode = 'P0001';
    end if;
    if not found or v_member.status = 'left' then
      if (select count(*) from public.room_members
          where room_id = v_room.id and status = 'active') >= v_room.max_players then
        raise exception 'ROOM_FULL' using errcode = 'P0001';
      end if;
      select gs.n::smallint into v_seat
      from pg_catalog.generate_series(0, v_room.max_players - 1) as gs(n)
      where not exists (
        select 1 from public.room_members m
        where m.room_id = v_room.id and m.status = 'active' and m.seat_no = gs.n
      ) order by gs.n limit 1;
      if v_seat is null then
        raise exception 'ROOM_FULL' using errcode = 'P0001';
      end if;
      insert into public.room_members(room_id, user_id, seat_no, display_name)
      values (v_room.id, p_actor, v_seat, v_name)
      on conflict (room_id, user_id) do update set
        seat_no = excluded.seat_no, display_name = excluded.display_name,
        status = 'active', is_ready = false, joined_at = now();
      update public.rooms set revision = revision + 1, updated_at = now()
      where id = v_room.id returning * into v_room;
      insert into public.room_events(room_id, revision, kind, actor_id, public_payload)
      values (v_room.id, v_room.revision, 'MEMBER_JOINED', p_actor,
        jsonb_build_object('seatNo', v_seat, 'displayName', v_name));
    end if;

  else
    if p_room_id is null or p_code is not null then
      raise exception 'INVALID_COMMAND' using errcode = 'P0001';
    end if;
    select * into v_room from public.rooms where id = p_room_id for update;
    if not found then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
    select * into v_member from public.room_members
    where room_id = v_room.id and user_id = p_actor and status = 'active';
    if not found then
      raise exception 'NOT_ROOM_MEMBER' using errcode = 'P0001';
    end if;
    if v_room.revision <> p_expected_revision then
      raise exception 'STALE_REVISION' using errcode = 'P0001';
    end if;

    if p_type = 'SET_CONFIG' then
      if v_room.host_user_id <> p_actor or v_room.status not in ('waiting', 'completed') then
        raise exception 'HOST_ONLY_WAITING' using errcode = 'P0001';
      end if;
      if (p_payload - 'maxPlayers') <> '{}'::jsonb or not (p_payload ? 'maxPlayers') then
        raise exception 'INVALID_CONFIG' using errcode = 'P0001';
      end if;
      if jsonb_typeof(p_payload->'maxPlayers') <> 'number'
         or p_payload->>'maxPlayers' not in ('3', '4') then
        raise exception 'INVALID_CONFIG' using errcode = 'P0001';
      end if;
      v_max_players := (p_payload->>'maxPlayers')::smallint;
      if v_max_players not in (3, 4)
         or (select count(*) from public.room_members
             where room_id = v_room.id and status = 'active') > v_max_players then
        raise exception 'INVALID_CONFIG' using errcode = 'P0001';
      end if;
      if v_max_players <> v_room.max_players then
        -- A departed player can leave a gap below seat 3. Compact the one
        -- out-of-range seat before shrinking to three, so a later join cannot
        -- fill that gap and make the room larger than its configured limit.
        if v_max_players = 3 then
          select gs.n::smallint into v_seat
          from pg_catalog.generate_series(0, 2) as gs(n)
          where not exists (
            select 1 from public.room_members m
            where m.room_id = v_room.id and m.status = 'active'
              and m.seat_no = gs.n
          ) order by gs.n limit 1;
          if v_seat is not null then
            update public.room_members set seat_no = v_seat
            where room_id = v_room.id and status = 'active' and seat_no = 3;
          end if;
        end if;
        update public.room_members set is_ready = false
        where room_id = v_room.id and user_id <> p_actor and status = 'active';
        update public.rooms set max_players = v_max_players,
          revision = revision + 1, updated_at = now()
        where id = v_room.id returning * into v_room;
        insert into public.room_events(room_id, revision, kind, actor_id, public_payload)
        values (v_room.id, v_room.revision, 'CONFIG_CHANGED', p_actor,
          jsonb_build_object('maxPlayers', v_max_players));
      end if;

    elsif p_type = 'SET_READY' then
      if v_room.status not in ('waiting', 'completed') or v_room.host_user_id = p_actor
         or (p_payload - 'ready') <> '{}'::jsonb
         or jsonb_typeof(p_payload->'ready') <> 'boolean' then
        raise exception 'INVALID_READY' using errcode = 'P0001';
      end if;
      if v_member.is_ready <> (p_payload->>'ready')::boolean then
        update public.room_members set is_ready = (p_payload->>'ready')::boolean
        where room_id = v_room.id and user_id = p_actor;
        update public.rooms set revision = revision + 1, updated_at = now()
        where id = v_room.id returning * into v_room;
        insert into public.room_events(room_id, revision, kind, actor_id, public_payload)
        values (v_room.id, v_room.revision, 'READY_CHANGED', p_actor,
          jsonb_build_object('ready', (p_payload->>'ready')::boolean));
      end if;

    elsif p_type = 'SEND_CHAT' then
      if v_room.status not in ('waiting', 'in_game', 'completed')
         or (p_payload - 'message') <> '{}'::jsonb
         or jsonb_typeof(p_payload->'message') <> 'string' then
        raise exception 'INVALID_CHAT' using errcode = 'P0001';
      end if;
      v_message := pg_catalog.btrim(p_payload->>'message');
      if pg_catalog.char_length(v_message) not between 1 and 500 then
        raise exception 'INVALID_CHAT' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.room_events
        where room_id = v_room.id and actor_id = p_actor
          and kind = 'CHAT_MESSAGE'
          and created_at > now() - interval '3 seconds'
      ) then
        raise exception 'CHAT_RATE_LIMIT' using errcode = 'P0001';
      end if;
      update public.rooms set revision = revision + 1, updated_at = now()
      where id = v_room.id returning * into v_room;
      insert into public.room_events(room_id, revision, kind, actor_id, public_payload)
      values (v_room.id, v_room.revision, 'CHAT_MESSAGE', p_actor,
        jsonb_build_object('message', v_message));

    elsif p_type = 'KICK_MEMBER' then
      if v_room.host_user_id <> p_actor
         or v_room.status not in ('waiting', 'completed')
         or (p_payload - 'userId') <> '{}'::jsonb
         or not (p_payload ? 'userId')
         or jsonb_typeof(p_payload->'userId') <> 'string'
         or (p_payload->>'userId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'INVALID_KICK' using errcode = 'P0001';
      end if;
      v_target_id := (p_payload->>'userId')::uuid;
      if v_target_id = p_actor then
        raise exception 'INVALID_KICK' using errcode = 'P0001';
      end if;
      update public.room_members set status = 'kicked', seat_no = null,
        is_ready = false where room_id = v_room.id
        and user_id = v_target_id and status = 'active';
      if not found then
        raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
      end if;
      update public.rooms set revision = revision + 1, updated_at = now()
      where id = v_room.id returning * into v_room;
      insert into public.room_events(room_id, revision, kind, actor_id, public_payload)
      values (v_room.id, v_room.revision, 'MEMBER_KICKED', p_actor,
        jsonb_build_object('userId', v_target_id));

    elsif p_type = 'LEAVE_ROOM' then
      if p_payload <> '{}'::jsonb or v_room.status not in ('waiting', 'completed') then
        raise exception 'ROOM_NOT_LEAVABLE' using errcode = 'P0001';
      end if;
      update public.room_members set status = 'left', seat_no = null, is_ready = false
      where room_id = v_room.id and user_id = p_actor;
      if v_room.host_user_id = p_actor then
        select user_id into v_next_host from public.room_members
        where room_id = v_room.id and status = 'active'
        order by joined_at, user_id limit 1;
        if v_next_host is not null then
          update public.room_members set is_ready = true
          where room_id = v_room.id and user_id = v_next_host;
          update public.room_members set is_ready = false
          where room_id = v_room.id and user_id <> v_next_host and status = 'active';
          update public.rooms set host_user_id = v_next_host,
            revision = revision + 1, updated_at = now()
          where id = v_room.id returning * into v_room;
        else
          update public.rooms set status = 'closed', revision = revision + 1,
            updated_at = now() where id = v_room.id returning * into v_room;
        end if;
      else
        update public.rooms set revision = revision + 1, updated_at = now()
        where id = v_room.id returning * into v_room;
      end if;
      insert into public.room_events(room_id, revision, kind, actor_id,
        public_payload) values (v_room.id, v_room.revision, 'MEMBER_LEFT', p_actor,
        jsonb_build_object('newHostUserId', v_next_host));

    elsif p_type = 'CLOSE_ROOM' then
      if v_room.host_user_id <> p_actor or v_room.status not in ('waiting', 'completed')
         or p_payload <> '{}'::jsonb then
        raise exception 'HOST_ONLY_WAITING' using errcode = 'P0001';
      end if;
      update public.rooms set status = 'closed', revision = revision + 1,
        updated_at = now() where id = v_room.id returning * into v_room;
      insert into public.room_events(room_id, revision, kind, actor_id)
      values (v_room.id, v_room.revision, 'ROOM_CLOSED', p_actor);

    elsif p_type = 'START_GAME' then
      raise exception 'USE_START_GAME_RPC' using errcode = 'P0001';
    else
      raise exception 'UNKNOWN_COMMAND' using errcode = 'P0001';
    end if;
  end if;

  v_response := jsonb_build_object(
    'roomId', v_room.id, 'revision', v_room.revision,
    'status', v_room.status, 'inviteCode', v_room.invite_code
  );
  insert into private.command_receipts(actor_id, action_id, scope, target_id, request, response)
  values (p_actor, p_action_id, 'room', v_room.id, v_request, v_response);
  return v_response;
end;
$$;
revoke execute on function public.apply_room_command(uuid, uuid, text, bigint, uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.apply_room_command(uuid, uuid, text, bigint, uuid, text, jsonb)
to service_role;

-- START_GAME is separate because the TypeScript rules engine must first produce
-- the initial hidden state and every player's permitted projection. The room
-- revision and roster are checked again while locked in this one transaction.
create function public.start_room_game(
  p_actor uuid,
  p_action_id uuid,
  p_room_id uuid,
  p_expected_revision bigint,
  p_seed text,
  p_state jsonb,
  p_views jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms%rowtype;
  v_game_id uuid;
  v_receipt private.command_receipts%rowtype;
  v_request jsonb;
  v_response jsonb;
  v_member record;
  v_count integer;
begin
  if p_actor is null or p_action_id is null or p_room_id is null
     or p_expected_revision is null or p_seed is null
     or pg_catalog.char_length(p_seed) < 16
     or jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_views) <> 'object' then
    raise exception 'INVALID_START' using errcode = 'P0001';
  end if;
  v_request := jsonb_build_object('type','START_GAME','roomId',p_room_id,
    'expectedRevision',p_expected_revision);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor::text || ':' || p_action_id::text, 0)
  );
  select * into v_receipt from private.command_receipts
  where actor_id = p_actor and action_id = p_action_id;
  if found then
    if v_receipt.scope <> 'room' or v_receipt.request <> v_request then
      raise exception 'ACTION_ID_REUSED' using errcode = 'P0001';
    end if;
    return v_receipt.response;
  end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_room.host_user_id <> p_actor or v_room.status not in ('waiting', 'completed') then
    raise exception 'HOST_ONLY_WAITING' using errcode = 'P0001';
  end if;
  if v_room.revision <> p_expected_revision then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.room_members
  where room_id = p_room_id and status = 'active';
  if v_count < 3 or v_count > v_room.max_players
     or exists (
       select 1 from public.room_members
       where room_id = p_room_id and status = 'active'
         and user_id <> p_actor and not is_ready
     ) or (select count(*) from pg_catalog.jsonb_object_keys(p_views)) <> v_count then
    raise exception 'PLAYERS_NOT_READY' using errcode = 'P0001';
  end if;
  for v_member in select user_id from public.room_members
                  where room_id = p_room_id and status = 'active' loop
    if not (p_views ? v_member.user_id::text)
       or jsonb_typeof(p_views->v_member.user_id::text) <> 'object' then
      raise exception 'INVALID_VIEWS' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.games(room_id) values (p_room_id) returning id into v_game_id;
  insert into private.game_states(game_id, revision, seed, state)
  values (v_game_id, 0, p_seed, p_state);
  for v_member in select user_id from public.room_members
                  where room_id = p_room_id and status = 'active' loop
    insert into public.game_views(game_id, room_id, user_id, revision, view)
    values (v_game_id, p_room_id, v_member.user_id, 0,
      p_views->v_member.user_id::text);
  end loop;
  update public.rooms set status = 'in_game', revision = revision + 1,
    updated_at = now() where id = p_room_id returning * into v_room;
  insert into public.room_events(room_id, revision, kind, actor_id,
    public_payload) values (p_room_id, v_room.revision, 'GAME_STARTED', p_actor,
    jsonb_build_object('gameId', v_game_id));
  v_response := jsonb_build_object('roomId', p_room_id, 'gameId', v_game_id,
    'revision', v_room.revision, 'status', v_room.status,
    'inviteCode', v_room.invite_code);
  insert into private.command_receipts(actor_id, action_id, scope, target_id, request, response)
  values (p_actor, p_action_id, 'room', p_room_id, v_request, v_response);
  return v_response;
end;
$$;
revoke execute on function public.start_room_game(uuid, uuid, uuid, bigint, text, jsonb, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.start_room_game(uuid, uuid, uuid, bigint, text, jsonb, jsonb)
to service_role;

create function public.load_game_state(p_actor uuid, p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_state private.game_states%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or not exists (
    select 1 from public.room_members where room_id = v_game.room_id
      and user_id = p_actor and status = 'active'
  ) then
    raise exception 'NOT_GAME_MEMBER' using errcode = 'P0001';
  end if;
  select * into v_state from private.game_states where game_id = p_game_id;
  return jsonb_build_object('roomId',v_game.room_id,'gameId',p_game_id,
    'revision',v_state.revision,'seed',v_state.seed,'state',v_state.state);
end;
$$;
revoke execute on function public.load_game_state(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.load_game_state(uuid, uuid) to service_role;

create function public.commit_game_transition(
  p_actor uuid,
  p_action_id uuid,
  p_game_id uuid,
  p_expected_revision bigint,
  p_request jsonb,
  p_next_state jsonb,
  p_views jsonb,
  p_completed boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_receipt private.command_receipts%rowtype;
  v_response jsonb;
  v_member record;
  v_count integer;
begin
  if p_actor is null or p_action_id is null or p_game_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_request) <> 'object'
     or jsonb_typeof(p_next_state) <> 'object'
     or jsonb_typeof(p_views) <> 'object' or p_completed is null then
    raise exception 'INVALID_GAME_COMMIT' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor::text || ':' || p_action_id::text, 0)
  );
  select * into v_receipt from private.command_receipts
  where actor_id = p_actor and action_id = p_action_id;
  if found then
    if v_receipt.scope <> 'game' or v_receipt.request <> p_request then
      raise exception 'ACTION_ID_REUSED' using errcode = 'P0001';
    end if;
    return v_receipt.response;
  end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not exists (
    select 1 from public.room_members where room_id = v_game.room_id
      and user_id = p_actor and status = 'active'
  ) then
    raise exception 'NOT_GAME_MEMBER' using errcode = 'P0001';
  end if;
  if v_game.status <> 'active' then
    raise exception 'GAME_COMPLETED' using errcode = 'P0001';
  end if;
  if v_game.revision <> p_expected_revision then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.room_members
  where room_id = v_game.room_id and status = 'active';
  if (select count(*) from pg_catalog.jsonb_object_keys(p_views)) <> v_count then
    raise exception 'INVALID_VIEWS' using errcode = 'P0001';
  end if;
  for v_member in select user_id from public.room_members
                  where room_id = v_game.room_id and status = 'active' loop
    if not (p_views ? v_member.user_id::text)
       or jsonb_typeof(p_views->v_member.user_id::text) <> 'object' then
      raise exception 'INVALID_VIEWS' using errcode = 'P0001';
    end if;
  end loop;
  update private.game_states set revision = revision + 1,
    state = p_next_state, updated_at = now() where game_id = p_game_id;
  update public.games set revision = revision + 1,
    status = case when p_completed then 'completed' else 'active' end,
    updated_at = now() where id = p_game_id returning * into v_game;
  for v_member in select user_id from public.room_members
                  where room_id = v_game.room_id and status = 'active' loop
    update public.game_views set revision = v_game.revision,
      view = p_views->v_member.user_id::text, updated_at = now()
    where game_id = p_game_id and user_id = v_member.user_id;
  end loop;
  if p_completed then
    update public.room_members set is_ready = false
    where room_id = v_game.room_id and user_id <> (
      select host_user_id from public.rooms where id = v_game.room_id
    ) and status = 'active';
    update public.rooms set status = 'completed', revision = revision + 1,
      updated_at = now() where id = v_game.room_id;
  end if;
  v_response := jsonb_build_object('gameId',p_game_id,'roomId',v_game.room_id,
    'revision',v_game.revision,'status',v_game.status);
  insert into private.command_receipts(actor_id, action_id, scope, target_id, request, response)
  values (p_actor, p_action_id, 'game', p_game_id, p_request, v_response);
  return v_response;
end;
$$;
revoke execute on function public.commit_game_transition(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.commit_game_transition(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb, boolean)
to service_role;

-- An Edge Function checks a repeated action before recalculating a game move.
-- The commit RPC repeats this check under an advisory lock to close the race.
create function public.get_action_receipt(
  p_actor uuid, p_action_id uuid, p_scope text, p_request jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt private.command_receipts%rowtype;
begin
  select * into v_receipt from private.command_receipts
  where actor_id = p_actor and action_id = p_action_id;
  if not found then return null; end if;
  if v_receipt.scope <> p_scope or v_receipt.request <> p_request then
    raise exception 'ACTION_ID_REUSED' using errcode = 'P0001';
  end if;
  return v_receipt.response;
end;
$$;
revoke execute on function public.get_action_receipt(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.get_action_receipt(uuid, uuid, text, jsonb)
to service_role;
