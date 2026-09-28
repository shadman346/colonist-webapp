# Harbor Table

Harbor Table is a private Base hex-board game for three to six friends. Rooms with five or six seats use the expanded board and Special Build phase. This repository holds the web app, rules engine, Supabase migrations and functions, existing historical tests, and product handoff.

## Current build

The app has a responsive room flow: create a private room, invite by link or code, join, choose three to six seats, choose a 1–3 minute turn timer, chat, ready up, and start. Players create an email-and-password account, then use a display name in rooms. Email confirmation and anonymous sign-in are disabled in the hosted project. A Supabase connection is required to create or join rooms; the app does not fall back to browser-only play.

The Base rules engine is implemented and was previously exercised through a complete ten-point match. The interactive board uses that engine for opening placement, turns, dice, builds, bank and friend trades, development cards, robber/discard decisions, and results. Game commands run on Supabase and the browser reads only its own player view. A server-owned deadline advances an expired turn. Three separate browser identities have manually created, joined, readied, and started a hosted match; a complete hosted match and rematch still need manual validation.

## Run the app

~~~powershell
cd 'C:\StartUpsProject\Colonist workspace\colonist-webapp'
npm ci
npm run dev
~~~

Open the URL printed by Vite. Follow the manual scenarios and release gates in [implementation-plan.md](docs/implementation-plan.md). Do not create new automated tests or run existing ones as validation for new work. Run `npm run build` when preparing a deployable bundle; a successful build does not replace manual gameplay checks.

## Run with local Supabase

Docker Desktop must be running. Follow [backend-local.md](docs/backend-local.md) for the full setup and security checks. In brief:

~~~powershell
npx supabase start
npx supabase db reset
npx supabase status
npx supabase functions serve
~~~

Copy .env.example to .env.local and fill in the local API URL and publishable key printed by Supabase status. The app uses Supabase email/password Auth, private room commands, member-only data, and private Realtime revision signals. Turn off email confirmation in a local-only stack if you want it to match the hosted project. Do not put a service-role or secret key in a VITE_ variable.

On this machine the Docker service is currently stopped, so the real local Supabase stack has not run. The hosted Supabase schema and command functions are deployed. Earlier migration smoke checks and Edge Function typechecks are historical evidence; the current validation rule requires manual browser checks.

## Project map

| Location | Contents |
| --- | --- |
| src/ | Responsive room and match UI, local/Supabase room and match adapters |
| engine/ | Pure Base rules, projections, secure server randomness, and tests |
| supabase/ | Local configuration, migrations, Edge Functions, and database smoke tests |
| docs/rules-contract.md | Rule order, command behavior, and hidden information |
| docs/room-contract.md | Room states, permissions, and privacy contract |
| docs/implementation-plan.md | Detailed development and launch plan |
| docs/design-handoff.md | Figma screen and component links, layout notes, and source boundary |
| docs/asset-manifest.md | Shipped graphic/font sources and reference boundary |
| wrangler.jsonc and docs/deployment-cloudflare.md | Live static Cloudflare Worker and deployment notes |

Editable room and match screens with a clickable desktop/phone flow are in [Figma](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/Friends-Hex-Game-%E2%80%94-Product-Design---Board-Screens?node-id=35-3). Dated Colonist screenshots and video stills remain in the sibling analysis directory; they are not bundled with this app.

## Next release gates

1. Manually finish a standard hosted Base match with isolated browser identities, including forced robber/discard, development cards, reconnect, completion, and rematch. Check outsider access and privacy.
2. Repeat the remote room and match flow from separate devices after the static site is hosted.
3. Manually start and finish five- and six-player matches on the expanded board, including Special Build and timer expiry.
4. Complete the remaining editable Figma match states for both board sizes and compare desktop/phone rendering.
5. Deploy the static app to a Cloudflare account, configure its allowed origin, then manually play standard and six-player matches with remote friends.

The hosted project has no configured email sender for password recovery. Players should keep their passwords safe until SMTP and recovery are set up.
