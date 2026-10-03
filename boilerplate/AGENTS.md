# Project guidance

## Layout

- Expo Router projects use `src/app/` for routes and `src/` for shared application code.
- React Navigation projects use `app/navigators/`, `app/screens/`, and other `app/` directories.
- `assets/` holds images and icons; `test/` holds test setup and shared tests.
- `app.config.ts`, `app.json`, and `eas.json` define Expo configuration and build profiles.
- `ignite/templates/` contains generators for new application files.
- `docs/optional-modules.md` records supported integrations and planned modules.

## Validation

Use the package manager selected for this project. With the default Yarn setup, run:

```bash
yarn lint
yarn typecheck
yarn test --runInBand
yarn check
```

`lint` reports issues without fixing them; use `lint:fix` deliberately. `check` also
validates dependency boundaries. With npm, pnpm, or Bun, use their `run` command
for these scripts (npm test arguments need `--`).

## Generated files and configuration

Application files created by a generator are editable source. Change
`ignite/templates/` only when future generated files should change too.
Under Continuous Native Generation, `ios/` and `android/` are generated outputs:
put lasting native changes in Expo configuration or config plugins. A clean
prebuild replaces native directories; review any manual changes first. Projects
using the manual workflow instead maintain their native directories as source.
Do not edit dependency folders or built output to fix application behavior.

## Environment safety

Keep local `.env` values and credentials out of version control and logs. Commit
only example environment files with placeholders. `EXPO_PUBLIC_*` values are
bundled into the client and must never contain secrets. Keep privileged service
keys on a server; do not expose them through Expo config or application code.

Require explicit human approval before production deployments or app-store submissions.

## Evidence before completion

Run relevant checks after changes and before claiming completion. Report the
commands, results, and any remaining failures or unverified native behavior.
Passing static checks does not prove simulator or device behavior.
