import {
  createGame, createSecureBoardSeed, createShuffledDevelopmentDeck,
  projectGame, webCryptoRandomSource,
} from '../../../engine/index.ts'
import {
  admin, databaseError, json, originAllowed, preflight,
  uuidPattern, verifiedActor,
} from '../_shared/server.ts'

const types = new Set([
  'CREATE_ROOM', 'JOIN_ROOM', 'SET_CONFIG', 'SET_READY',
  'START_GAME', 'SEND_CHAT', 'KICK_MEMBER', 'LEAVE_ROOM', 'CLOSE_ROOM',
])
const colors = ['#e45242', '#3495d0', '#e9ab36', '#7b57bd']

type Body = {
  actionId: string
  type: string
  expectedRevision: number
  roomId?: string
  code?: string
  payload?: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (!originAllowed(req)) return json(req, { error: 'ORIGIN_NOT_ALLOWED' }, 403)
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405)
  const actor = await verifiedActor(req)
  if (!actor) return json(req, { error: 'UNAUTHENTICATED' }, 401)

  let body: Body
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 8192) throw new Error('large')
    body = await req.json()
  } catch {
    return json(req, { error: 'INVALID_JSON' }, 400)
  }
  if (!body || typeof body !== 'object' || !uuidPattern.test(body.actionId)
      || !types.has(body.type) || !Number.isSafeInteger(body.expectedRevision)
      || body.expectedRevision < 0
      || (body.roomId !== undefined && !uuidPattern.test(body.roomId))
      || (body.code !== undefined && (typeof body.code !== 'string' || body.code.length > 64))
      || (body.payload !== undefined && (!body.payload || typeof body.payload !== 'object'
        || Array.isArray(body.payload)))) {
    return json(req, { error: 'INVALID_COMMAND' }, 400)
  }

  if (body.type === 'START_GAME') {
    if (!body.roomId || body.payload && Object.keys(body.payload).length) {
      return json(req, { error: 'INVALID_START' }, 400)
    }
    const { data: receipt, error: receiptError } = await admin.rpc('get_action_receipt', {
      p_actor: actor, p_action_id: body.actionId, p_scope: 'room',
      p_request: {
        type: 'START_GAME', roomId: body.roomId,
        expectedRevision: body.expectedRevision,
      },
    })
    if (receiptError) return databaseError(req, receiptError.message)
    if (receipt) return json(req, receipt)
    const { data: room, error: roomError } = await admin.from('rooms')
      .select('id,host_user_id,revision,status,max_players,victory_points').eq('id', body.roomId).maybeSingle()
    if (roomError) return json(req, { error: 'SERVER_ERROR' }, 500)
    if (!room) return json(req, { error: 'ROOM_NOT_FOUND' }, 404)
    if (room.host_user_id !== actor || !['waiting', 'completed'].includes(room.status)) {
      return json(req, { error: 'HOST_ONLY_WAITING' }, 403)
    }
    if (room.revision !== body.expectedRevision) return json(req, { error: 'STALE_REVISION' }, 409)
    const { data: members, error: membersError } = await admin.from('room_members')
      .select('user_id,display_name,seat_no,is_ready,status')
      .eq('room_id', body.roomId).eq('status', 'active').order('seat_no')
    if (membersError || !members) return json(req, { error: 'SERVER_ERROR' }, 500)
    if (members.length < 3 || members.length > room.max_players) {
      return json(req, { error: 'PLAYERS_NOT_READY' }, 409)
    }
    // No browser-supplied seed, state, or projection is ever accepted.
    const seed = createSecureBoardSeed()
    const state = createGame({
      players: members.map((m) => ({
        id: m.user_id, name: m.display_name, color: colors[m.seat_no],
      })),
      seed,
      developmentDeck: createShuffledDevelopmentDeck(webCryptoRandomSource()),
      victoryPointsToWin: room.victory_points,
    })
    const views = Object.fromEntries(members.map((m) => [m.user_id, projectGame(state, m.user_id)]))
    const { data, error } = await admin.rpc('start_room_game', {
      p_actor: actor, p_action_id: body.actionId, p_room_id: body.roomId,
      p_expected_revision: body.expectedRevision, p_seed: seed,
      p_state: state, p_views: views,
    })
    return error ? databaseError(req, error.message) : json(req, data)
  }

  const { data, error } = await admin.rpc('apply_room_command', {
    p_actor: actor,
    p_action_id: body.actionId,
    p_type: body.type,
    p_expected_revision: body.expectedRevision,
    p_room_id: body.roomId ?? null,
    p_code: body.code ?? null,
    p_payload: body.payload ?? {},
  })
  return error ? databaseError(req, error.message) : json(req, data)
})
