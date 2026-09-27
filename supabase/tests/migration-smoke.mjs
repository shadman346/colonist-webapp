import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

// PGlite runs real PostgreSQL SQL and PL/pgSQL in-process. These minimal mocks
// stand in for the Supabase-owned auth and realtime schemas; run the full stack
// separately before relying on it for hosted play.
const db = new PGlite({ extensions: { pgcrypto } })
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url))
const user = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const action = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`

async function queryValue(sql, params = []) {
  const result = await db.query(sql, params)
  return Object.values(result.rows[0] ?? {})[0]
}

async function room(actor, actionId, type, revision, roomId = null, code = null, payload = {}) {
  return queryValue(`select public.apply_room_command(
    $1::uuid, $2::uuid, $3::text, $4::bigint, $5::uuid, $6::text, $7::jsonb
  ) as value`, [actor, actionId, type, revision, roomId, code, JSON.stringify(payload)])
}

async function revision(roomId) {
  return Number(await queryValue('select revision from public.rooms where id=$1::uuid', [roomId]))
}

async function asUser(actor, fn) {
  await db.exec('begin; set local role authenticated;')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: actor })])
    return await fn()
  } finally {
    await db.exec('rollback;')
  }
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create schema auth; create schema realtime;
    create table auth.users(id uuid primary key);
    create table realtime.messages(id uuid);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    create function realtime.topic() returns text language sql stable as $$
      select current_setting('realtime.topic', true)
    $$;
    create function realtime.send(jsonb,text,text,boolean) returns void
      language plpgsql as $$ begin return; end; $$;
  `)
  for (const name of readdirSync(migrations).filter((s) => s.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, name), 'utf8'))
  }
  for (let i = 1; i <= 5; i++) {
    await db.query('insert into auth.users(id) values ($1::uuid)', [user(i)])
  }

  const created = await room(user(1), action(1), 'CREATE_ROOM', 0, null, null,
    { displayName: 'Host', maxPlayers: 4 })
  assert.equal(created.revision, 1)
  assert.equal(created.inviteCode.length, 16)
  assert.deepEqual(await room(user(1), action(1), 'CREATE_ROOM', 0, null, null,
    { displayName: 'Host', maxPlayers: 4 }), created)
  await assert.rejects(room(user(1), action(1), 'CREATE_ROOM', 0, null, null,
    { displayName: 'Changed', maxPlayers: 4 }), /ACTION_ID_REUSED/)

  const roomId = created.roomId
  await room(user(1), action(70), 'SEND_CHAT', await revision(roomId),
    roomId, null, { message: ' Hello friends ' })
  assert.equal(await queryValue(`select public_payload->>'message' from public.room_events
    where room_id=$1::uuid and kind='CHAT_MESSAGE'`, [roomId]), 'Hello friends')
  await assert.rejects(room(user(1), action(71), 'SEND_CHAT', await revision(roomId),
    roomId, null, { message: 'too soon' }), /CHAT_RATE_LIMIT/)
  await room(user(2), action(2), 'JOIN_ROOM', 0, null, created.inviteCode, { displayName: 'Two' })
  await room(user(3), action(3), 'JOIN_ROOM', 0, null, created.inviteCode, { displayName: 'Three' })
  await assert.rejects(room(user(4), action(4), 'JOIN_ROOM', 0, null, 'BADCODE',
    { displayName: 'Four' }), /ROOM_NOT_FOUND/)
  await assert.rejects(room(user(2), action(5), 'SET_CONFIG', await revision(roomId),
    roomId, null, { maxPlayers: 3 }), /HOST_ONLY_WAITING/)

  await room(user(2), action(6), 'SET_READY', await revision(roomId), roomId,
    null, { ready: true })
  const stale = (await revision(roomId)) - 1
  await assert.rejects(room(user(3), action(7), 'SET_READY', stale, roomId,
    null, { ready: true }), /STALE_REVISION/)
  await room(user(1), action(8), 'SET_CONFIG', await revision(roomId), roomId,
    null, { maxPlayers: 3 })
  assert.equal(await queryValue('select is_ready from public.room_members where room_id=$1::uuid and user_id=$2::uuid',
    [roomId, user(2)]), false, 'host configuration resets guest readiness')
  await assert.rejects(room(user(4), action(9), 'JOIN_ROOM', 0, null,
    created.inviteCode, { displayName: 'Four' }), /ROOM_FULL/)
  await room(user(1), action(10), 'SET_CONFIG', await revision(roomId), roomId,
    null, { maxPlayers: 4 })
  await room(user(4), action(11), 'JOIN_ROOM', 0, null, created.inviteCode,
    { displayName: 'Four' })
  await assert.rejects(room(user(5), action(12), 'JOIN_ROOM', 0, null,
    created.inviteCode, { displayName: 'Five' }), /ROOM_FULL/)

  for (let i = 2; i <= 4; i++) {
    await room(user(i), action(20+i), 'SET_READY', await revision(roomId),
      roomId, null, { ready: true })
  }
  const startRev = await revision(roomId)
  const views = Object.fromEntries([1, 2, 3, 4].map((i) => [user(i), { ownId: user(i) }]))
  async function start(actionId, state, seed) {
    return queryValue(`select public.start_room_game(
      $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::jsonb,$7::jsonb
    ) as value`, [user(1), actionId, roomId, startRev, seed,
      JSON.stringify(state), JSON.stringify(views)])
  }
  const started = await start(action(30), { secret: 'hidden' }, 'board-seed-secret-1')
  assert.equal(started.status, 'in_game')
  assert.equal(started.inviteCode, created.inviteCode)
  assert.deepEqual(await start(action(30), { secret: 'different' },
    'board-seed-secret-2'), started, 'repeated start does not create another game')
  await assert.rejects(queryValue('select public.load_game_state($1::uuid,$2::uuid)',
    [user(5), started.gameId]), /NOT_GAME_MEMBER/)

  const memberRows = await asUser(user(2), async () => {
    const rooms = await db.query('select id from public.rooms')
    const gameViews = await db.query('select user_id, view from public.game_views')
    return { rooms: rooms.rows, views: gameViews.rows }
  })
  assert.equal(memberRows.rooms.length, 1)
  assert.equal(memberRows.views.length, 1)
  assert.equal(memberRows.views[0].user_id, user(2))
  assert.equal(JSON.stringify(memberRows).includes('hidden'), false)
  const memberChatCount = await asUser(user(2), async () => queryValue(
    `select count(*)::int from public.room_events where kind='CHAT_MESSAGE'`))
  assert.equal(memberChatCount, 1)
  await db.query('insert into realtime.messages(id) values ($1::uuid)', [action(80)])
  const memberRealtime = await asUser(user(2), async () => {
    await db.query(`select set_config('realtime.topic',$1,true)`, [`room:${roomId}`])
    return queryValue('select count(*)::int from realtime.messages')
  })
  assert.equal(memberRealtime, 1)
  const outsiderRows = await asUser(user(5), async () => {
    const rooms = await db.query('select id from public.rooms')
    const views = await db.query('select user_id from public.game_views')
    return { rooms: rooms.rows, views: views.rows }
  })
  assert.deepEqual(outsiderRows, { rooms: [], views: [] })
  const outsiderChatCount = await asUser(user(5), async () => queryValue(
    `select count(*)::int from public.room_events where kind='CHAT_MESSAGE'`))
  assert.equal(outsiderChatCount, 0)
  const outsiderRealtime = await asUser(user(5), async () => {
    await db.query(`select set_config('realtime.topic',$1,true)`, [`room:${roomId}`])
    return queryValue('select count(*)::int from realtime.messages')
  })
  assert.equal(outsiderRealtime, 0)
  await asUser(user(2), async () => {
    await assert.rejects(db.query('select public.load_game_state($1::uuid,$2::uuid)',
      [user(2), started.gameId]), /permission denied/)
  })
  await asUser(user(2), async () => {
    await assert.rejects(db.query('select public.apply_room_command($1::uuid,$2::uuid,$3::text,$4::bigint)',
      [user(2), action(81), 'CLOSE_ROOM', 1]), /permission denied/)
  })
  await asUser(user(2), async () => {
    await assert.rejects(db.query('update public.rooms set max_players=3 where id=$1::uuid',
      [roomId]), /permission denied/)
  })

  const gameRequest = { gameId: started.gameId, expectedRevision: 0,
    command: { type: 'roll', actorId: user(1) } }
  const commitParams = [user(1), action(31), started.gameId, 0,
    JSON.stringify(gameRequest), JSON.stringify({ secret: 'next' }),
    JSON.stringify(views), false]
  const committed = await queryValue(`select public.commit_game_transition(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb,$6::jsonb,$7::jsonb,$8::boolean
  ) as value`, commitParams)
  assert.equal(committed.revision, 1)
  assert.deepEqual(await queryValue(`select public.commit_game_transition(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb,$6::jsonb,$7::jsonb,$8::boolean
  ) as value`, commitParams), committed)
  await assert.rejects(queryValue(`select public.commit_game_transition(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb,$6::jsonb,$7::jsonb,$8::boolean
  )`, [user(1), action(32), started.gameId, 0, JSON.stringify(gameRequest),
    JSON.stringify({}), JSON.stringify(views), false]), /STALE_REVISION/)

  const completed = await queryValue(`select public.commit_game_transition(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb,$6::jsonb,$7::jsonb,$8::boolean
  ) as value`, [user(1), action(33), started.gameId, 1,
    JSON.stringify({ gameId: started.gameId, expectedRevision: 1,
      command: { type: 'end-turn', actorId: user(1) } }),
    JSON.stringify({ winner: user(1) }), JSON.stringify(views), true])
  assert.equal(completed.status, 'completed')
  assert.equal(await queryValue('select status from public.rooms where id=$1::uuid', [roomId]), 'completed')
  assert.equal(await queryValue('select is_ready from public.room_members where room_id=$1::uuid and user_id=$2::uuid',
    [roomId, user(2)]), false, 'rematch requires fresh ready')
  for (let i = 2; i <= 4; i++) {
    await room(user(i), action(40+i), 'SET_READY', await revision(roomId),
      roomId, null, { ready: true })
  }
  const rematch = await queryValue(`select public.start_room_game(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::jsonb,$7::jsonb
  ) as value`, [user(1), action(50), roomId, await revision(roomId),
    'new-independent-seed', JSON.stringify({ rematch: true }), JSON.stringify(views)])
  assert.notEqual(rematch.gameId, started.gameId)
  assert.equal(rematch.status, 'in_game')

  const kickRoom = await room(user(1), action(60), 'CREATE_ROOM', 0,
    null, null, { displayName: 'Host', maxPlayers: 3 })
  await room(user(5), action(61), 'JOIN_ROOM', 0, null,
    kickRoom.inviteCode, { displayName: 'Five' })
  await room(user(1), action(62), 'KICK_MEMBER', await revision(kickRoom.roomId),
    kickRoom.roomId, null, { userId: user(5) })
  await assert.rejects(room(user(5), action(63), 'JOIN_ROOM', 0, null,
    kickRoom.inviteCode, { displayName: 'Five' }), /MEMBER_BLOCKED/)
  const kickedView = await asUser(user(5), async () => db.query(
    'select id from public.rooms where id=$1::uuid', [kickRoom.roomId]))
  assert.equal(kickedView.rows.length, 0)

  const gapRoom = await room(user(1), action(90), 'CREATE_ROOM', 0,
    null, null, { displayName: 'Host', maxPlayers: 4 })
  for (let i = 2; i <= 4; i++) {
    await room(user(i), action(90 + i), 'JOIN_ROOM', 0, null,
      gapRoom.inviteCode, { displayName: `Player ${i}` })
  }
  await room(user(3), action(94), 'LEAVE_ROOM', await revision(gapRoom.roomId), gapRoom.roomId)
  await room(user(1), action(95), 'SET_CONFIG', await revision(gapRoom.roomId),
    gapRoom.roomId, null, { maxPlayers: 3 })
  assert.equal(await queryValue(`select max(seat_no)::int from public.room_members
    where room_id=$1::uuid and status='active'`, [gapRoom.roomId]), 2,
  'shrinking a room compacts an occupied seat 3 into the vacant lower seat')
  await assert.rejects(room(user(3), action(96), 'JOIN_ROOM', 0, null,
    gapRoom.inviteCode, { displayName: 'Player 3' }), /ROOM_FULL/)
  assert.equal(await queryValue(`select count(*)::int from public.room_members
    where room_id=$1::uuid and status='active'`, [gapRoom.roomId]), 3)

  console.log('Migration, room commands, game revisions, and RLS smoke tests passed.')
} finally {
  await db.close()
}
