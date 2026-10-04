# Networking and optional query caching

## Intent and scope

Replace the starter's unmaintained Apisauce dependency with Axios, then offer TanStack Query through the existing optional-module selection. Ben approved this direction and requested planning, implementation, and inclusion in Ignite PR #1. Preserve the prior subagent execution method and the existing PR branch.

## Boundaries

- Axios sends requests. Shared configuration supplies the existing API URL, a 10,000 ms timeout, and JSON Accept header. It does not add caching or automatic retries.
- API methods resolve application data or reject with an error. They accept an optional AbortSignal and forward it to Axios. Preserve the demo podcast behavior by updating its consumer to catch rejected requests.
- TanStack Query owns server-data caching, query retries, loading/error state, refresh, and invalidation. It can call Axios API functions or Supabase directly; Supabase failures must be thrown by the calling query function.
- User authentication, token refresh, domain-specific query keys, and cache persistence remain application decisions. Do not install a second authentication system or store credentials in the cache.

## Base app

Use Axios 1.20.0 directly. Keep the existing Api class and api singleton; expose its Axios instance as `client`. Change the demo `getEpisodes(signal?: AbortSignal)` to return `Promise<EpisodeItem[]>`. Migrate the optional error-classification helper to accept unknown errors and recognize Axios network, timeout, HTTP status, and cancellation cases without converting failed API requests into successful results. Remove all Apisauce imports/dependencies and update starter documentation and Metro comments to describe Axios accurately.

## Optional TanStack Query module

The identifier is `tanstack-query`; it appears beside Supabase in the empty-by-default interactive multiselect and works with `--modules=tanstack-query` or `--modules=supabase,tanstack-query`. Deduplicate repeated selections. Base and Supabase-only apps contain no Query provider, query dependencies, or query module files.

Use @tanstack/react-query 5.104.1 and Expo SDK 55-compatible expo-network ~55.0.18. Copy the module to root `services/query/` and its guide to `docs/query.md`, matching the existing optional-services layout. Automatically wrap the surviving app entry in QueryProvider: `app/app.tsx` for React Navigation or `src/app/_layout.tsx` for Expo Router. The provider retains one QueryClient across rerenders.

Defaults: staleTime 60,000 ms, gcTime 300,000 ms, at most two retries for Axios network/timeouts and HTTP 5xx errors, no automatic retries for cancellation, HTTP 4xx, or unclassified errors. Mutations do not retry automatically. Callers can override these policies per query. Cache is memory-only.

Native integration initializes focus from AppState and tracks active/background changes. Expo Network initializes online status and tracks reconnects. A slow initial network read must not overwrite a newer event, and unmounted providers must not receive late updates. Unknown network status must not force the client offline. Remove listeners on unmount; preserve TanStack's browser focus/online behavior on web.

## Documentation and validation

Document Axios-versus-Query responsibilities, query/mutation examples, passing cancellation signals, throwing Supabase errors, user/account-scoped query keys and clearing cache on logout/account changes, invalidation after writes, module removal, and the separate future choice of persistent caching.

Tests must exercise real Axios success/rejection/cancellation, retry policy and QueryClient caching/invalidation, lifecycle initial state/event races/cleanup, generation with both navigation options and both modules together, and absence when unselected. Hosted generated fixtures must run the full check for both Query navigation paths and combined Supabase/Query. Preserve upstream demo-retaining React Navigation coverage and nonmutating validation.

References: [Apisauce maintenance](https://github.com/infinitered/apisauce#apisauce), [Axios instances](https://axios-http.com/docs/instance), [TanStack query errors](https://tanstack.com/query/latest/docs/framework/react/guides/query-functions), [React Native integration](https://tanstack.com/query/latest/docs/framework/react/react-native).
