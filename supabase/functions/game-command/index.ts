import {
  applyGameCommand, expireTurn, projectGame, randomOutcomeForCommand, webCryptoRandomSource,
  type GameCommand, type GameState,
} from '../../../engine/index.ts'
import {
  admin, databaseError, json, originAllowed, preflight,
  uuidPattern, verifiedActor,
} from '../_shared/server.ts'

type Body = {
  actionId: string
  gameId: string
  expectedRevision: number
  command: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (!originAllowed(req)) return json(req, { error: 'ORIGIN_NOT_ALLOWED' }, 403)
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405)
  const actor = await verifiedActor(req)
  if (!actor) return json(req, { error: 'UNAUTHENTICATED' }, 401)

  let body: Body
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 16_384) throw new Error('large')
    body = await req.json()
  } catch {
    return json(req, { error: 'INVALID_JSON' }, 400)
  }
  if (!body || !uuidPattern.test(body.actionId) || !uuidPattern.test(body.gameId)
      || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
      || !body.command || typeof body.command !== 'object' || Array.isArray(body.command)
      || typeof body.command.type !== 'string' || body.command.actorId !== undefined) {
    return json(req, { error: 'INVALID_COMMAND' }, 400)
  }
  const command = { ...body.command, actorId: actor } as GameCommand
  const request = {
    gameId: body.gameId, expectedRevision: body.expectedRevision, command,
  }
  const { data: receipt, error: receiptError } = await admin.rpc('get_action_receipt', {
    p_actor: actor, p_action_id: body.actionId, p_scope: 'game', p_request: request,
  })
  if (receiptError) return databaseError(req, receiptError.message)
  if (receipt) return json(req, receipt)

  const { data: loaded, error: loadError } = await admin.rpc('load_game_state', {
    p_actor: actor, p_game_id: body.gameId,
  })
  if (loadError) return databaseError(req, loadError.message)
  if (!loaded || loaded.revision !== body.expectedRevision) {
    return json(req, { error: 'STALE_REVISION' }, 409)
  }
  const state = loaded.state as GameState
  let next: GameState
  try {
    const nowMs = Date.now()
    if (body.command.type === 'expire-turn') {
      if (Object.keys(body.command).length !== 1) return json(req, { error: 'INVALID_COMMAND' }, 400)
      next = expireTurn(state, nowMs, webCryptoRandomSource())
    } else {
      if (state.turnDeadlineAt && nowMs >= Date.parse(state.turnDeadlineAt)) {
        return json(req, { error: 'TURN_EXPIRED' }, 409)
      }
      const outcome = randomOutcomeForCommand(state, command, webCryptoRandomSource())
      next = applyGameCommand(state, command, outcome, nowMs)
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code) : 'INVALID_MOVE'
    return json(req, { error: code }, 400)
  }
  const views = Object.fromEntries(next.players.map((p) => [p.id, projectGame(next, p.id)]))
  const { data, error } = await admin.rpc('commit_game_transition', {
    p_actor: actor, p_action_id: body.actionId, p_game_id: body.gameId,
    p_expected_revision: body.expectedRevision, p_request: request,
    p_next_state: next, p_views: views, p_completed: next.phase === 'completed',
  })
  return error ? databaseError(req, error.message) : json(req, data)
})
