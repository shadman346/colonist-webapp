import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const url = Deno.env.get('SUPABASE_URL')
const publicKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
const publicKey = publicKeys.default
  ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  ?? Deno.env.get('SUPABASE_ANON_KEY')
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !publicKey || !secretKey) {
  throw new Error('Supabase URL, publishable key, or server secret is missing')
}

export const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const authClient = createClient(url, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export async function verifiedActor(req: Request): Promise<string | null> {
  const match = /^Bearer (\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return null
  const { data, error } = await authClient.auth.getUser(match[1])
  return error ? null : data.user?.id ?? null
}

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const allowedOrigins = new Set([
  ...localOrigins,
  ...(Deno.env.get('APP_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])

function responseHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin')
  return {
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }
}

export function json(req: Request, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: responseHeaders(req) })
}

export function preflight(req: Request): Response {
  const origin = req.headers.get('origin')
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: 'ORIGIN_NOT_ALLOWED' }, 403)
  return new Response(null, { status: 204, headers: responseHeaders(req) })
}

export function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin')
  return !origin || allowedOrigins.has(origin)
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const exposedErrors = new Set([
  'INVALID_COMMAND', 'INVALID_PAYLOAD', 'INVALID_CONFIG', 'INVALID_NAME',
  'ROOM_NOT_FOUND', 'ROOM_NOT_JOINABLE', 'ROOM_FULL', 'MEMBER_BLOCKED',
  'NOT_ROOM_MEMBER', 'STALE_REVISION', 'HOST_ONLY_WAITING', 'INVALID_READY',
  'ROOM_NOT_LEAVABLE', 'PLAYERS_NOT_READY', 'INVALID_VIEWS', 'INVALID_START',
  'ROOM_CREATE_LIMIT', 'INVALID_CHAT', 'CHAT_RATE_LIMIT',
  'INVALID_KICK', 'MEMBER_NOT_FOUND',
  'ACTION_ID_REUSED', 'NOT_GAME_MEMBER', 'GAME_COMPLETED', 'INVALID_GAME_COMMIT',
])

export function databaseError(req: Request, message: string): Response {
  const error = exposedErrors.has(message) ? message : 'SERVER_ERROR'
  const status = error === 'SERVER_ERROR' ? 500
    : error === 'ROOM_NOT_FOUND' ? 404
    : error === 'MEMBER_NOT_FOUND' ? 404
    : ['NOT_ROOM_MEMBER', 'NOT_GAME_MEMBER', 'MEMBER_BLOCKED', 'HOST_ONLY_WAITING'].includes(error) ? 403
    : ['STALE_REVISION', 'ROOM_FULL', 'ROOM_NOT_JOINABLE', 'GAME_COMPLETED', 'ACTION_ID_REUSED'].includes(error) ? 409
    : ['ROOM_CREATE_LIMIT', 'CHAT_RATE_LIMIT'].includes(error) ? 429
    : 400
  return json(req, { error }, status)
}
