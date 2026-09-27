# Base game rules contract — v1

**Status:** implemented in `engine/`; 28 September 2026. This document defines the first private three- or four-friend match. Room creation, seat identity, readiness, persistence, command revision, and rematch belong to the room/backend contract. The engine accepts a fixed ordered list of players after the host starts.

**Sources:** [CATAN Base game rulebooks](https://www.catan.com/understand-catan/game-rules), [2020 Base rules PDF](https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf), and [CATAN FAQ](https://www.catan.com/faq). The official materials establish the Base mechanics; this document also names digital interaction choices so implementation is unambiguous. This is a rules-compatible friends game and does not imply use of official CATAN marks or artwork.

## 1. Scope and invariants

- Three or four unique, human player IDs, fixed seat order, no bots. The first ID begins setup and the first normal turn.
- Base island: 19 terrain hexes, 54 intersections, 72 edges; 4 wood, 4 wool, 4 grain, 3 brick, 3 ore, 1 desert. Eighteen number tokens have two each of 3–11 (excluding 7), one 2, one 12; the two 6s and two 8s are not adjacent. Nine distinct coastline ports: four generic 3:1 and one 2:1 for each resource.
- Server supplies an unpredictable board seed. `createGame` deterministically shuffles the **public** terrain, numbers, and ports from it. The **hidden** 25-card development deck is shuffled independently with a cryptographically secure server random source and passed to `createGame` as `developmentDeck`. A public board must never allow an opponent to infer deck order. The board seed and deck remain server-only. IDs are stable independent of the shuffled content: `h:q,r`, `v:x,y`, and `e:v1|v2`.
- Bank starts with 19 of each resource. Each player has 15 roads, 5 settlements, and 4 cities. Every transition conserves all 95 resource cards and respects piece limits.
- Costs: road = 1 wood + 1 brick; settlement = 1 wood + 1 brick + 1 wool + 1 grain; city = 2 grain + 3 ore; development card = 1 wool + 1 grain + 1 ore.
- Development deck = 14 Knights, 5 hidden victory points, 2 Road Building, 2 Year of Plenty, 2 Monopoly.
- Ten total victory points wins. Settlement = 1, city = 2, Longest Road = 2, Largest Army = 2, each held VP card = 1. Only the active player can win, and a VP card acquired this turn counts for a win this turn.
- Standard two dice; no balanced dice, friendly robber, timer, harbor variants, or extra map rules in v1.

## 2. Phases and exact action order

| Phase | Authorized actor | Allowed command(s) | Next phase |
| --- | --- | --- | --- |
| `setup-settlement` | Current setup seat | `place-setup-settlement` | `setup-road` |
| `setup-road` | Same seat | `place-setup-road` | Next setup seat, or `pre-roll` |
| `pre-roll` | Current turn seat | `roll`; optionally one playable Knight or progress card | `action`, `discard`, `robber-move`, or card resolution |
| `discard` | Every seat listed as owing cards | `discard` | `robber-move` after all complete |
| `robber-move` | Current turn seat | `move-robber` | `robber-steal` if an eligible victim exists; otherwise prior `pre-roll` or `action` |
| `robber-steal` | Current turn seat | `choose-robber-victim` | Prior `pre-roll` or `action` |
| `road-building` | Current turn seat | `build-road` at zero cost, up to two sequential placements | Prior `pre-roll` or `action` |
| `action` | Current turn seat, except a direct trade recipient may respond | Build, buy, bank trade, offer/cancel trade, play one eligible development card, `end-turn`; recipient may accept/reject offered trade | `pre-roll` of next seat, a forced card subphase, or `completed` |
| `completed` | None | None | Terminal; backend may create a distinct rematch |

Opening order is forward then reverse: for A/B/C/D it is A, B, C, D, D, C, B, A. Each placement consists of a settlement then one incident empty road. A setup settlement target must have at least one free incident edge so the required road can always be placed. Starting resources are paid only for each player's **second** settlement, one from each adjacent non-desert hex. Setup settlements need no road connection, but all settlements obey the distance rule.

Before the roll, an eligible development card may be played. A Knight's robber sequence returns to `pre-roll`, so the player still rolls. During the normal turn, trading and building may be interleaved; this is the combined trade/build variant described by CATAN and matches a practical digital action tray. The player ends the turn explicitly. A pending player trade blocks other actions until accepted, rejected, or canceled.

## 3. Production, seven, and robber

For a non-seven roll, each unblocked numbered hex with that sum pays one matching resource per adjacent settlement or two per adjacent city. A city earns two even when the player also owns another building next to the same hex. Desert never produces. The robber's current hex does not produce.

When the bank has enough of a resource for all claims, pay every claim. When it cannot satisfy multiple players, no player gets that resource on that roll. If only one player claims it, pay as many as remain, up to that player's claim. Each resource is resolved independently.

On a seven, each player with **more than seven** resources discards exactly floor(hand size / 2), independently. All required discards complete before the active player moves the robber. The robber must move to a different hex, including the desert if desired. The active player then chooses one opponent with a building bordering the new hex and at least one resource; the server picks one of that opponent's resource cards uniformly. If no eligible opponent exists, there is no steal. Playing a Knight also moves the robber and allows a steal, but does not trigger hand-size discards.

Random outcomes are two separate, trusted inputs: a pair of dice or one stolen resource. The server calls `randomOutcomeForCommand(state, command, secureRandomSource)` and passes the outcome to `applyGameCommand`. Browser commands never contain the outcome. The engine verifies each die is 1–6 and a chosen stolen resource exists in the victim's hand. At game creation, the server calls `createShuffledDevelopmentDeck(secureRandomSource)` and passes the result to `createGame`; this source must be independent of the public board seed.

## 4. Building, ports, and trading

- A normal road occupies a vacant edge and must extend the builder's road network or touch their settlement/city. An opposing settlement/city blocks continuation through its vertex. A road can end at that vertex if it connects from its other endpoint. Road Building grants up to two legal zero-cost roads, placed consecutively. The card ends early when the player has no legal placement or road pieces left.
- A settlement occupies an empty intersection, has no neighboring settlement/city of any color, and connects to one of the builder's roads. A settlement built on one of a port's two corners immediately grants that port's trade rate.
- A city upgrades one of the builder's existing settlements, returning its settlement piece to the supply. It produces two cards per adjacent producing hex and scores two points total.
- Bank trade is always 4 of one resource for 1 of a different resource; a generic port improves this to 3:1; a matching resource port improves it to 2:1. The receiving resource must be available in the bank. The best rate applies and the bank receives the offered cards.
- Player trade is a direct offer to one other seated player during the active player's `action` phase. Both sides offer/request at least one card. Acceptance rechecks both hands and swaps atomically. The recipient can reject; the active player can cancel. Other players cannot trade with each other. Counteroffers and broadcast negotiations are later interaction work.
- Development cards cost one wool, grain, and ore. A newly bought action card cannot be played on its purchase turn. At most one Knight **or** progress card can be played per turn. Hidden VP cards are never `play` commands; they count toward the owner's total immediately and are revealed only through winning.
- Year of Plenty selects two available resource cards from the bank, including two of one kind if available. Monopoly names one resource and transfers every card of that kind held by opponents to the active player.

## 5. Awards and win

Longest Road is the maximum non-repeating continuous path through a player's edges. Branches do not add together. An opposing settlement/city interrupts the path. At length 5, a unique leader earns the two-point award. The holder retains it on a tie; if the holder's road is broken and multiple nonholders tie for the longest eligible path, nobody holds it until one player leads. Largest Army starts at three played Knights and follows the same strict-lead/tie-retention rule. Cards still in hand do not count as played Knights.

Scores are recalculated after actions that can affect them. An active player who reaches the target wins immediately after a complete action and the match becomes terminal. A forced robber move/steal or Road Building sequence finishes before the final win check. Public player scores omit hidden VP cards; each player sees their own true total. The final winner ID is public.

## 6. Command and random-outcome contract

`GameCommand` is a discriminated TypeScript union in `engine/types.ts`. Every command contains `type` and `actorId`. The server verifies the authenticated room seat equals `actorId`; the engine verifies turn and phase. The backend alone owns `expectedRevision` and idempotent `actionId`, compares them and commits the resulting state/events/views in one transaction. A failed command returns a stable rule error and **does not mutate input state**.

| Command | Input besides actor | Checks and effect |
| --- | --- | --- |
| `place-setup-settlement` | `vertexId` | Empty vertex; distance rule; place free settlement; second round yields adjacent resources. |
| `place-setup-road` | `edgeId` | Empty edge incident to the settlement just placed; place free road and advance setup. |
| `roll` | Trusted `dice` outcome | Active pre-roll only; produce resources or enter seven resolution. |
| `discard` | Five nonnegative integer resource counts | Actor owes exactly that many and owns them; return cards to bank. |
| `move-robber` | `hexId` | New board hex; find adjacent eligible opponents. |
| `choose-robber-victim` | `victimId`, trusted `stolenResource` outcome | Eligible adjacent opponent; transfer one random card. |
| `build-road` | `edgeId` | Connected legal edge, piece available; charge cost except in Road Building. |
| `build-settlement` | `vertexId` | Empty, distance, own road, piece, cost; recompute Longest Road if it cuts another player's path. |
| `build-city` | `vertexId` | Own settlement, city piece, cost; upgrade. |
| `buy-development` | None | Deck and cost available; draw hidden top card. |
| `play-knight` | `cardId` | Old enough, first action card this turn; played Knight count/award, robber sequence. |
| `play-road-building` | `cardId` | Old enough, first action card; up to two sequential roads. |
| `play-year-of-plenty` | `cardId`, two resources | Old enough, first action card; both exist in bank. |
| `play-monopoly` | `cardId`, resource | Old enough, first action card; collect that resource from opponents. |
| `bank-trade` | `give`, `receive` resource types | Different kinds, available cards, current best port rate. |
| `offer-trade` | `toPlayerId`, `give`, `want` counts | Active player offers cards held now to another seat; one pending offer at a time. |
| `accept-trade` / `reject-trade` | `tradeId` | Only recipient; accept rechecks both hands. |
| `cancel-trade` | `tradeId` | Only active offer sender. |
| `end-turn` | None | Active action phase with no pending trade; next seat goes to pre-roll. |

`applyGameCommand(state, command, outcome?)` returns a new `GameState`; it throws `GameRuleError(code, message)` on failure. The backend must treat the result as an indivisible update and must never send a `GameState` to a browser. `randomOutcomeForCommand` uses a server-provided integer source. `createGame` takes an ordered player list, board seed, and independently shuffled development deck. `projectGame(state, viewerId)` returns the per-seat `GameView`.

## 7. Per-player visibility contract

| Data | All seated players | Player themself | Server only |
| --- | --- | --- | --- |
| Hex terrain, numbers, ports, board graph, roads/buildings, robber | Full | Full | Full |
| Player names/colors, active seat, phase, roll, played Knights, awards, winner | Full | Full | Full |
| Opponent resource and development card **counts**, public points | Counts/score | Counts/score | Full |
| Resource types in a hand and unplayed development card identities | Never for opponents | Own only | Full |
| True score including hidden VP cards | Never for opponents | Own only | Full |
| Deck order and seed | Never | Never | Full |
| Pending seven discard requirement | Each sees only own count | Own count | All counts |
| Robber victim options | Active player only | Active player when choosing | Full |
| Direct trade details | Sender and recipient only | If involved | Full |

`GameView` contains only approved fields, not a redacted spread of the full state. `projectGame` rejects a nonmember player ID. Its `legal` field lists targets/actions visible to that viewer. Room membership and data access controls are still mandatory: an outsider must never be able to call this projection through an exposed query.

## 8. Errors and integration boundaries

Typical stable codes include `UNKNOWN_PLAYER`, `NOT_YOUR_TURN`, `WRONG_PHASE`, `ILLEGAL_SETTLEMENT`, `ILLEGAL_ROAD`, `ILLEGAL_CITY`, `INSUFFICIENT_RESOURCES`, `BANK_EMPTY`, `CARD_TOO_NEW`, `DEVELOPMENT_ALREADY_PLAYED`, `INVALID_DISCARD`, `ILLEGAL_ROBBER_HEX`, `ILLEGAL_ROBBER_VICTIM`, `TRADE_PENDING`, `TRADE_UNAVAILABLE`, `DECK_EMPTY`, and `GAME_COMPLETE`. The UI should show short human-readable messages and then refresh its authorized view after revision conflicts. It must not infer a failed command succeeded because of an animation.

No engine command directly edits a room or persists an event. Room service owns create/join/leave, host authority, ready/start, reconnect, close, and rematch. A room starts exactly one `createGame` transition. The backend stores the private canonical state and per-member projections, uses a transaction for command+revision+event+view, and broadcasts only an updated revision. The browser fetches its own authorized view after that signal or on reconnect.

## 9. Test matrix and remaining work

The engine tests cover graph count/ports/red spacing and deterministic board seeds, independent deck input, setup order and initial resources, invalid command immutability, seven/discard/robber sequence, server-weighted theft, view secrecy, paid road placement, ports, bank scarcity, direct trade, progress cards, army ties, immediate hidden-card win, and deterministic command replay. A complete-match simulation now reaches 10 points using only legal opening placements, rolls, development purchases, three played Knights, a city, a seven with discards, robber moves, and turn ends; its full command trace replays to the identical final state. Additional integration tests must cover database membership, repeated `actionId`, stale revision, concurrent accept/cancel, cross-browser reconnect, and host start/rematch. Four-browser playtesting remains necessary before calling the match release-ready.
