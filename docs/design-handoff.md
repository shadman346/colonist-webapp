# Figma design handoff

The editable production design is in [Friends Hex Game — Product Design & Board Screens](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=35-3). Page **09 Production Room Components** holds reusable room controls. Page **10 Editable Room Flow** holds the clickable room and match screens. Earlier concept pages were superseded.

## Main flow

| State | Figma frame | App behavior |
| --- | --- | --- |
| Private room entry | [43:94](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=43-94) | Create a room or enter a friend's code. |
| Join dialog | [43:613](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=43-613) | Show empty, valid, and error input states. |
| Host waiting | [41:4](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=41-4) | Copy invite, manage seats, watch readiness. |
| Guest waiting and ready | [43:379](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=43-379), [44:280](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=44-280) | Mark ready; host sees the change. |
| Host start enabled | [43:500](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=43-500) | Start after three or four players are ready. |
| Opening settlement | [56:819](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-819) | Start Game leads to the first legal corner choice. |
| Opening road | [58:3253](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=58-3253) | The road attaches to the chosen settlement. |
| Active Base match | [54:637](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=54-637) | Display board, turn, players, hand, and actions. |

The host's **Start Game** component navigates from `43:500` through opening settlement `56:819`, opening road `58:3253`, and the active match `54:637`. Additional room frames include host empty/full, invalid code, reconnecting, and 390 × 844 phone host/guest states. Their IDs and screenshot checks are recorded in the [room-flow research note](../../analysis/figma-room-flow-2026-09-28.md).

## Match state screens

| Decision | Desktop frame | Phone frame |
| --- | --- | --- |
| Active match | [54:637](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=54-637) | [56:4253](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-4253) |
| Seven: discard resources | [56:2798](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-2798) | [57:2485](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=57-2485) |
| Move robber | [56:1250](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-1250) | [57:2732](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=57-2732) |
| Choose robber victim | [56:3278](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-3278) | [58:2579](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=58-2579) |
| Friend trade offer/response | [56:1681](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-1681) / [56:3727](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-3727) | UI implemented; separate phone frames still to design |
| Match result | [56:2112](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=56-2112) | UI implemented; separate phone frame still to design |

The desktop prototype links opening → active turn, seven → discard → robber move → steal, and trade offer → response. The result is a separate terminal state; an ordinary End Turn does not imply a win. The [match-flow research note](../../analysis/figma-match-flow-2026-09-28.md) includes all frame IDs, interaction IDs, and natural-size QA captures.

## Layout and components

- Desktop room frames are 1280 × 720. The left rail is 130 px; players, settings/invite, and chat occupy three panels. The host's Start action or guest's Ready action stays visible at the bottom.
- Phone room frames are 390 × 844. Players/settings switch between views, with invitation and Ready/Start actions kept reachable.
- The active match frame is 1280 × 720: 19 reference-aligned terrain hexes, 18 screenshot-derived number plaques, nine harbor boats with paired piers, player/activity rail, and a 70 px resource/action tray. The board is a transparent imported image assembled outside Figma from traced source artwork. State-specific pieces, legal targets, prompts, and the surrounding interface remain editable. The 390 × 844 phone screens use the same imported art at a board crop scale.
- Component sets: Room Button `36:14`, Room Seat `36:51`, Room Option Tile `36:72`, Board Terrain Hex `52:53`, Resource Card `53:23`, and Player HUD Row `53:24`. The terrain and resource components use official image fills. Six imported harbor boat components start at `67:2914`; ten number plaque components start at `67:2920`.
- Type is Open Sans. Production room colors come from collection `VariableCollectionId:35:4`; board colors from `VariableCollectionId:51:637`.

## Source and implementation boundary

Reference pages **07 Exact Colonist References** and **08 Room, Invite & Join References** hold dated screenshots and video stills used to measure the interface. Source screenshots, 480 individual art crops, and extraction provenance remain under sibling `analysis/reference/` and `analysis/tile-assets/`. The playable app loads copied Colonist terrain, card, port, plaque, and robber art from its public asset folder; the Figma-only board composition is not in the deployed bundle. See [asset-manifest.md](asset-manifest.md).

The Figma screens show visual states and intended interactions. The app's room, match, and responsive behavior are verified separately through its browser flow and tests. A Figma prototype transition is not evidence that an equivalent server command has completed.
