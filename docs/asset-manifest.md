# Shipped asset manifest

Updated 28 September 2026.

| Asset | Provenance | App and Figma use |
| --- | --- | --- |
| Open Sans Latin 400, 600, 700, 800 | `@fontsource/open-sans`, SIL Open Font License 1.1 | Interface typography |
| Interface icons | `lucide-react`, ISC license | Navigation and actions |
| Base terrain hexes: wood, brick, wool, grain, ore, desert, gold | Colonist's public SVG files, exact copies mapped by URL and SHA-256 in [`public/assets/colonist/base/provenance.json`](../public/assets/colonist/base/provenance.json) | `BoardPreview` and `MatchView`; transparent 2× PNG exports in Figma terrain components |
| Five resource cards and five development cards | Same official SVG source and hash record | Hand, bank, development card UI, and Figma resource card components |
| Six harbor boats and robber icon | Same official SVG source and hash record | Nine edge-linked Base harbors in the app; boat components in Figma |
| Number plaques 2–12, excluding 7 | Cropped from saved official screenshots; extraction boxes and repair recorded in sibling `analysis/tile-assets/number-token-provenance.json` | Board numbers in the app and Figma reference composite |
| Imported Base board composition | Official tile/harbor files plus screenshot-derived plaques, shore and pier pixels; recipe in sibling `analysis/tile-assets/board-composite-base-provenance.json` | Image fill in 9 desktop and 4 phone Figma match frames; it is not loaded by the app |
| 480 individual reference crops | 449 board tile instances and 31 card, port, and map details from dated Colonist screenshots; each source file, bounding box, and hash is recorded in sibling `analysis/tile-assets/` | Research and asset QA; not loaded by the app |

The app loads the selected Base art from [`public/assets/colonist/base/`](../public/assets/colonist/base/). The PNGs in its `png/` subfolder are raster exports of the same SVGs for Figma. The app uses PNG files where nested SVG rendering failed in Chrome. Resource counts, player roads, settlements, and game state remain live UI elements.

The isolated art and screenshot crops are Colonist artwork. This manifest records their origin; it does not claim they are original project artwork or grant a redistribution license. Source pages include [Colonist's Base rules](https://colonist.io/catan-rules), [Seafarers rules](https://colonist.io/catan-rules/seafarers), and [press kit](https://colonist.io/press-kit).
