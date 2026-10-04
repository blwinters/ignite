# Maintaining the Ignite fork

This public fork preserves Ignite's name, attribution, license, components, and
generator foundations. Keep its changes small enough to review against upstream.
Personal preferences that cannot be justified as reusable starter behavior, product
features, organization policies, account identifiers, and project-specific
automation belong in generated apps, not this fork.

## Deliberate departures

- `new --yes` selects Yarn 4.9.1, Continuous Native Generation (CNG), Expo Router,
  and demo removal. Yarn projects use Corepack and a pinned local Yarn executable
  with the `node-modules` linker. npm, pnpm, and Bun remain explicit alternatives.
- `--navigation=react-navigation` retains the compatibility layout under `app/`;
  Expo Router uses `src/app/`. Keeping demos requires React Navigation and
  `--remove-demo=false`. The legacy `--experimental=expo-router` flag remains
  supported; contradictory navigation choices fail before writing a project.
- Generated apps expose nonmutating `lint`, `typecheck`, and combined `check`
  commands, explicit `lint:fix`, dependency-boundary checks, portable `AGENTS.md`,
  project instructions, and a self-contained PR workflow adapted to their package
  manager.
- Generic development, preview, and production variants derive names and bundle
  identifiers without hardcoded owners. EAS profiles distinguish simulator and
  device development builds. `EAS_PROJECT_ID` is optional configuration; the
  starter does not install `expo-updates` or make OTA delivery operational.
- Optional modules use a descriptor contract. Interactive selection starts empty;
  `--yes` selects none. `--modules=supabase` adds only that module's dependencies,
  service/config tests, placeholder environment example, and setup/removal guide.
  `--modules=tanstack-query` adds an in-memory server-data cache with native
  focus/connectivity support and wraps either navigation entry. Use
  `--modules=supabase,tanstack-query` for both. Supabase and TanStack Query are
  available; Firebase, Clerk, WatermelonDB, and RevenueCat/purchases
  are planned and cannot be installed. See the
  [optional-module catalog](../boilerplate/docs/optional-modules.md).
- Supabase config accepts public client values only, rejects privileged keys and
  unsafe URLs, and initializes its client only when requested. Its pinned SDK
  supports the fork's Node 24 runtime. Authentication UI, persistent sessions, backend policies,
  and application queries remain app responsibilities.

Use Node 24 (24.3.0 or newer within that major) and Corepack for the supported CI
environment. From a fork checkout:

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.9.0 --activate
corepack prepare yarn@4.9.1 --activate
pnpm install --frozen-lockfile
# Create outside the CLI checkout to avoid parent package/workspace detection.
cd /path/to/your/projects
node /path/to/ignite/bin/ignite new MyApp --yes
```

This runs the checkout's CLI. `npx ignite-cli@latest` still selects the published
upstream CLI. Do not imply that upstream users receive this fork's defaults.

## Remotes and upstream sync

`origin` is the fork (`blwinters/ignite`); `upstream` is the source
(`infinitered/ignite`). Check the existing configuration before adding or changing
a remote. Never redirect `origin` to upstream or push fork defaults to upstream.

```sh
git remote -v
# Add only if the upstream remote does not already exist.
git remote add upstream https://github.com/infinitered/ignite.git
git fetch origin
git fetch upstream
git remote show upstream
```

Start with a clean checkout and an isolated sync branch from the maintained fork
branch. `master` below is upstream's current default branch; confirm it with
`git remote show upstream` before each sync. Merge rather than rewriting the
published fork history, and review every conflict as a behavior decision.

```sh
git switch codex/personal-defaults
git switch -c sync/ignite-upstream
git log --oneline HEAD..upstream/master
git diff HEAD...upstream/master -- src boilerplate test package.json pnpm-lock.yaml
git merge --no-commit upstream/master
# Resolve conflicts, review the complete result, and run the validation below.
git diff --check
git status --short
```

If the merge is not ready to keep, use `git merge --abort` while it is still in
progress. Once reviewed and validated, commit the sync and open a PR to the fork's
maintained branch. Record the upstream revision, deliberate retained differences,
verification results, and any unresolved baseline failure in that PR. Publishing,
deployment, and store submission are separate decisions, not sync steps.

## Conflict-review checklist

- [ ] Recheck prompt defaults, `--yes`, explicit package managers, navigation,
      demo overrides, legacy flags, and early invalid-choice failures.
- [ ] Preserve generated checks as nonmutating; keep fixes explicit and package
      manager command/lockfile/pinned-version handling consistent.
- [ ] Review rename, demo removal, both navigation layouts, and generator paths;
      selected modules must be applied after navigation conversion with their
      dependencies available before installation.
- [ ] Keep the base app independent of optional services. Preserve descriptors,
      unknown/planned-module rejection, module-specific cache isolation, setup
      and removal guidance, and public environment placeholders.
- [ ] Review environment ignores, public versus server-only keys, config URL/key
      validation, and lazy client creation. Never copy credentials or account
      identifiers into the fork or generated examples.
- [ ] Review Expo/React Native and SDK upgrades against Node 24, native builds,
      EAS variants, and parameterized project linking. Do not equate EAS config
      with an installed OTA runtime or verified deployment.
- [ ] Preserve upstream attribution and trademark notices. Keep app-specific
      requirements and private workflow/action references out of public templates.
- [ ] Run all root and fixture checks, review logs and whitespace, and report
      upstream baseline failures separately from new regressions.

## Validation and final fixtures

Run root checks from the CLI checkout, with Bun also installed for the existing
integration suite:

```sh
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm compile
pnpm depcruise
pnpm test --runInBand --watchman=false
git diff --check
```

`pnpm format` prints formatted output; `format:check` enforces cleanliness. The
full test command has no path or name filters: the installed React Navigation
integration test remains part of the normal suite.

Root [GitHub CI](../.github/workflows/ci.yml) provisions Node 24, pnpm, Yarn, and
Bun using public actions and read-only repository permissions. A serial fixture
matrix validates default Expo Router + Yarn, React Navigation + Yarn, Expo
Router + Yarn + Supabase, Query with each navigation choice, and combined
Supabase/Query. Each gets a fresh runner, and a failed variant does not
cancel the others. Fixture jobs are independent of the root suite, so a root
failure still leaves all generated-app results visible.

To reproduce the fixture strategy locally, create one disposable directory outside
the checkout per variant, run the checkout CLI there, then remove only that
fixture after preserving its logs. Substitute `--navigation=react-navigation` or
`--modules=supabase`, `--modules=tanstack-query`,
`--modules=tanstack-query --navigation=react-navigation`, or
`--modules=supabase,tanstack-query` at the end for the other variants:

```sh
node /path/to/ignite/bin/ignite new FixtureApp --yes --install-deps=false --git=false --use-cache=false
cd FixtureApp
yarn install --mode=skip-build --no-immutable
yarn lint:fix
yarn check
```

Fresh dependency-free generation leaves an empty lockfile. `--no-immutable`
allows only this first install to resolve it, including under `CI=true`; subsequent
installs should use `yarn install --immutable`. No global immutable-install setting
is disabled, and the project's validation commands remain strict.

The initial fix is the generator's ordinary formatting phase, applied after
dependencies are available. `check` itself remains nonmutating. This fixture
strategy avoids native prebuild and validates JavaScript/TypeScript, Jest, lint,
and dependency boundaries. It does not establish simulator/device acceptance,
native builds, authentication, or live service behavior. The normal integration
suite separately exercises installed generation and native file generation.

The fork handles a potentially undefined React Navigation `getRootState()` before
traversing its routes. Without that guard, the upstream back handler both fails
strict typechecking with `TS2345` and can crash if a ready navigator has no root
state. Keep the alternate navigation path covered in the normal suite and its
named fixture job. Do not suppress failures with ignored tests, weaker type
checking, or `continue-on-error`. Disk exhaustion is an environment
failure; rerun on a host with room for one dependency installation rather than
claiming a fixture passed or deleting unrelated projects/shared caches.
