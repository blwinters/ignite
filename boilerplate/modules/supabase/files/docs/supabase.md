# Supabase

This project opted into Supabase with `--modules=supabase`. The module adds
`@supabase/supabase-js`, `react-native-url-polyfill`, a public configuration loader,
and a client at `services/supabase/client.ts`. That top-level location works with
both navigation choices; import it with the relative path from the calling file.

Copy `.env.example` to `.env`, then set `EXPO_PUBLIC_SUPABASE_URL` to your project's
HTTPS URL and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its `sb_publishable_` key.
HTTP URLs are supported only for localhost development. Restart Expo after changing
environment values. These public values are bundled into the app and are not secrets.
The loader rejects missing or invalid values without including them in errors.
It accepts publishable keys only; legacy JWT keys are not supported.

Service-role credentials are server-only and must never appear in client code or
client environment files. Enforce row-level security on exposed tables and storage,
and test policies as both signed-in and signed-out users before shipping.

The provided client keeps sessions in memory: users must sign in again after a
restart. Choose and review a secure storage adapter before enabling persistent
sessions. Automatic URL session detection is disabled; implement and test explicit
auth callback handling and configure redirect URLs for each app variant before
using OAuth or email links. Review foreground/background token refresh behavior on
devices when adding authentication flows.

Run the project's `check` command after changes. Config tests need no configured
backend or network calls. Separately verify authentication, data access, and policy
behavior with your backend on the platforms you support; static checks do not prove
those flows. No backend project, policy, or auth screen is provisioned by this module.

## Removal

1. First remove application imports and usages of Supabase, including authentication
   handlers and queries that depend on the client.
2. Remove both `@supabase/supabase-js` and `react-native-url-polyfill` with your
   project's package manager: npm uses `uninstall`; Yarn, pnpm, and Bun use `remove`.
   Commit the updated package manifest and lockfile.
3. Delete the module's `services/supabase/` files, including its config test, and
   `docs/supabase.md` when no longer needed.
4. Remove `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from
   local `.env` files and configured build environments, and remove their placeholders
   from `.env.example`. Keep any unrelated environment entries and the `.env` ignore
   rules; delete `.env.example` only if it has no remaining entries.

Run the project's `check` command after removal to catch remaining references.

See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
and [React Native authentication](https://supabase.com/docs/guides/auth/quickstarts/react-native).
