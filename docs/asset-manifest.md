# Shipped asset manifest

Updated 28 September 2026.

| Asset | Source | App use | Status |
| --- | --- | --- | --- |
| Open Sans Latin 400, 600, 700, 800 | @fontsource/open-sans package, SIL Open Font License 1.1 | Interface typography | Bundled through src/main.tsx |
| Interface icons | lucide-react package, ISC license | Navigation and actions | Rendered as SVG components |
| Brand mark, mode/map hex art, board terrain, sea, pieces, and card visuals | Original CSS/SVG shapes in src/App.tsx, src/MatchView.tsx, src/matchStyles.css, src/BoardPreview.tsx, and src/styles.css | Room and playable match UI | Shipped as code, editable in source |
| Colonist room screenshots, larger-map video stills, and other research captures | Dated sources in sibling analysis/reference/ | Visual measurement and Figma reference pages 07–08 | Reference only; not included in app bundle |
| Editable room and match design | Figma pages 09–10 in the project design file | Design source, not loaded by the app | Desktop and 390 px phone flow created; see design-handoff.md |

No copied Colonist screenshot or extracted Colonist image file is currently in src/ or the production bundle. Recheck this manifest whenever new image files are added.
