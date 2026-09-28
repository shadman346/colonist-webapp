# Cloudflare deployment preparation

The web app is a Vite single-page application. wrangler.jsonc is ready to serve the dist/ build through Cloudflare Workers Static Assets. It is intentionally a static deployment: Supabase provides Auth, room/game commands, database storage, and Realtime.

The config uses single-page-application fallback so direct visits to future room/game paths can load index.html. Cloudflare documents this behavior at https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/.

## Before publishing

1. Finish the local Supabase and authoritative match UI checks for both the standard and 5–6 player Base boards in the implementation plan.
2. Use the existing [shadman-app Supabase project](supabase-connection.md). Its migrations, authenticated Edge Functions, email/password sign-in, and private Realtime policy are deployed. Keep anonymous Auth disabled. Verify the member/outsider checks in backend-local.md before wider invitations.
3. Create or connect the Cloudflare account and push this Git repository to a remote you control.
4. In Workers Builds, connect that repository. Set the build command to npm run build and the deploy command to npx wrangler@4.142.0 deploy. Set the project root to this repository folder if it sits inside a larger repository.
5. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY as **build** variables. Vite embeds both into the browser bundle; neither is a server secret. Do not add a Supabase service-role or secret key.
6. After the first deployment, put the exact HTTPS Workers origin into the Supabase Edge Function APP_ORIGINS setting and the project's site/redirect configuration as needed.
7. Manually check a direct room link refresh, then complete remote four-player and six-player matches, privacy, reconnect, and rematch checks. Review actual usage before inviting wider traffic.

The Workers Builds settings and distinction between build-time and runtime variables are documented at https://developers.cloudflare.com/workers/ci-cd/builds/configuration/.

## Local validation already possible

Run `npm ci` and `npm run build` to prepare the deployable bundle in `dist/`. Manually check the app flows in the browser using the implementation plan; do not use automated test runs as the release gate. A Cloudflare account is not needed for the local build. A Wrangler 4.142.0 dry run on 28 September 2026 read all 12 built asset files and validated the static Worker configuration without uploading.

Wrangler 4 requires Node 22 or newer. This machine's default Node is 18, so use a Node 22+ runtime for future Wrangler commands. The current Workers Builds image defaults to a newer Node version; confirm that setting at deployment time.

Wrangler upload and the remote browser test are deferred until Cloudflare account access and the remaining hosted gameplay/access checks are complete. Local browser tabs have reached hosted Supabase commands successfully; a successful static build alone is not proof of a complete remote match.
