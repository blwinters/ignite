# Your React Native app

This project uses Expo and TypeScript. See [project guidance](AGENTS.md) for the
directory layout, generated-file boundaries, and environment safety, and
[Optional modules](docs/optional-modules.md) for integration availability.

## Setup

Use Node.js 24 (24.3.0 or newer within that major). `.nvmrc` and CI select Node 24.
The default package manager is Yarn 4.9.1, pinned in
`package.json` and the project's local Yarn release. Enable Corepack before using
Yarn; if Corepack is missing, install it with `npm install --global corepack`.

```bash
nvm install
nvm use
corepack enable
yarn --version
```

For a Yarn project, verify the version is 4.9.1. If another package manager was
selected during generation, use that manager instead. Install dependencies and
start the development server from the project directory:

```bash
pnpm run
pnpm run start
```

The server expects a development client. Build and install one for your target
simulator or device before opening the app. `ios` and `android` scripts build
locally through Expo; the `build:*` scripts use EAS local builds and require the
corresponding native toolchain and EAS setup.

## Navigation and native generation

Expo Router is the default: file-based routes live in `src/app/`, with shared
components, services, and configuration elsewhere in `src/`. Generate a project
with `--navigation=react-navigation` to use `app/navigators/` and `app/screens/`
instead. Demo content is removed by default; `--remove-demo=false` is supported
with React Navigation.

The default workflow uses Continuous Native Generation (CNG). Expo generates
`ios/` and `android/` from app configuration and config plugins, and these native
directories are ignored by Git. Make persistent native changes through config
plugins. `prebuild:clean` replaces native directories, so review manual edits
before running it. The optional `--workflow=manual` choice maintains native
directories in version control instead.

## Build variants and EAS linking

`APP_VARIANT` selects development, preview, or production configuration. The
development variant adds `(Dev)` to the name and `.dev` to the identifiers;
preview adds `(Preview)` and `.preview`; production uses the base name and
identifiers. Missing or unrecognized `APP_VARIANT` defaults to production;
the EAS profiles set it explicitly.

| EAS profile           | Variant     | Purpose                             |
| --------------------- | ----------- | ----------------------------------- |
| development-simulator | development | Development client; iOS simulator   |
| development-device    | development | Development client; physical device |
| development-ota       | development | Standalone development OTA          |
| preview               | preview     | Internal distribution; Android APK  |
| production            | production  | Release build                       |

Profiles select matching EAS environments and channels. Android uses the same
development profiles for emulator or device builds; the simulator setting is
iOS-specific. Build scripts include:

```bash
pnpm run build:ios:sim
pnpm run build:ios:device
pnpm run build:ios:ota
pnpm run build:ios:preview
pnpm run build:ios:prod
```

Equivalent `build:android:*` scripts are available. These scripts use `--local`;
use `eas build --profile <profile> --platform <ios|android>` for a hosted build.

Create or select your own EAS project, then provide its project UUID as
`EAS_PROJECT_ID` locally or in the relevant EAS environment, or save it as
`extra.eas.projectId` in app configuration. No account or project identifier is
supplied by this starter. An explicit `EAS_PROJECT_ID` takes precedence over the
saved project link; an unlinked app has updates disabled.

## OTA updates

The starter includes `expo-updates`, derives the linked project's update URL,
and uses `runtimeVersion: { policy: "appVersion" }`. Development, preview, and
production channels use matching EAS environments. Publish manually after
review, checks, and approval for the target channel:

```sh
pnpm run update:development --message "Describe the change"
pnpm run update:preview --message "Describe the change"
pnpm run update:production --message "Describe the change"
```

These commands set the matching `APP_VARIANT`, target iOS and Android, and
explicitly select the EAS environment. Build-profile variables from `eas.json`
are not automatically available during OTA publication. Keep `APP_VARIANT` in
each EAS environment consistent with its channel; remote environment values can
override the command's value. Put only public client configuration in
`EXPO_PUBLIC_*` variables; secrets must never be bundled in updates. With npm,
forward arguments using `npm run update:preview -- --message "Describe the change"`.

JavaScript and asset changes can reach compatible installed builds without a new
install. Native dependency, plugin, SDK, or native configuration changes require
bumping `app.json`'s version and building/installing a new binary before publishing
updates for that version. Verify update delivery on a simulator or device.

Standalone builds check for updates on launch and use a downloaded update on a
subsequent launch; force-close and reopen twice when testing delivery. They do not
force an in-session reload. Use `development-ota` to test development delivery
without Metro; development clients retain their Expo update-selection workflow.
OTA does not renew an ad hoc provisioning profile's expiration. Publication
remains manual; no automatic publishing or custom update selector is included.

## Local validation

With the default Yarn setup:

```bash
yarn lint
yarn typecheck
yarn test --runInBand
yarn check
```

`lint` is read-only; `yarn lint:fix` applies fixes. `check` runs lint, TypeScript,
tests, and dependency-boundary checks. For another package manager, use its
`run` equivalent; npm forwards test arguments with `npm run test -- --runInBand`.
The generated pull-request workflow runs the same checks. Commit the selected
manager's lockfile after installing dependencies so CI can use a frozen install.
Validate native behavior on a simulator or device separately.

## Optional integrations

[Optional modules](docs/optional-modules.md) lists Supabase and TanStack Query as
available and the other integrations as planned. Select `--modules=tanstack-query`
for query caching or `--modules=supabase,tanstack-query` for both. No optional
module is selected by default. No backend or identity provider is required by
the base app. Keep local environment values out of Git; client-visible
`EXPO_PUBLIC_*` values must contain only public configuration, never secrets.
