# Cloudflare deployment

The Vite UI is hosted as a static Cloudflare Worker at
https://colonist-webapp.faizansagheer346c.workers.dev/. It was built locally with
`npm run build` and uploaded from `dist/` through the Cloudflare dashboard on
28 September 2026. The Worker is named `colonist-webapp`, uses single-page
application fallback, and is on the Workers Free plan. Supabase separately
provides Auth, room/game commands, database storage, and Realtime.

The existing `comicfluent` Pages project was not changed. The initial release
used a dashboard upload. Subsequent pushes to `main` in
`shadman346/colonist-webapp` run `.github/workflows/deploy.yml` to build and
deploy this Worker. The Cloudflare deployment token is stored as the
`CLOUDFLARE_API_TOKEN` GitHub Actions secret and has **Individual Workers
Editor** access to `colonist-webapp` only. The repo's Actions variables hold
`CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, and the public
`VITE_SUPABASE_PUBLISHABLE_KEY`. No secret or service-role Supabase key is used
by the browser build.

## Deploy an update

1. Push the intended code to `main`. GitHub Actions runs `npm ci`, the TypeScript
   and Vite production build, then `wrangler deploy` using the Worker-only token.
   A manual run is also available through the workflow's **Run workflow** action.
2. Check that the GitHub Actions run and Cloudflare deployment completed.
3. Open the public URL and manually check sign-in, room entry, and a direct
   invite link. For game changes, use separate player identities and complete
   the applicable scenarios in the manual validation handoff.

For local builds, keep `.env.local` populated with the same two public Supabase
values. `wrangler.jsonc` names `colonist-webapp`, points at `dist/`, and keeps
the single-page application fallback. Do not create permanent automated tests
or run historical tests as a deployment gate.

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
