# Local room and game backend

**Status, 28 September 2026:** source is ready for local Supabase testing. A hosted Supabase project is not required. On this Windows machine, Docker Desktop is installed but its service is stopped and cannot be started by the current process, so a real local Supabase stack and browser playtest have not yet run. The checked-in PostgreSQL-compatible smoke test and Deno typecheck pass.

## What exists

| Part | File | Purpose |
| --- | --- | --- |
| Local stack | `supabase/config.toml` | Postgres 17, API, Realtime, Edge runtime, anonymous Auth, local app redirects. |
| Schema and access | `supabase/migrations/20260927225029_private_rooms.sql` | Rooms, seats, games, own game views, public room events, private canonical game state and receipts; member-only RLS. |
| Atomic commands | `supabase/migrations/20260927225150_room_commands.sql` | Room transition, start game, load private state, commit game transition, and retry receipt RPCs. |
| HTTP commands | `supabase/functions/room-command/index.ts`, `game-command/index.ts` | Verify user JWT, derive actor, call engine, submit one transaction to the database. |
| Smoke checks | `supabase/tests/migration-smoke.mjs` | Applies migrations to in-process PostgreSQL with mock Auth/Realtime schemas, then checks commands, retries, privacy, and rematch. |

The browser never receives the server secret, random seed, development deck, full hands, or canonical game state. The server generates a secure board seed and independently shuffles the development deck. The engine returns per-player projections; RLS restricts each `game_views` row to its owner. The `private` schema is not exposed through the Data API.

## Supported release-one room behavior

- `CREATE_ROOM` creates a private room and binds the host's anonymous Supabase Auth user ID to seat 0. Rooms are never publicly listed. A random 16-character hexadecimal invite code has 64 bits of entropy. Room creation is limited to ten per user per hour.
- `JOIN_ROOM` accepts that code through the authenticated Edge Function. It locks the room row, checks capacity, and allocates an empty seat. A duplicate join from the same active identity returns the room. A user who left can rejoin while there is capacity; a kicked identity is denied. `KICK_MEMBER` lets the host remove an active guest before or between games; the removed identity cannot rejoin that room.
- `SET_CONFIG` lets the host choose three or four seats. Base mode, Base map, ten victory points, and no timer are fixed. A real configuration change clears guest readiness.
- `SET_READY` lets each guest change readiness. The host is implicitly ready. `START_GAME` requires at least three active people, capacity not exceeded, and every guest ready.
- `START_GAME` asks the pure engine for server-owned initial state and per-player projections. The SQL transaction checks room revision, roster, host, and readiness again before committing the room, game, private state, public views, event, and action receipt.
- `SEND_CHAT` accepts up to 500 characters from an active member in a waiting, active, or completed room. It stores a member-visible `CHAT_MESSAGE` event, bumps the room revision, and limits each member to one message every three seconds. Render chat as text, never as HTML.
- `LEAVE_ROOM` is allowed before a game or between games. A departing host transfers control to the earliest remaining member and resets guest readiness; an empty room closes. `CLOSE_ROOM` is host-only before or between games.
- A finished game clears guest readiness. The same room can start a new game as a rematch after guests ready again. Prior completed games remain separate records.

The room command request is:

```json
{
  "actionId": "a-new-uuid-for-this-intent",
  "type": "CREATE_ROOM | JOIN_ROOM | SET_CONFIG | SET_READY | START_GAME | SEND_CHAT | KICK_MEMBER | LEAVE_ROOM | CLOSE_ROOM",
  "expectedRevision": 0,
  "roomId": "room-uuid-for-member-commands",
  "code": "invite-code-for-join-only",
  "payload": {}
}
```

`CREATE_ROOM` uses `{ "displayName": "Host", "maxPlayers": 4 }`; `JOIN_ROOM` uses `{ "displayName": "Friend" }` plus `code`; `SET_CONFIG` uses `{ "maxPlayers": 3 }` or `4`; `SET_READY` uses `{ "ready": true }`; `SEND_CHAT` uses `{ "message": "Hello" }`; `KICK_MEMBER` uses `{ "userId": "guest-uuid" }`. `CREATE_ROOM` and `JOIN_ROOM` use `expectedRevision: 0`; member commands send the revision most recently fetched. The response contains `roomId`, `revision`, `status`, `inviteCode`, and `gameId` after start. The caller's user ID is taken only from a verified JWT. Reusing an `actionId` with the same request returns the original response; a different request with that ID fails.

`game-command` accepts `{ actionId, gameId, expectedRevision, command }`. `command` is the engine command **without** `actorId`; the server sets it from the verified JWT. The browser cannot pass a random dice or theft outcome. The game commit checks the revision and action ID again under a row lock. Private state, all projections, new revision, and receipt are committed together or not at all.

Errors have short codes, notably `ROOM_NOT_FOUND`, `ROOM_FULL`, `PLAYERS_NOT_READY`, `HOST_ONLY_WAITING`, `NOT_ROOM_MEMBER`, `STALE_REVISION`, `CHAT_RATE_LIMIT`, and `ACTION_ID_REUSED`. A stale response means refetch the room or own game view, then let the person retry a still-valid action with a new ID. A network retry of the **same** intent should reuse its original action ID.

## How to run locally when Docker is available

From `C:\StartUpsProject\Colonist workspace\colonist-webapp`:

```powershell
npm install
npm --prefix supabase/tests ci
npm --prefix supabase/tests test
npx supabase start
npx supabase db reset
npx supabase status
npx supabase functions serve
```

The tests run without Docker; `start`, `db reset`, and `functions serve` need the Docker-compatible daemon. The CLI is currently runnable through `npx` version 2.118.0. Use `npx supabase --help` and each subcommand's `--help` if the CLI version changes. `supabase status` prints the local API URL and public key. Put only those values in the browser's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put `SUPABASE_SERVICE_ROLE_KEY` or a new secret key in any `VITE_` variable. Local Edge Functions receive their server key from the local Supabase runtime. Hosted functions first use Supabase's `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` dictionaries, with local legacy-key fallbacks. If a hosted deployment later uses a nonlocal frontend, set `APP_ORIGINS` for the Edge Functions to a comma-separated list of exact permitted origins.

The frontend should call `supabase.auth.signInAnonymously()` once per browser identity, preserve its session, invoke `room-command`, then fetch `rooms` and `room_members` by returned `roomId`. A new user **cannot** look up rooms by invite code through the table API; the join command performs that lookup server-side. After start, select the caller's `game_views` row for its own `user_id` and game ID. Anonymous identity persists in the same browser profile, but clearing storage/signing out/new device loses that seat until an account-linking or recovery feature exists.

## Live updates and reconnect

The database sends only `roomId`, optional `gameId`, and revision to a private `room:<roomId>` Realtime Broadcast channel. Realtime authorization permits a channel subscriber only while its Auth user ID is an active member when the channel is joined. Clients cannot send authoritative room/game changes over Realtime. On `revision` or `game-revision`, refetch RLS-protected room data or the caller's own `game_views` row. On page load/reconnect, fetch first and then subscribe; after the subscription becomes active, fetch again to close the small gap between those operations. Realtime's authorization is checked at channel join, so a player already subscribed at the instant of leaving or being kicked may receive a later **revision-only** signal until reconnection; private state is never broadcast and RLS denies subsequent data reads.

## Verification still required with the real stack

1. Apply migrations on local Supabase and run its database security/performance advisors. The in-process smoke test does not emulate GoTrue, PostgREST, or Realtime's gateway exactly.
2. Sign in in five isolated browser profiles. Host creates; three guests join; fifth is rejected. Check outsider, guest, host, and signed-out reads; verify no direct `INSERT`/`UPDATE` or RPC access from the public key.
3. Test concurrent final-seat joins, changing seat count while someone readies, stale revisions, repeated action IDs, leave/rejoin, host transfer, start, a match command, reconnect, completion, and rematch. Check that only the intended private view is returned.
4. Verify private channel authorization with member and outsider JWTs. Disable public Realtime access in a hosted project's Realtime settings before launch.
5. Review Auth limits and enable an abuse control such as CAPTCHA if the room feature becomes publicly reachable to untrusted traffic.

Only after those checks should the fixture room adapter be replaced as the default multiplayer mode. A hosted Supabase account is needed when remote friends are ready to play; Cloudflare deployment follows the local match and access checks.

## Source references

- [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), including the `authenticated` database role and identity-loss caveat.
- [Local development and CLI](https://supabase.com/docs/guides/local-development), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), and [database functions](https://supabase.com/docs/guides/database/functions).
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) and [database Broadcast](https://supabase.com/docs/guides/realtime/broadcast).
- [Data API access and RLS](https://supabase.com/docs/guides/api/securing-your-api) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
