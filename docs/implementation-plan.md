# Friends game: execution plan

**Prepared:** 28 September 2026
**Product location:** C:\StartUpsProject\Colonist workspace\colonist-webapp
**Design file:** [Friends Hex Game — Product Design & Board Screens](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/Friends-Hex-Game-%E2%80%94-Product-Design---Board-Screens?node-id=30-2)

## 1. Current position and target

At the start of this plan, the workspace had gameplay, map, video, asset, and visual research. Figma pages 07 and 08 hold dated reference images; page 08 covers the current Rooms list, Room ID dialog, host invite/configuration, host rules/advanced settings, and joined guest view. These are screenshot references. Four older editable concepts and their component styles are marked superseded.

**Progress on 28 September 2026:** the product repository is initialized. The responsive app now plays a Base match across tabs in the same browser profile, including opening placement, rolling, building, trading, forced choices, and results. The Supabase room and match adapters, migrations, Edge Functions, RLS, and private Realtime revision path are written. The Base engine has a complete ten-point match simulation and replay. Figma pages 09 and 10 contain reusable production components and a clickable editable desktop/phone room and match flow. Local Supabase runtime and real remote multiplayer remain unverified because Docker Desktop's service is stopped; hosted accounts have not been created. Gates E and F remain open until a complete match is exercised through the Supabase-backed UI and deployed service.

| Gate | Current evidence | Remaining check |
| --- | --- | --- |
| A — shared contract | Rules, room, action, and visibility documents written | Review any house-rule change before editing the engine |
| B — editable Figma | Room flow and core match states created at desktop/phone sizes | Finish less common prompts and compare final renders |
| C — local Supabase room | Schema/functions, policy smoke tests, and frontend adapter pass | Run the full Docker stack with distinct browser identities |
| D — pure Base engine | Full ten-point simulation, replay, and rule tests pass | Keep regression coverage as UI issues surface |
| E — complete playable UI | Three-tab browser preview exercised through setup, roll, build, trade, reconnect, and chat | Complete a Supabase-backed four-browser match and rematch |
| F — hosted release | Cloudflare Static Assets configuration dry-runs | Connect owner accounts, deploy, and run remote QA |

The first playable release is a **private browser Base game for three or four friends**. One person hosts and shares a link or room code. Friends join, ready up, play a complete standard match to 10 victory points, reconnect after a tab closes, and start a rematch. Ranking, public matchmaking, bots, spectators, paid modes, expansions, and larger maps are later work. Keep the board geometry flexible enough to add researched larger maps after Base works.

The visual target is the current Colonist room and game interface shown by the dated references. Make editable Figma screens and measure them beside those captures. Keep raw reference screenshots in the workspace analysis area. Record the source and usage status of every asset that goes into the shipped app.

### Initial game and room settings

| Item | Release-one behavior |
| --- | --- |
| Visibility | Every room is private and absent from a public room list. |
| Entry | Unpredictable invite link or short code; membership checks still control data access. |
| Seats | Host chooses three or four unique human seats; no bots. |
| Mode and map | Standard Base game and Base map. |
| Dice and win | Ordinary two-dice probabilities; 10 victory points. |
| Turn clock | Off; a disconnected friend's turn waits. |
| Ready/start | Guests explicitly ready up. Host starts with at least three players and all occupied seats ready. A supported setting change clears guest readiness. |
| Identity | Supabase anonymous sign-in initially; a durable identity/linking path is needed before cross-device recovery is promised. |

The room can follow Colonist's player seats, invitation, settings, chat, and fixed ready/start action hierarchy. Every interactive control in the final UI must have implemented behavior. Unsupported options should be absent or visibly unavailable.

## 2. Milestones and review gates

| Gate | Work | Reviewable result | Pass condition |
| --- | --- | --- | --- |
| **A. Shared contract** | Freeze room flow, Base rules, command names, visibility, and errors. | Rules, room-flow, and command/visibility documents in this docs folder. | Each phase has allowed actions and valid/invalid examples. |
| **B. Editable Figma flow** | Measure references; create new production components and host/guest designs. | Clickable create → invite → join → ready → start prototype, then match screens. | Named editable frames match dated references at desktop and phone sizes. |
| **C. Local room** | Initialize repository and local Supabase; implement identity, membership, configuration, ready/start, and live updates. | Private room working in two to four local browsers. | Invite, capacity, privacy, refresh, and concurrent-join checks pass. |
| **D. Pure Base engine** | Implement board graph, deterministic rules, hidden-information views, and scoring. This can run beside C after A. | Reproducible TypeScript engine and rule tests. | A complete match can be simulated without UI or database; invalid moves do not change state. |
| **E. Complete game** | Integrate engine, UI, backend, reconnect, and rematch. | Full local match in four browsers. | No manual database edit; hidden hands and deck never leak. |
| **F. Hosted release** | Deploy Supabase and Cloudflare, run remote QA, write operating notes. | Working private-invite URL and complete source/design handoff. | Four remote browsers finish, reconnect, and rematch; access tests and usage review pass. |

**Critical path:** A → C and D → E → F. B begins after A and runs beside C/D. Asset inventory and production run beside B/D. The first visible review is the editable Figma room flow; the first playable review is the local room.

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

- Initialize Git in the product folder. Scaffold React, Vite, and strict TypeScript; commit a lockfile; add local start, production build, typecheck, and test scripts. Create entry, room, game, and results routes.
- Keep code, migrations, shipped art, tests, and handoff documents here. Keep raw competitor captures, video stills, and discarded art in sibling analysis/assets folders.
- Implement Figma components against fixture data first so visual review does not wait for hosted services; then attach live state.

### Local Supabase and commands

- Run local Supabase. Use [anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous) for low-friction guests and bind each seat to a Supabase user ID. Anonymous users have the authenticated database role, so membership checks must use the actual user ID, not the role alone.
- Add migrations for rooms, room members, games, events, idempotency records, and per-player views. Keep the full state, hidden hands, unrevealed cards, and random seed in a non-exposed server-only location. Apply [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) to every exposed table and test host, member, outsider, and signed-out access.
- Accept commands through an authenticated [Edge Function](https://supabase.com/docs/guides/functions/auth). The browser sends an intent plus expected revision, never replacement state. Authenticate, authorize, validate the command with the pure engine, and calculate the next state.
- Commit private state, new revision, event, retry ID, and per-player views in **one database transaction** or one server-only commit routine. Several separate Edge Function writes are not an atomic turn. A revision conflict requires reload and revalidation; retrying the same action ID must not apply it twice.
- Use [private Supabase Realtime channels](https://supabase.com/docs/guides/realtime/authorization) for presence and small room/game-updated revision signals. Broadcast no hidden cards or full private state. Each browser fetches its authorized view after a signal and on reconnect. Supabase operates the WebSocket connection; a custom WebSocket server is unnecessary. Follow the current restriction on changing the Realtime schema while adding its permitted authorization policies.
- Demonstrate host create → friend join by link/code → configuration → ready → start locally. Check duplicate join, overfill race, setting-change readiness reset, stale edit, kick/leave, outsider access, and refresh.

### Pure Base engine

- Give hexes, vertices, and edges stable IDs. Generate the Base board from a server-owned seed and test adjacency, placement distance, roads, coast, and ports. Keep geometry usable for later larger maps.
- Use pure validation and transition functions. Server-generated dice, card draws, and theft become committed outcomes; the browser only displays them.
- Implement rules in game order, then public and per-seat state projections. Test illegal opening, bank shortage, seven/discard, Longest Road branches/ties, Largest Army ties, scarce resources, simultaneous trades, hidden points, and immediate win.
- Replay a seeded complete match from recorded commands; random and attempted illegal commands must preserve engine invariants.

**Gate C passes** when a private local room works in separate browsers with persistent seats and correct permissions. **Gate D passes** when a full Base match can run as engine commands without UI or database.

## 6. Gate E: full playable UI

1. Render the authorized board, pieces, ports, bank, own hand, opponent counts, turn phase, actions, dice, chat, and log from per-player views.
2. Connect interactions in order: opening → roll → build → bank trade → player trade → robber/discard → development cards → results. Highlight legal targets and offer a keyboard/list alternative to precise board clicks.
3. Show server-confirmed results. Prevent duplicate submission; on stale state, fetch again and explain the change. An animation is never proof of a committed move.
4. Restore the same Auth identity and seat on reload, fetch the current view, then resubscribe. Test reconnect during a pending trade, forced robber/discard, and normal turn.
5. Match the approved Figma desktop/phone screens. Check readable board details, touch targets, labels beyond color, focus, and reduced motion.

**Pass condition:** four separate browsers finish a rules-correct match and rematch without manual repair. An outsider or another player cannot see a private hand, hidden card, or deck order.

## 7. Gate F: hosting, QA, and handoff

The owner-created Supabase and Cloudflare accounts are needed **at hosted integration**, after the local room/game and design are reviewable. Figma team access already exists.

1. Create a Supabase Free project near the players. Apply migrations; configure Auth, private Realtime, site/redirect URLs, and the command function. Run database and access checks with disposable users. Keep secret/service keys on the server; the browser receives only the project URL and publishable key.
2. Connect the Git repository to [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and deploy Vite output as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). Configure the SPA fallback so room/game deep links survive refresh. Start with the free workers.dev domain. Current documentation says [static-asset requests are free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
3. Run a remote host plus three-friend test: invite, join, ready, start, roll, trade, disconnect/reconnect, win, and rematch. Repeat access tests with an outsider, forged actor, guessed code, and stale/replayed command. Check phone and small laptop layouts.
4. Inspect logs and actual usage. [Supabase Free](https://supabase.com/pricing) is plausible for a few turn-based rooms, but it can pause after a week of low activity. Document how to resume it, export/restore data, check usage, and roll back a deployment; recheck provider limits at launch.
5. Keep source, migrations, tests, asset manifest, design handoff, README, and operating runbook in this product folder. Tag a release after the remote match and privacy checks pass.

## 8. Current work packet

The rules, room, command, and visibility contracts; editable Figma room flow; repository and app shell; pure Base engine; local room and match services; and interactive match UI are present. A three-tab browser preview has passed create → join → ready → start → opening → roll → build → trade → refresh → chat checks.

1. Start Docker Desktop, run the local Supabase stack, reset the migrations, and serve both command functions. Verify anonymous sign-in, room membership, game-view RLS, and private Realtime with separate browser profiles.
2. Finish one complete local Supabase-backed match through the UI, including seven/discard/robber, development cards, victory, rematch, and reconnect. Capture bugs as rule or interface regression tests.
3. Finish the remaining Figma dialogs and phone states, then compare them with the running app at 1280 × 720 and 390 × 844. Keep the imported asset provenance and design handoff current.
4. After the owner creates Supabase and Cloudflare accounts, apply the migrations and function settings, deploy the static app, and run a four-friend remote playtest. Finish the operating runbook after real hosting behavior is observed.

The first two steps do not need hosted Supabase or Cloudflare accounts. The local Supabase run does need Docker Desktop to be running on this machine.
