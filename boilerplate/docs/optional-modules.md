# Optional modules

The base app does not require a backend, identity provider, database, or purchase
service. `available` means a supported opt-in integration; it is not enabled by
default. `planned` means a design direction, not an installable or functioning
choice. Do not treat planned modules as working generator options.

Select Supabase or TanStack Query during interactive generation, or pass
`--modules=supabase`, `--modules=tanstack-query`, or
`--modules=supabase,tanstack-query` for both.
The interactive selection starts empty, and `--yes` installs no optional modules
unless you supply `--modules`. Selected Supabase projects include setup guidance
at `docs/supabase.md`; selected Query projects include `docs/query.md` and an
automatically wired provider. The base app includes neither integration.

| Module                 | Status    | Intended responsibility                                                                 | Installer security or native-build concern                                                                                                                                                                                                                                  |
| ---------------------- | --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase               | available | Hosted authentication, Postgres data, and storage through an opt-in client integration. | Use only a public URL and publishable key in the client. Service-role credentials are server-only and must never appear in client code or client environment files. Enforce row-level security, review session storage, and configure redirect URLs for the app's variants. |
| TanStack Query         | available | Server-data caching, query lifecycle, retries, and invalidation for Axios or Supabase.  | Cache is memory-only. Scope private keys by account, cancel queries and clear cache on identity changes, and keep credentials out of cached data. Expo Network requires an appropriate native development build.                                                            |
| Firebase               | planned   | Analytics, Crashlytics, and messaging.                                                  | Review data collection, privacy disclosures, consent, and notification permissions. Register each variant, handle native configuration files and config plugins, and require a new native build. Keep admin and messaging-provider credentials server-only.                 |
| Clerk                  | planned   | Hosted user identity, sign-in, and session management.                                  | Expose only publishable keys, keep secret keys server-side, use secure token storage, and configure OAuth/deep-link redirects for each variant. Review native dependencies and rebuild requirements.                                                                        |
| WatermelonDB           | planned   | Local persistent data and offline synchronization.                                      | Configure its native database adapter and Expo config plugin or documented native setup, require a new native build, and define migrations and authenticated sync with conflict handling. Review sensitive local data storage and access controls.                          |
| RevenueCat / purchases | planned   | Store purchases, subscriptions, and entitlement state.                                  | Configure native purchase SDKs and store products for each platform, require a new native build, use platform-appropriate public SDK keys, and keep secret API keys and webhook verification server-side. Validate entitlements and restore purchases in store sandboxes.   |

Install only the integrations the app needs. Review their environment examples,
authentication redirects, data access policies, and native requirements before
use. `EXPO_PUBLIC_*` values are bundled into the app and are not secrets. Keep
local `.env` files out of version control and commit only placeholder examples.

After installing a module, run the project's validation commands and separately
verify its authentication, data, or purchase flows on the relevant platforms.
Native modules require a rebuilt development client; a passing unit test or
configuration check does not demonstrate native integration behavior.
