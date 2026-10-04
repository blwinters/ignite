# Networking and Query Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Replace Apisauce with Axios and add an optional TanStack Query integration to existing Ignite PR #1.

**Architecture:** Axios handles HTTP transport; API functions return data or throw. An optional module supplies QueryClient policy and a provider wired into either navigation entry, with native focus/connectivity integration.

**Tech Stack:** TypeScript, Axios 1.20.0, @tanstack/react-query 5.104.1, expo-network ~55.0.18, Expo SDK 55, Jest.

**Spec:** `docs/superpowers/specs/2026-10-03-networking-design.md`

## Global Constraints

- Work on the existing `codex/personal-defaults` checkout and update PR #1; do not merge.
- Axios uses the existing API URL, a 10,000 ms timeout, and JSON Accept header; no transport retries or cache.
- API functions return data or reject errors and forward optional AbortSignal.
- `tanstack-query` is opt-in and combinable with `supabase`; no query dependencies or files when unselected.
- Query defaults: staleTime 60,000 ms, gcTime 300,000 ms, at most two retries for Axios network/timeouts or HTTP 5xx; none for cancellation, 4xx, unclassified errors, or mutations.
- Cache is memory-only; native listeners initialize state, avoid stale-read races, and clean up; retain web behavior.
- Keep lint/check nonmutating. Never request, print, or commit credentials; no deployment or store operations.

## Review Focus

- Failed/cancelled Axios requests reject instead of becoming successful cached results: Task 1 runtime tests.
- Demo-retaining React Navigation still renders fetched episodes: Task 1 consumer migration and hosted integration.
- Duplicate/combined module selection preserves Supabase files/env and wraps each app entry once: Task 2 generation tests.
- Initial connectivity reads can resolve after a newer event or unmount: Task 2 lifecycle regression tests.
- User switches cannot reuse another user's cache: Task 2 guide must show scoped keys plus cancel/clear on logout or account change.

---

### Task 1: Replace the HTTP transport and demo contract

**Files:** Modify `boilerplate/package.json`, `boilerplate/app/services/api/{index.ts,types.ts,apiProblem.ts,apiProblem.test.ts}`, `boilerplate/app/context/EpisodeContext.tsx`, `boilerplate/metro.config.js`, `README.md`, `docs/README.md`, `docs/Guide.md`, `docs/boilerplate/app/services/{Services.md,api.ts.md}`. Create `boilerplate/app/services/api/index.test.ts` and focused root runtime/generation tests as needed. Add Axios to root devDependencies only if needed to execute real generated-source tests locally; keep versions aligned and update pnpm lockfile.

**Interfaces:** Consumes existing ApiConfig and EpisodeItem. Produces `Api.client: AxiosInstance`, `Api.getEpisodes(signal?: AbortSignal): Promise<EpisodeItem[]>` (demo removable), existing `api` singleton, and `getGeneralApiProblem(error: unknown): GeneralApiProblem | null` (null for cancellation).

- [ ] Step 1: Write failing tests asserting Axios dependency and absence of Apisauce in both generated navigation variants; default URL/10,000 ms/Accept configuration; actual adapter success returns episode data; HTTP 401/500, network, timeout, malformed response, and cancellation reject; signal reaches the request. Test migrated classification and demo consumer contract.
- [ ] Step 2: Run focused tests and record expected RED evidence before source changes. Prefer lightweight adapter tests over live HTTP.
- [ ] Step 3: Use axios.create in Api, expose client, forward signal, return application data, and propagate failures. Update EpisodeContext to catch rejected calls and set returned episodes. Migrate classifier to Axios errors while preserving UI-facing categories. Mark demo-only code/tests appropriately for remove-demo. Remove Apisauce and update the listed documentation; retain any Axios Metro compatibility workaround still needed.
- [ ] Step 4: Run focused tests, compile/typecheck/lint/dependency checks and format changed files. Use Node 22 locally. Full installed/generated validation may run in hosted CI if disk pressure prevents safe local installs; report deferred checks explicitly.
- [ ] Step 5: Commit the tested transport migration; write task report with RED/GREEN evidence and any concerns.

### Task 2: Add optional TanStack Query wiring and hosted coverage

**Files:** Modify `src/tools/modules.ts`, `src/tools/modules.test.ts`, existing module/default-generation tests, `.github/workflows/ci.yml`, `boilerplate/docs/optional-modules.md`, generated/root README module guidance. Create `boilerplate/modules/tanstack-query/module.json`, module files `services/query/{client.ts,client.test.ts,nativeLifecycle.ts,nativeLifecycle.test.ts,QueryProvider.tsx}` and `docs/query.md`; create `test/vanilla/ignite-new-query.test.ts`. Add a focused root runtime harness and root devDependencies only as required to test real QueryClient behavior. Keep native modules mocked only at the platform boundary.

**Interfaces:** Consumes Task 1's throwing Axios client. Extends OptionalModuleName with `tanstack-query`; installs Query and Expo Network; applies after navigation conversion. Produces `createQueryClient(): QueryClient`, a retry predicate with the global policy, `QueryProvider({children})`, and a cleanup-returning native lifecycle binding. Optional files live at project-root `services/query/`; entry imports must resolve for both app/ and src/app/ paths. Supabase remains unchanged and can coexist.

- [ ] Step 1: Write failing generation tests for no selection, Query-only under both navigation choices, duplicates, combined Supabase/Query in either order, and interactive empty defaults. Assert actual dependencies/files, one provider import/wrapper, correct paths, preserved Supabase env and files, and install-cache separation. Add runtime tests for QueryClient cache reuse/invalidation and exact retry policy, stable provider/client, native initial focus, reconnect, late initial network result, unmount cleanup, and web delegation.
- [ ] Step 2: Run focused tests and record expected RED evidence.
- [ ] Step 3: Extend the descriptor/module mechanism with the smallest entry-wiring hook for Query. Use Query 5.104.1 and expo-network ~55.0.18. Retain a QueryClient via provider state, configure global defaults, and bind native focus/connectivity with race-safe initialization and cleanup. Keep files out of unselected apps and preserve combined module application.
- [ ] Step 4: Write `docs/query.md` with Axios and Supabase query examples (throw SDK errors), AbortSignal, mutation invalidation, account-scoped keys plus cancel/clear on identity changes, no mutation retries, memory-only cache, future persistence, and removal instructions. Update catalog to available and document the CLI selector. Add serial hosted fixture entries for `tanstack-query`, `tanstack-query-react-navigation`, and `supabase-query` and update matrix assertions.
- [ ] Step 5: Run focused runtime/generation tests and root static checks. Commit and report evidence. After task and final review, the controller pushes to the existing PR, rewrites its description to include this final scope, and waits for all hosted checks to pass.
