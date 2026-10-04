# TanStack Query

Select `tanstack-query` in the empty-by-default optional-module prompt, or use
`--modules=tanstack-query`. It can coexist with Supabase:
`--modules=supabase,tanstack-query`. The generator installs
`@tanstack/react-query` 5.104.1 and Expo SDK 55's `expo-network` ~55.0.18 and wraps
the app entry with `QueryProvider`. The entry is `src/app/_layout.tsx` for Expo
Router or `app/app.tsx` for React Navigation. Shared code lives in root
`services/query/`.

Axios sends requests using the app's configured API URL, JSON Accept header,
and 10-second timeout. It rejects failures and does not cache or retry requests.
Query manages server-data caching, loading/error state, retries, refresh, and
invalidation. Authentication and token refresh remain your app's responsibility.

## Defaults and lifecycle

The provider retains one QueryClient while mounted. Data stays fresh for 60
seconds; inactive cache entries are collected after 5 minutes. Queries retry at
most twice after Axios network errors, timeouts, or HTTP 5xx failures. Cancellation,
HTTP 4xx responses, and unclassified errors do not retry automatically. Mutations
never retry automatically. Override `staleTime`, `gcTime`, or `retry` per query
when a particular endpoint needs a different policy.

On native platforms, AppState initializes focus and tracks foreground/background
changes. Expo Network initializes online state and tracks reconnects. Unknown
network readings keep the previous online state. A late initial read cannot
overwrite a newer event, and cleanup removes listeners and ignores late updates.
Web retains TanStack's browser focus and online behavior. Verify native background
and reconnect behavior on a simulator or device after installing the module;
rebuild the development client to include Expo Network when needed.

## Query an Axios API

Replace the sample endpoint and domain type with your application's API. Put
hooks under the app's existing `services` or feature directory:

```ts
import { useQuery } from "@tanstack/react-query"

import { api } from "@/services/api"

type Project = { id: string; name: string }

export function useProjects(accountId: string) {
  return useQuery({
    queryKey: ["accounts", accountId, "projects"],
    queryFn: async ({ signal }) => {
      const { data } = await api.client.get<Project[]>("/projects", {
        params: { accountId },
        signal,
      })
      return data
    },
  })
}
```

Passing Query's AbortSignal to Axios cancels obsolete requests. API methods can
also accept and forward this signal. Return application data from the query
function and let errors reject; returning `{ ok: false }` would cache a failure
as successful data. Consumers use `data`, `isPending`, and `error` from the hook.

## Query Supabase directly

If you also selected Supabase, import its root client with the relative path
appropriate to your hook. This example assumes a file at
`services/projects/useProjects.ts`:

```ts
import { useQuery } from "@tanstack/react-query"

import { supabase } from "../supabase/client"

export function useProjects(accountId: string) {
  return useQuery({
    queryKey: ["accounts", accountId, "projects"],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("account_id", accountId)
        .abortSignal(signal)
      if (error) throw error
      return data
    },
  })
}
```

Supabase SDK errors must be thrown. They are unclassified by the Axios retry
policy and therefore do not retry unless the query supplies its own policy.
Query does not replace Supabase auth, row-level security, or session handling.

## Invalidate after writes

Invalidate the affected account's keys when a mutation succeeds:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/services/api"

export function useRenameProject(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await api.client.patch(`/projects/${id}`, { name })
      return data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accounts", accountId, "projects"] }),
  })
}
```

Account/user IDs belong in keys for private data. Include other request inputs
such as filters or pagination as well. Keys help partition cached data, but do
not grant authorization. Keep tokens and credentials out of keys and cached data.

## Logout and account changes

Disable or unmount queries for the old identity before switching accounts. In
the app's logout/account-switch flow, cancel outstanding queries and clear the
old cache before exposing the new identity:

```ts
await queryClient.cancelQueries()
queryClient.clear()
```

Forward cancellation signals so old requests stop. Guard outstanding mutations
and their success callbacks against an identity change; cancellation of queries
does not cancel writes already sent to the server. Mount/enable the new identity's
queries only after auth state and cache cleanup are complete.

## Cache storage

The cache is memory-only. Restarting the app loses it. This module includes no
AsyncStorage cache, persister, offline mutation queue, or credential storage.
Persistent caching is a separate future choice: define retention, schema/version
migration, sensitive-data handling, and logout cleanup before adding a persister.

## Removal

First remove Query hooks and their usages. Remove the `QueryProvider` import and
wrapper from your app entry. Uninstall `@tanstack/react-query` and `expo-network`
with `npm uninstall`, or use your selected Yarn, pnpm, or Bun `remove` command.
Delete `services/query/` and `docs/query.md`. Keep Supabase if the app still uses
it. Reinstall dependencies, commit the updated lockfile, run the project's
`check` command, and rebuild the development client if its native dependencies
changed.
