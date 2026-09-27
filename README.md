# Harbor Table

Harbor Table is a private Base hex-board game for three or four friends. This repository holds the web app, rules engine, Supabase migrations and functions, tests, and product handoff.

## Current build

The app has a responsive room flow: create a private room, invite by link or code, join, choose three or four seats, chat, ready up, and start. With no Supabase configuration, this is a browser-only preview shared across tabs on the same origin. It lets you play and inspect the Base match locally; it does not connect friends on different devices.

The Base rules engine is implemented and tested through a complete ten-point match. The interactive board uses that engine for opening placement, turns, dice, builds, bank and friend trades, development cards, robber/discard decisions, and results. In a configured Supabase deployment, game commands run on the server and the browser reads only its own player view. That hosted flow still needs a live Supabase end-to-end test.

## Run the app

~~~powershell
cd 'C:\StartUpsProject\Colonist workspace\colonist-webapp'
npm ci
npm run dev
~~~

Open the URL printed by Vite. To check the current build:

~~~powershell
npm run typecheck
npm test
npm run build
~~~

## Run with local Supabase

Docker Desktop must be running. Follow [backend-local.md](docs/backend-local.md) for the full setup and security checks. In brief:

~~~powershell
npm --prefix supabase/tests ci
npm --prefix supabase/tests test
npx supabase start
npx supabase db reset
npx supabase status
npx supabase functions serve
~~~

Copy .env.example to .env.local and fill in the local API URL and publishable key printed by Supabase status. A configured app uses Supabase anonymous Auth, private room commands, member-only data, and private Realtime revision signals. Do not put a service-role or secret key in a VITE_ variable.

On this machine the Docker service is currently stopped, so the real local Supabase stack has not run. The migration smoke tests and Edge Function typechecks pass independently.

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
| wrangler.jsonc and docs/deployment-cloudflare.md | Static Cloudflare Workers deployment preparation |

Editable room and match screens with a clickable desktop/phone flow are in [Figma](https://www.figma.com/design/kw6x7wzSsQpzAfcUfSx2Z8/Friends-Hex-Game-%E2%80%94-Product-Design---Board-Screens?node-id=35-3). Dated Colonist screenshots and video stills remain in the sibling analysis directory; they are not bundled with this app.

## Next release gates

1. Run the full local Supabase stack and verify multiple isolated browser identities, access rules, reconnect, and rematch.
2. Exercise a full Base match through the hosted player UI, including forced robber/discard, development cards, completion, and rematch.
3. Complete the remaining editable Figma match states and compare desktop/phone rendering.
4. Create Supabase and Cloudflare accounts for hosted deployment and remote friend playtests.

Cloudflare and hosted Supabase credentials are not needed to inspect this local build.
