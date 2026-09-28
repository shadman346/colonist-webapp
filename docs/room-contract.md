# Friends room contract

This is the shared contract for the first playable private room. The SQL migrations and Edge Functions in `supabase/` enforce it; `src/room/supabaseRoom.ts` is the browser adapter. The local preview adapter models the same flow but is not authoritative multiplayer.

## Identity, room, and settings

- Each browser player creates an email-and-password account or signs in through Supabase Auth before joining. Email confirmation and anonymous sign-in are disabled on the hosted project at the owner's direction. The verified JWT user ID is the stable actor and seat identity. The browser may submit a display name, but may never submit an actor ID, canonical game state, random seed, development deck, dice roll, or theft result. Password recovery is unavailable until an SMTP sender is configured.
- A room has an unlisted, random 16-character hexadecimal invite code. Anyone holding the code may ask the authenticated `JOIN_ROOM` function to join while the room has a seat. Before joining, a user cannot read that room through the table API.
- Rooms are private Base games with standard dice and ten victory points. The host chooses three to six seats and a 60, 90, 120, or 180 second turn timer before each match; 90 seconds is the default. Three or four seats select the standard map and require at least three active players to start. Five or six seats select the expanded map and require at least five. Seats are numbered 0–5, with the creator initially in seat 0.
- A player who leaves may rejoin while the room is joinable and a seat remains. A player kicked by the host cannot rejoin that room with the same Auth identity. Account-based sign-in should restore the same seat after browser storage is cleared.

## Room states

| State | Entered by | Allowed next state | Room actions |
| --- | --- | --- | --- |
| `waiting` | `CREATE_ROOM` | `in_game`, `closed` | Join, configure, ready, chat, kick, leave, start, close. |
| `in_game` | `START_GAME` | `completed` | Chat. The game advances through `game-command`. |
| `completed` | Winning game transition | `in_game`, `closed` | Join, configure, ready, chat, kick, leave, start a rematch, close. |
| `closed` | Host closes or final player leaves | None | No further commands or joins. |

A completed match remains a separate game record. Completion clears guest readiness; the host is implicitly ready. A configuration change, or a host departure that transfers control, also clears guest readiness. An unchanged configuration or readiness command succeeds without increasing the revision.

## Command envelope and permissions

Send `POST /functions/v1/room-command` with the Supabase access token and a JSON body:

```json
{
  "actionId": "new-uuid-for-this-intent",
  "type": "SET_READY",
  "expectedRevision": 7,
  "roomId": "room-uuid",
  "payload": { "ready": true }
}
```

Use `expectedRevision: 0` for `CREATE_ROOM` and `JOIN_ROOM`; the latter sends `code` instead of `roomId`. All other commands send the latest room `revision` and `roomId`. The server takes the actor solely from the verified JWT. Every successful response contains `roomId`, `inviteCode`, `status`, and `revision`; `START_GAME` also contains `gameId`.

| Command | Who and when | Required payload or field | Effect |
| --- | --- | --- | --- |
| `CREATE_ROOM` | Authenticated user | `displayName` (1–24 trimmed characters); optional `maxPlayers` (3–6) and `turnTimerSeconds` (60, 90, 120, or 180) | Create room and host membership; at most ten rooms per user per hour. |
| `JOIN_ROOM` | Authenticated code holder; `waiting` or `completed` | `code`, `displayName` | Take an available seat. An active member joining again gets the existing room. |
| `SET_CONFIG` | Host; `waiting` or `completed` | `maxPlayers`: 3–6, or `turnTimerSeconds`: 60, 90, 120, or 180 | Change capacity or timer; choose the matching map, compact out-of-range occupied seats when shrinking, and reset guest readiness. |
| `SET_READY` | Active guest; `waiting` or `completed` | `ready`: boolean | Set own readiness. |
| `START_GAME` | Host; `waiting` or `completed` | No payload | Require at least three players for the standard map or five for the expanded map, with every guest ready; create server-owned game and private player views. |
| `SEND_CHAT` | Active member; `waiting`, `in_game`, or `completed` | `message`: 1–500 trimmed characters | Append member-visible text event; at most one message per sender every three seconds. |
| `KICK_MEMBER` | Host; `waiting` or `completed` | `userId`: active guest UUID | Remove guest's active membership and prevent same identity rejoining. |
| `LEAVE_ROOM` | Active member; `waiting` or `completed` | No payload | Release seat. If host leaves, earliest joined remaining member becomes host; if nobody remains, close. |
| `CLOSE_ROOM` | Host; `waiting` or `completed` | No payload | Close room. Backend command exists; the current room UI has no close control. |

`START_GAME` runs through a separate transaction after the Edge Function creates a fresh board seed and independently shuffles the hidden development deck with Web Crypto. The transaction rechecks the room revision, roster, and readiness under a lock. The browser cannot create the game directly.

## Reads and live updates

The Data API permits only authenticated **active room members** to select their room, roster, game metadata, and member-visible room events. A player may select only their own `game_views` row. The full `private.game_states` and command receipts are never browser-readable. Membership is checked again on reads, so leaving or being kicked immediately removes table access. A closed room can still be read by a remaining active member, but no further room action is allowed.

The database broadcasts only room or game IDs and revision numbers to private `room:<roomId>` Realtime channels. An active member may subscribe; clients cannot send authoritative changes on this channel. A `revision` or `game-revision` signal means **refetch** the RLS-protected rows. Do not treat the broadcast as game state. The existing room UI uses `rooms`, `room_members`, the latest game ID from `games`, and the latest 100 `CHAT_MESSAGE` events. Its room view exposes `gameId` when a game exists. The game UI must read the caller's own `game_views` projection.

## Revisions, retries, and reconnect

- Member commands use the latest room revision; game commands use the latest game revision. The database locks the relevant row and compares `expectedRevision` before committing. Concurrent changes yield `STALE_REVISION` with no partial write. Refetch, present the current state, and let the player retry a still-valid intent with a **new** action ID.
- `actionId` makes a single intent idempotent. Repeating the same actor, ID, and request returns its original response, including after a lost HTTP response. Reusing that ID for different contents yields `ACTION_ID_REUSED`. Keep the same serialized request and ID for a transport retry.
- On page load or reconnect, fetch the current room and own game view, subscribe to the private channel, then fetch again when subscription reports `SUBSCRIBED`. This closes the fetch/subscribe gap. Revisions are hints; a missed broadcast cannot make a later authoritative fetch stale.
- While visible, the room UI also refreshes every 15 seconds so an interrupted Realtime connection cannot leave an open room indefinitely stale.
- A departed or kicked subscriber might receive a revision-only broadcast until its channel reconnects because Realtime checks authorization at subscription. RLS still blocks later table reads and no private state appears in the broadcast.

Common errors are `UNAUTHENTICATED` (sign in again), `ROOM_NOT_FOUND`, `ROOM_NOT_JOINABLE`, `ROOM_FULL`, `MEMBER_BLOCKED`, `NOT_ROOM_MEMBER`, `HOST_ONLY_WAITING`, `PLAYERS_NOT_READY`, `ROOM_NOT_LEAVABLE`, `STALE_REVISION`, `ACTION_ID_REUSED`, `INVALID_CHAT`, `CHAT_RATE_LIMIT`, and `ROOM_CREATE_LIMIT`. Function responses carry `{ "error": "CODE" }` with an HTTP status. Handle errors as user-visible outcomes; never optimistically mutate the authoritative room or game state.

`POST /functions/v1/game-command` accepts `{ actionId, gameId, expectedRevision, command }`. The `command` follows the engine's `GameCommand` union **without** `actorId`; the Edge Function supplies the verified actor and secure random outcome, then atomically commits the next canonical state and each player's projection. See `docs/rules-contract.md` for legal game commands and hidden-information rules.
