# Friends game: execution plan

**Prepared:** 28 September 2026
**Product location:** C:\StartUpsProject\Colonist workspace\colonist-webapp
**Design file:** [Friends Hex Game — Product Design & Board Screens](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/Friends-Hex-Game-%E2%80%94-Product-Design---Board-Screens?node-id=30-2)

**Validation rule (28 September 2026):** Do not create permanent unit, regression, integration, end-to-end, or smoke tests for future work. Do not use automated test runs as release gates. Manually validate each changed flow in the running app with the relevant player identities, screen sizes, and backend environment. Record the steps, expected behavior, observed result, and unresolved issues. Existing test files and earlier test results are historical evidence only.

## 1. Current position and target

At the start of this plan, the workspace had gameplay, map, video, asset, and visual research. Figma pages 07 and 08 hold dated reference images; page 08 covers the current Rooms list, Room ID dialog, host invite/configuration, host rules/advanced settings, and joined guest view. These are screenshot references. Four older editable concepts and their component styles are marked superseded.

**Progress on 28 September 2026:** the responsive app, Base engine, editable Figma room/match flow, Supabase schema, command functions, and private Realtime path are present. Five migrations and both JWT-protected functions are deployed to `shadman-app`; the project-scoped connection is documented in [supabase-connection.md](supabase-connection.md). Email/password account creation works without email confirmation, while anonymous sign-in stays disabled. Three isolated browser identities created/joined/readied a hosted room and started a match with a two-minute timer. A live move reached another player's board, and server timeout advanced an expired setup turn. The larger 30-hex board, five/six-seat configuration, supplies, and Special Build logic are implemented and deployed. A five-seat waiting room and three joins were manually observed; the expanded match itself is not yet manually validated. The local Docker stack remains unavailable. Complete hosted matches, privacy checks, expanded-match play, Figma expanded states, and static hosting remain open.

**Implementation update, 28 September 2026:** the private-room entry, join dialog, desktop host room, and 390 px phone Players/Settings tabs follow the editable Figma frames. A prior browser-only preview covered the early room and match flow. The current app requires Supabase; its hosted three-player walkthrough, five-seat room check, and production build are recorded in [manual UI walkthrough](manual-validation-2026-09-28.md). Full expanded gameplay, editable Figma expanded states, and public HTTPS deployment remain in this plan.

| Gate | Current evidence | Remaining check |
| --- | --- | --- |
| A — shared contract | Rules, room, action, and visibility documents written | Review any house-rule change before editing the engine |
| B — editable Figma | Room flow and core match states created at desktop/phone sizes | Finish less common prompts and compare final renders |
| C — private Supabase room | Hosted schema/functions and three-browser create/join/ready/start observed | Manually check outsider reads, full room, race, and reconnect |
| D — pure Base engine | Full ten-point simulation, replay, and rule tests passed before the manual-only rule | Manually verify affected rule paths through the playable UI as issues surface |
| E — complete playable UI | Hosted three-player match started; live move and setup timeout observed | Complete a Supabase-backed full match and rematch |
| F — larger-player Base board | 30-hex board, five/six seats, supplies, Special Build, and hosted schema/functions implemented; five-seat room configuration and three joins observed | Manually start and finish five- and six-player matches, inspect board and phone layouts, and add editable Figma expanded states |
| G — hosted release | Supabase backend deployed; Cloudflare Static Assets configuration dry-runs | Deploy the static app and run remote-device QA |

The first playable milestone is a **private browser Base game for three or four friends**. The release also includes the 5–6 player Base board so more friends can play in one room. One person hosts and shares a link or room code. Friends join, ready up, play a complete match to 10 victory points, reconnect after a tab closes, and start a rematch. Ranking, public matchmaking, bots, spectators, paid modes, the 7–8 player board, Seafarers, Cities & Knights, and unrelated geography/fun maps remain outside this release unless the owner expands the scope.

The visual target is the current Colonist room and game interface shown by the dated references. Make editable Figma screens and measure them beside those captures. Keep raw reference screenshots in the workspace analysis area. Record the source and usage status of every asset that goes into the shipped app.

### Initial game and room settings

| Item | Release-one behavior |
| --- | --- |
| Visibility | Every room is private and absent from a public room list. |
| Entry | Unpredictable invite link or short code; membership checks still control data access. |
| Seats | The current build supports three to six unique human seats; five or six seats select the expanded Base board. No bots. |
| Mode and map | Base rules on the standard 19-hex board or the matching larger-player Base board. Room settings must not allow a seat count and board combination that the server cannot run. |
| Dice and win | Ordinary two-dice probabilities; 10 victory points. |
| Turn clock | Host chooses 60, 90, 120, or 180 seconds before each match; 90 seconds is the default. The server owns the deadline and applies timeout moves. |
| Ready/start | Guests explicitly ready up. Host starts with at least three players and all occupied seats ready. A supported setting change clears guest readiness. |
| Identity | Supabase email/password accounts with display names; no email confirmation or anonymous sign-in. A configured mail sender is needed for password recovery. |

The room can follow Colonist's player seats, invitation, settings, chat, and fixed ready/start action hierarchy. Every interactive control in the final UI must have implemented behavior. Unsupported options should be absent or visibly unavailable.

## 2. Milestones and review gates

| Gate | Work | Reviewable result | Pass condition |
| --- | --- | --- | --- |
| **A. Shared contract** | Freeze room flow, Base rules, command names, visibility, and errors. | Rules, room-flow, and command/visibility documents in this docs folder. | Each phase has allowed actions and valid/invalid examples. |
| **B. Editable Figma flow** | Measure references; create new production components and host/guest designs. | Clickable create → invite → join → ready → start prototype, then match screens. | Named editable frames match dated references at desktop and phone sizes. |
| **C. Local room** | Initialize repository and local Supabase; implement identity, membership, configuration, ready/start, and live updates. | Private room working in two to four local browsers. | Invite, capacity, privacy, refresh, and concurrent-join checks pass. |
| **D. Pure Base engine** | Implement board graph, deterministic rules, hidden-information views, and scoring. This can run beside C after A. | Reproducible TypeScript engine and a recorded manual rules walkthrough. | A complete match can be played manually; invalid moves leave the visible state unchanged. |
| **E. Complete game** | Integrate engine, UI, backend, reconnect, and rematch. | Full local match in four browsers. | No manual database edit; hidden hands and deck never leak. |
| **F. Larger-player Base game** | Add the expanded board, supplies, seat capacity, Special Build Phase, responsive player list, and server-backed room/game flows. | Full local six-player match, with manual observations recorded. | Every seat can join, build in turn and in eligible Special Build Phases, reconnect, see only its own hidden information, finish, and rematch. |
| **G. Hosted release** | Deploy Supabase and Cloudflare, run remote QA, write operating notes. | Working private-invite URL and complete source/design handoff. | Four-player and six-player remote groups finish, reconnect, and rematch; access checks and usage review pass. |

**Critical path:** A → C and D → E → F → G. B begins after A and runs beside C/D, then adds larger-board screens during F. Asset inventory and production run beside B/D. The first visible review is the editable Figma room flow; the first playable review is the local room.

## 3. Gate A: shared contract

1. Write the Base rules in action order: forward/reverse opening placement, initial resources, pre-roll development card, roll/production, seven/discard/robber/steal, builds, bank/port and player trade, development cards, turn end, awards, and win. Record costs, supplies, bank shortage behavior, and ties. Use [Colonist Base rules](https://colonist.io/catan-rules) and the [official CATAN rulebook](https://www.catan.com/sites/default/files/2025-03/CN3081%20CATAN%E2%80%93The%20Game%20Rulebook%20secure%20%281%29.pdf).
2. Define room states: creating, waiting, full, ready, starting, in game, completed, closed. Specify who can change settings, duplicate join, leaving, host transfer, kick/close, and rematch. Decide how long chat remains available.
3. Create a command table. Each row states actor, allowed phase, input, state change, public result, private result, and failure. Cover join, set configuration, ready, start, opening placement, roll, build, trade, robber, development card, and end turn.
4. Create a visibility table. Board, dice, built pieces, and public points are shared. Own resources and development cards are private; opponent card counts may be public, but card identities and deck order are not. Document exactly what the log, errors, and live messages may reveal.
5. Specify invalid/expired code, full room, kicked seat, host disconnect, stale command, outage, reconnect, and completed-game behavior. Figma and API use the same state names.

**Pass condition:** the designer and engineer can build a screen and command handler from the same contract without guessing rules or privacy.

## 4. Gate B: Figma and assets

1. Capture missing current reference states: guest ready, host start enabled, full mobile room, useful copy/error/full-room behavior, and signed-in friend invitation when observable. Capture current live opening, normal turn, trade, robber, and results. Label unavailable states as our product decisions rather than observed Colonist behavior.
2. Measure the 1280×720 room: navigation and three column widths, fixed footer, independent scroll areas, typography, colors, borders, spacing, icons, and selected/disabled states. Record desktop and phone layout decisions separately and link each observation to a dated capture.
3. Make new production foundations and reusable components. Do not silently reuse the superseded concept tokens. Room components: navigation, list, player seat states, invite/code and copy feedback, mode/map/rule tiles, setting controls, chat, ready/start, toast, and dialogs. Board components: terrain, coast, chit, port, roads, settlements, cities, robber, dice, player strip, bank, cards, hand, log, action tray, trade, and development-card dialogs.
4. Create editable desktop room frames: Rooms entry; Join Room empty/valid/error; host empty/occupied; settings top/scrolled; guest waiting/ready; start disabled/enabled; room full; reconnect/rejoin. Link them into a clickable invite → ready → start path.
5. Create editable desktop match frames: opening, pre-roll, production/main action, build target, player/bank trade, development cards, seven/discard/robber/victim, opponent waiting, reconnect, results, and rematch.
6. Create portrait mobile equivalents around a 390-pixel width. Show real reflow of players, board, hand, action controls, settings, chat, and forced decisions. Ensure a modal cannot hide the board target required to resolve it.
7. Map every visible image to a source or production asset, format, export size, and usage status. Keep raw reference images out of the deployed assets folder.

**Pass condition:** required room states are named editable frames with reusable variants; a person can click through the friend flow; desktop and mobile frames receive side-by-side reference review. A screenshot placed in Figma remains a reference, not an editable design.

## 5. Gates C and D: local product work

### Repository and app

- Initialize Git in the product folder. Scaffold React, Vite, and strict TypeScript; commit a lockfile; add local start and production build scripts. Create entry, room, game, and results routes.
- Keep code, migrations, shipped art, and handoff documents here. Existing test files remain as historical material; do not add to them. Keep raw competitor captures, video stills, and discarded art in sibling analysis/assets folders.
- Implement Figma components against fixture data first so visual review does not wait for hosted services; then attach live state.

### Local Supabase and commands

- Use [email/password Auth](https://supabase.com/docs/guides/auth/passwords) and bind each seat to the verified Supabase user ID. The hosted project has email confirmation disabled and anonymous sign-in disabled. Membership checks use the user ID, not the `authenticated` role alone.
- Add migrations for rooms, room members, games, events, idempotency records, and per-player views. Keep the full state, hidden hands, unrevealed cards, and random seed in a non-exposed server-only location. Apply [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) to every exposed table and test host, member, outsider, and signed-out access.
- Accept commands through an authenticated [Edge Function](https://supabase.com/docs/guides/functions/auth). The browser sends an intent plus expected revision, never replacement state. Authenticate, authorize, validate the command with the pure engine, and calculate the next state.
- Commit private state, new revision, event, retry ID, and per-player views in **one database transaction** or one server-only commit routine. Several separate Edge Function writes are not an atomic turn. A revision conflict requires reload and revalidation; retrying the same action ID must not apply it twice.
- Use [private Supabase Realtime channels](https://supabase.com/docs/guides/realtime/authorization) for presence and small room/game-updated revision signals. Broadcast no hidden cards or full private state. Each browser fetches its authorized view after a signal and on reconnect. Supabase operates the WebSocket connection; a custom WebSocket server is unnecessary. Follow the current restriction on changing the Realtime schema while adding its permitted authorization policies.
- Demonstrate host create → friend join by link/code → configuration → ready → start locally. Check duplicate join, overfill race, setting-change readiness reset, stale edit, kick/leave, outsider access, and refresh.

### Pure Base engine

- Give hexes, vertices, and edges stable IDs. Generate the Base board from a server-owned seed and manually inspect adjacency, placement distance, roads, coast, and ports in the running game. Keep geometry usable for later larger maps.
- Use pure validation and transition functions. Server-generated dice, card draws, and theft become committed outcomes; the browser only displays them.
- Implement rules in game order, then public and per-seat state projections. Manually check illegal opening, bank shortage, seven/discard, Longest Road branches/ties, Largest Army ties, scarce resources, simultaneous trades, hidden points, and immediate win when those paths are affected.
- Walk through a complete match in the app, recording the moves and visible outcomes. Check that rejected moves leave the game unchanged.

**Gate C passes** when a private local room works in separate browsers with persistent seats and correct permissions. **Gate D passes** when a full Base match has been manually played with correct rules and rejected moves leave its visible state unchanged.

## 6. Gate E: full playable UI

1. Render the authorized board, pieces, ports, bank, own hand, opponent counts, turn phase, actions, dice, chat, and log from per-player views.
2. Connect interactions in order: opening → roll → build → bank trade → player trade → robber/discard → development cards → results. Highlight legal targets and offer a keyboard/list alternative to precise board clicks.
3. Show server-confirmed results. Prevent duplicate submission; on stale state, fetch again and explain the change. An animation is never proof of a committed move.
4. Restore the same Auth identity and seat on reload, fetch the current view, then resubscribe. Test reconnect during a pending trade, forced robber/discard, and normal turn.
5. Match the approved Figma desktop/phone screens. Check readable board details, touch targets, labels beyond color, focus, and reduced motion.

**Pass condition:** four separate browsers finish a rules-correct match and rematch without manual repair. An outsider or another player cannot see a private hand, hidden card, or deck order.

## 7. Gate F: larger-player Base board

This is part of the release scope, after the current 3–4 player match is manually validated. The [larger-map reference index](../../analysis/large-map-reference-index-2026-09-28.md) links the exact board previews and gameplay references. [Colonist's published larger-player rules](https://colonist.io/catan-rules/5-6-player) specify a 30-tile board, 24 cards of each resource, and 34 development cards for 5–6 players. Its Special Build Phase lets eligible players build and buy development cards after another player's turn, but not trade, play development cards, or win during that phase. The current 19-hex board and four-seat UI cannot simply be enlarged to satisfy these rules. The 7–8 player board remains a separate future scope decision.

1. Write the 5–6 player rule and room contract: board inventory, number/port placement, initial setup, piece/card supplies, Special Build Phase timing and eligibility, win timing, and room configuration. Preserve the 3–4 player behavior.
2. Extend board generation and rendering to select the correct graph and visual composition for each supported player count. Update hit targets, fit/zoom, legal-placement overlays, and phone navigation so the expanded board stays playable.
3. Extend room identity, seats, colors, capacity, host settings, Supabase checks, private views, and Realtime membership to six players. Reject unsupported seat/map combinations on the server.
4. Implement the Special Build Phase as authoritative game state, including pass/finish behavior, restrictions, reconnect, and the delayed win rule. Adjust resource bank and development deck inventories for each board size.
5. Add Figma host/guest and match states for the expanded board, extra player rows, Special Build control, and the phone layout. Link them in [design-handoff.md](design-handoff.md).
6. Manually validate a complete match with six isolated browser identities. Check full-room rejection, opening placements, production, a Special Build round, trade restrictions, development card restrictions, reconnect, privacy, victory timing, and rematch. Record steps and observed outcomes; create no permanent automated tests.

**Pass condition:** six friends can finish and rematch a rules-correct private Base game through the Supabase-backed UI without manual database repair.

## 8. Gate G: hosting, QA, and handoff

The owner-created Supabase project and its Codex MCP connection are available. Cloudflare account access is still needed at hosted integration. Figma team access already exists.

1. Use the existing Supabase project `shadman-app`. Apply migrations; configure Auth, private Realtime, site/redirect URLs, and the command function. Run database and access checks with disposable users. Keep secret/service keys on the server; the browser receives only the project URL and publishable key.
2. Connect the Git repository to [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and deploy Vite output as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). Configure the SPA fallback so room/game deep links survive refresh. Start with the free workers.dev domain. Current documentation says [static-asset requests are free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
3. Manually run remote matches at 3–4 seats and six seats: invite, join, ready, start, roll, trade, Special Build for larger games, disconnect/reconnect, win, and rematch. Repeat access checks with an outsider, forged actor, guessed code, and stale/replayed command. Check phone and small laptop layouts.
4. Inspect logs and actual usage. [Supabase Free](https://supabase.com/pricing) is plausible for a few turn-based rooms, but it can pause after a week of low activity. Document how to resume it, export/restore data, check usage, and roll back a deployment; recheck provider limits at launch.
5. Keep source, migrations, asset manifest, design handoff, README, and operating runbook in this product folder. Tag a release after the manual remote match and privacy checks pass.

## 9. Current work packet

The rules, room, command, and visibility contracts; editable Figma flow; Base engine; and interactive UI are present. The hosted Supabase backend has passed account creation, create → join → ready → start, a live opening move, and automatic setup timeout with three browser identities. Earlier browser-only preview checks covered more match actions; they do not prove hosted gameplay.

1. Finish one complete hosted Supabase-backed match through the UI, including seven/discard/robber, development cards, victory, rematch, and reconnect. Record each bug, its manual reproduction steps, and the observed result after the fix; do not add automated tests.
2. Manually verify member, outsider, and signed-out access; full-room rejection; race/stale command handling; private game views; and Realtime reconnect with isolated browser identities. Optionally repeat against the local Docker stack when available.
3. Implement Gate F's 5–6 player Base board, room capacity, Special Build Phase, and responsive screens after the standard match works end to end. Manually complete a full six-player game before hosting.
4. Finish the remaining Figma dialogs and phone states for both board sizes, then compare them with the running app at 1280 × 720 and 390 × 844. Keep the imported asset provenance and design handoff current.
5. After Cloudflare account access is available, deploy the static app, allow its exact HTTPS origin in the Edge Functions, and run remote-device playthroughs at both player counts. Remove the disposable QA accounts/room before wider invitations, and configure a mail sender for password recovery. Finish the operating runbook after real hosting behavior is observed.

The first two steps use the existing hosted Supabase project. The optional local stack needs Docker Desktop to be running on this machine.
