# Manual UI walkthrough — 28 September 2026

This is a record of hands-on validation in the running browser app, not an automated test suite. No permanent tests were created or run.

| Scenario | Expected | Observed |
| --- | --- | --- |
| Desktop room entry at 1280 × 720 | Private Rooms table, name field, create/join actions, and guide panel match Figma frame 43:94 | Visually checked in the browser; controls and layout rendered. |
| Join dialog | Code is prefilled from an invite link; name remains editable on the entry screen; confirmation joins the room | Visually checked against frame 43:613. A second tab joined by code as Friend Two. |
| Entry guidance and settings | How It Works changes the information panel; Settings opens a usable name dialog | Switched the tab and opened the dialog in a fresh browser tab. |
| Host waiting room | Invite, seats, mode/map, chat, settings, and fixed Start action match frame 41:4 | Visually checked. The full map row fitted at 1280 × 720; settings expanded and scrolled without hiding Start. |
| Seat count | Host changes four seats to three; visible count and open seats update | Changed from 1/4 to 1/3. The app showed the readiness-reset message. |
| Three player flow | Two guests join, ready up, and host starts | Friend Two and Friend Three joined in separate tabs, marked Ready, and the host's Start Game enabled. All three tabs entered the match. |
| Opening turn | Host places settlement and adjacent road; next player receives the turn | Settlement advanced to road with two legal targets; road advanced the turn to Friend Two in both tabs. |
| Phone host at 390 × 844 | Players and Settings switch as in Figma frames 46:365 and 47:365; invite and Start are reachable | Both tabs switched and rendered; the Players view showed seats/chat and Settings showed invite/mode/map. Start remained disabled with one player. |
| Production compilation | TypeScript and Vite compile current UI | `npm run build` completed successfully. This is a compilation check, not an automated test run. |
| Hosted Supabase connection | Project tools respond and reveal current backend state | Initially empty. Three migrations and both authenticated command functions were then deployed to `shadman-app`; browser configuration was added in ignored `.env.local`. |

## Hosted three-player walkthrough

This session used three disposable email/password accounts in separate browser origins: an in-app browser on `127.0.0.1`, Chrome on `127.0.0.1`, and Chrome on `localhost`. Supabase email confirmation was turned off with the owner's approval; anonymous sign-in stayed off. Browser password-save prompts were not accepted.

| Scenario | Expected | Observed |
| --- | --- | --- |
| Create account without email confirmation | A new account receives a session immediately, without an email | All three disposable accounts reached the signed-in room entry. |
| Host room and invitation | Host creates a private room, guests follow its code/link and join with display names | Host created room `109740C7673D9B1C`; Guest One and Guest Two joined from separate browser origins. |
| Configure timer | Host selects a timer before starting; every member sees it | Host changed 90 to 120 seconds; guest room screens showed 2 minutes. |
| Ready and start | Host starts only after the two guests ready | Start enabled after both guests readied. All three browsers entered the same hosted match. |
| Live board update | A committed move reaches other players through one private channel | Initial attempt showed “Connecting” because room and match screens opened duplicate channels. The subscription was shared; after reload, host and guest showed “Live,” and the host saw Guest One's settlement advance to a road prompt. |
| Timed setup | Server deadline governs the countdown and resolves expiry | The host's first road expired. The server placed a legal road, recorded “ran out of time,” advanced to Guest One, and reset the two-minute clock. |
| Sign out and return | A password account can reclaim its seat after signing out | Guest Two signed out, then signed in with the same account in Chrome; the running match and its own turn returned with “Live” status. |
| Compilation | Current client and engine compile | `npm run build` completed after the shared-channel fix. |

No permanent automated tests were created or run. This walkthrough does not yet cover an entire hosted match, rematch, outsider data checks, a fourth player, or separate physical devices.

## Expanded room walkthrough

The host created a second hosted room, increased its capacity from four to five, and observed the expanded map selection. Supabase stored `max_players = 5` and `map = large`. Guest One and Guest Two joined through invite links from separate browser origins and marked Ready; the host still saw Start disabled because five players are required. The 30-hex match and Special Build phase have not yet been played in the browser. No additional account was created for this check.

## Open release checks

- Finish a complete hosted room/game and rematch, plus outsider/privacy checks, before claiming release-ready cross-device multiplayer.
- Manually start and finish five- and six-player matches on the expanded Base board, including larger supplies and Special Build.
- Complete a full remote match and rematch with isolated player identities, checking private hands and reconnect behavior.
- Compare less common match states and phone screens with their linked Figma frames during their implementation.
