# Supabase project connection

The hosted game project is [shadman-app](https://supabase.com/dashboard/project/qgexzgypshkqzcgypcxr), project ref `qgexzgypshkqzcgypcxr`, in the `shady` organization.

## Codex MCP

This repository defines a separate `colonist_supabase` server in [`.codex/config.toml`](../.codex/config.toml). Its URL includes `project_ref=qgexzgypshkqzcgypcxr`, so database tools are scoped to this game. The Codex project is trusted on the current machine, and OAuth sign-in to that server succeeded on 28 September 2026. No access token or service key is stored in the repository.

The existing Supabase plugin is still authorized for the other Supabase account. Its project list does not include `shadman-app`; do not use that plugin to make changes for this game. Open a Codex session rooted at this repository after the MCP configuration loads, then select the `colonist_supabase` tools. A project-scoped MCP server disables account-wide project-list tools; verify with a read-only table or migration listing for this project instead.

To check the local connection configuration, run `codex mcp get colonist_supabase` from this repository. If OAuth expires, run `codex mcp login colonist_supabase` here and authorize the `shady` organization. That sign-in is separate from the other project's Supabase connection.

## App connection

The browser app uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an ignored `.env.local` file. The project URL is `https://qgexzgypshkqzcgypcxr.supabase.co`; obtain the publishable key from this project's API Keys page after checking that it is enabled. Never put a secret or service-role key in a `VITE_` variable. On 28 September, five checked-in migrations and both authenticated Edge Functions (room-command version 4; game-command version 5) were deployed. Email/password sign-up is enabled without email confirmation; anonymous sign-in remains disabled. A three-player hosted match and a five-seat waiting room were manually observed. The expanded match itself, full-match/rematch, outsider access, and cross-device hosted-site checks remain open.
