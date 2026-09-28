# Colonist interaction artifacts

The crops in `colonist-reference/` came from the saved live Colonist trade, activity, and board screenshots in the sibling `analysis/` workspace. They were used as visual references for new transparent game sprites, not pasted into the playable board. The original generated images are in `generated-source/`; `prepare_colonist_pieces.py` trims and scales them into `public/assets/colonist/pieces/`, and recolors the blue bevel for the other player seats. The five Figma screen captures and a contact sheet are in `colonist-reference/`.

The image generator was prompted for single transparent, small-screen-readable settlement and road sprites matching each red or blue screenshot crop's beveled silhouette, roof/door or raised road shape, lighting, and dark outline. The dice pair was generated from the saved dice crop, then edited so its visible faces read 3 and 5 for the example production roll of 8. The generated source images and exported sprites are kept separately so the exported sizes can be changed without rerunning generation.

| Interaction state | Editable Figma frame |
| --- | --- |
| Select a small legal corner | [01 Select settlement](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=147-1090) |
| Click the house icon to confirm | [02 Confirm settlement](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=147-1424) |
| Dice, bank-to-hand delivery, and receipts | [03 Dice and resource delivery](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=147-1763) |
| Compact two-row friend trade tray | [04 Friend trade tray](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=147-2091) |
| House, road, resource, and robber actions | [05 Build and robber actions](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/?node-id=147-2448) |

These frames are visual interaction states. The authoritative move, dice, trade, and resource allocation rules run in the game engine and hosted Supabase function.
