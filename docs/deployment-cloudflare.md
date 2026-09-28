# Cloudflare deployment

The Vite UI is hosted as a static Cloudflare Worker at
https://colonist-webapp.faizansagheer346c.workers.dev/. It was built locally with
`npm run build` and uploaded from `dist/` through the Cloudflare dashboard on
28 September 2026. The Worker is named `colonist-webapp`, uses single-page
application fallback, and is on the Workers Free plan. Supabase separately
provides Auth, room/game commands, database storage, and Realtime.

The existing `comicfluent` Pages project was not changed. The Cloudflare GitHub
connection currently belongs to `faizan346`; this Worker has no Git integration
and does not deploy automatically when `shadman346/colonist-webapp` changes.
The direct upload did not grant Cloudflare access to the GitHub repository.

## Deploy an update

1. Keep `.env.local` populated with `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` for the `shadman-app` project. These values
   are embedded in the browser build; never use a service-role or secret key.
2. Run `npm run build` locally.
3. In Cloudflare Workers & Pages, open `colonist-webapp`, choose **New deployment**,
   and upload the contents of `dist/`. Preserve the single-page application
   not-found handling setting.
4. Open the public URL and manually check room entry and a direct invite link.

`wrangler.jsonc` also names the same Worker and static asset directory if CLI
deployment is configured later. A Git connection can be added separately to
enable builds on push; limit the Cloudflare GitHub app to this repository if
that is chosen, and set the two `VITE_` values as build variables.

## Backend origin

The Edge Function shared server reads `APP_ORIGINS` for hosted origins. The
Cloudflare origin `https://colonist-webapp.faizansagheer346c.workers.dev` was
saved as the only custom origin on 28 September 2026. Both deployed command
functions contain the origin-checking code. Supabase makes secret updates
available to functions without redeploying them. Local development origins
are already in the function code. Email/password
sign-in does not use an email or OAuth redirect, so the Supabase Auth Site URL
does not need to change for this deployment.

## Manual release checks

The hosted sign-in page and a direct `/room/example` URL rendered from the new
domain on 28 September 2026. The remaining checks are a hosted sign-in and
room command, real invite refresh, member/outsider privacy, reconnect, and
complete four-player and expanded five- and six-player matches with rematches.
Record observed results in the manual validation handoff; do not add automated
tests for this work.
