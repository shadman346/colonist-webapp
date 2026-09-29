# Match interaction reference, round 2

The eleven user supplied crops dated 29 September 2026 are the visual source for this pass. The existing Colonist card, terrain, robber, house, road, and dice assets remain the art source; the new work arranges them into these states:

| State | Reference detail | Interaction |
| --- | --- | --- |
| Turn ready | Two dice float in the lower left sea with a restrained scale pulse. | One click rolls both dice. A short two note chime plays once when control passes to you, subject to the browser's audio setting. |
| Resource and action bar | One long parchment hand tray, a cyan Trade tile, then compact Road, House, City, Robber, and Development tiles. | A tile gains the bright cyan affordance when its action is legal and affordable. End turn stays a small separate control. |
| Road from house | Owned house acts as the placement anchor; adjacent legal edges glow gold and a small road tile appears over the house. | Click the house, then a highlighted edge to place the road. Other legal edges remain available through the accessible position list. |
| Trade | Full width resource strip with Give and Receive rows and a right action rail. | Friend offers keep a chosen recipient; bank offers highlight usable give cards and the available trade tile. |
| History | Parchment event rows with player name, two dice faces, resource cards, and build/trade icons above the chat drawer. | Events are ordered newest first. Chat messages remain available below the match history. |

The screenshots are references, not game-state data. Affordability and legal actions come from the authoritative match view; the UI never grants an action on its own.

## Editable Figma screens

- [Your turn and compact bar](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=158-2)
- [Road from selected house](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=158-330)
- [Bank and friend trade](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=158-658)
- [History and action affordability](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=158-986)

## Manual validation, 29 September 2026

| Scenario | Expected | Observed | Open item |
| --- | --- | --- | --- |
| Remote turn 34 starts for Design QA | Two clickable dice in the lower-left sea, controls update without reload | Dice appeared in the sea and room status read Live. Clicking rolled 5 and 2; the board advanced to robber placement and history showed both dice. | Chime cannot be heard through browser automation; verify volume with two real players. |
| Bank trade after roll | Usable trade tile highlights; 4 ore exchanges for 1 brick | Trade tile highlighted, panel selected ore and brick, trade committed, hand and bank counts updated, history rendered 4× ore → brick. | None seen. |
| Friend trade layout | Resource strip, recipient, Give and Want rows, action rail | Both recipient choices and the card rows displayed at desktop size. Scrollbar overlap found and removed. | Offer acceptance was not sent in this pass. |
| Room socket after timeout | Recover to Live with polling as a fallback | A timed-out private channel recovered to Live after reconnect handling was added. | Observe with two remote player devices during a longer match. |
| Setup road from selected house | House selection reveals neighboring legal road edges | Screen and click logic are prepared; the active QA match had already completed setup. | Manually validate in the next new remote match. |
| Resource flight after dice | New cards travel from bank to hand and history lists recipients | A later 2 + 2 roll awarded Design QA one grain. The +1 card flight appeared, the hand increased from four to five, and history listed the grain receipt. | The short motion was not captured in a still screenshot. |

## Compact dock and Canvas island, 29 September 2026

The later bottom-bar crop adds the precise layout reference for this pass: a long ivory resource tray, cyan square action tiles, piece counts on their upper right corners, and a small placement prompt with turn clock above the right edge. Existing card and piece artwork was reused at tile scale; cropping the low-resolution screenshot would have made those controls blurry. The static island, coastline, piers, terrain, numbers, and ports now render on a high-density Canvas. SVG remains over it for owned pieces and accessible legal placement controls, including the house-to-road selection and the confirm popup. This keeps the server-owned rules and target labels intact while supporting a smoother board presentation.

| Scenario | Expected | Observed | Open item |
| --- | --- | --- | --- |
| Desktop QA room on a friend's timed turn | Canvas island remains aligned with buildings; compact card tray and action tiles stay inside the board column; prompt and clock show who is playing | At 1280×720, terrain, coast, ports, roads, buildings, cards, six dock tiles, prompt, and timer rendered without overlap. Private room status stayed Live. | Narrow mobile viewport has not been visually inspected in this pass. |
| Design QA turn 421 dice roll | Roll control appears in lower-left sea; result, hand, and history update in place | Rolled 1+5. History showed both dice and Design QA receiving one wood; hand rose from 11 to 12 cards and Orange QA's ore receipt appeared. | Short card flight was not captured during this roll. |
| City selection and confirmation | Affordable upgrade tile highlights; only legal corners can be selected; confirmation precedes the build | Upgrade tile enabled and two corners were offered. Selecting one displayed the city popup. Confirming upgraded the house, reduced hand from 12 to 7, raised Design QA from 2 to 3 VP, and added the history event. | Setup settlement and road selection need a fresh match for manual recheck. |

No permanent tests were added or run for this pass.
