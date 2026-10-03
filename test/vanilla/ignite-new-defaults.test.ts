import { chmodSync } from "fs"
import { filesystem, print, strings, system, GluegunToolbox } from "gluegun"
import * as tempy from "tempy"
import { parse } from "yaml"

import { packager, PackagerName } from "../../src/tools/packager"
import { spawnAndLog, spawnAndLogIgnite, spawnIgniteAndPrintIfFail } from "../_test-helpers"

const newCommand = require("../../src/commands/new")

describe("ignite new defaults", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = tempy.directory({ prefix: "ignite-defaults-" })
    jest.spyOn(packager, "availablePackagers").mockReturnValue(["pnpm", "npm", "yarn", "bun"])
  })

  afterEach(() => {
    jest.restoreAllMocks()
    filesystem.remove(tempDir)
  })

  it.each([
    ["packagerName", "packager", "yarn", ["pnpm", "npm", "yarn", "bun"]],
    ["packagerName", "packager", "npm", ["npm", "pnpm", "bun"]],
    ["navigation", "navigation", "expo-router", ["npm", "bun"]],
    ["removeDemo", "removeDemo", true, ["npm", "bun"]],
  ])(
    "offers %s interactively (option %s; default %s; installed %j)",
    async (promptName, optionName, expected, available) => {
      jest.spyOn(packager, "availablePackagers").mockReturnValue(available as PackagerName[])
      const options = {
        bundle: "com.interactive",
        targetPath: filesystem.path(tempDir, "Interactive"),
        workflow: "cng",
        git: false,
        packager: "bun",
        installDeps: false,
        navigation: "react-navigation",
        removeDemo: false,
      }
      delete options[optionName]
      let question: any
      const stopped = new Error("Captured interactive prompt")
      jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("Exited before showing the interactive prompt")
      })
      const toolbox = {
        filesystem,
        print,
        strings,
        system,
        parameters: { first: "Interactive", options, argv: ["new", "Interactive"] },
        meta: { src: filesystem.path(__dirname, "../../src") },
        prompt: {
          ask: async (buildQuestion) => {
            question = buildQuestion()
            throw stopped
          },
        },
      } as unknown as GluegunToolbox

      await expect(newCommand.run(toolbox)).rejects.toBe(stopped)
      expect(question.name).toBe(promptName)
      const initial =
        typeof question.initial === "number" ? question.choices[question.initial] : question.initial
      expect(initial).toBe(expected)
      expect(question.message).not.toContain("Experimental")
      if (promptName === "packagerName") expect(question.choices).toEqual(available)
    },
  )

  it("fails clearly when --yes defaults to Yarn but Yarn is unavailable", async () => {
    jest.spyOn(packager, "availablePackagers").mockReturnValue(["npm", "pnpm", "bun"])
    const output = jest.spyOn(print, "info").mockImplementation(() => undefined)
    const stopped = new Error("Unavailable package manager")
    let exitCode: number | undefined
    jest.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = code
      throw stopped
    })
    const toolbox = {
      filesystem,
      print,
      strings,
      system,
      parameters: {
        first: "UnavailableYarn",
        options: { yes: true, targetPath: filesystem.path(tempDir, "UnavailableYarn") },
        argv: ["new", "UnavailableYarn", "--yes"],
      },
    } as unknown as GluegunToolbox

    await expect(newCommand.run(toolbox)).rejects.toBe(stopped)
    expect(exitCode).toBe(1)
    expect(output.mock.calls.flat().join("\n")).toContain(
      'selected "yarn" but packager was not available',
    )
    expect(filesystem.exists(filesystem.path(tempDir, "UnavailableYarn"))).toBe(false)
  })

  it("bootstraps pinned Yarn despite an actual Classic global executable", async () => {
    const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`
    const classicPath = filesystem.path(tempDir, "classic")
    await system.run(
      `npm install --prefix ${shellQuote(classicPath)} --ignore-scripts --no-package-lock --no-audit --no-fund yarn@1.22.22`,
    )
    const binPath = filesystem.path(tempDir, "bin")
    const yarnPath = filesystem.path(binPath, "yarn")
    filesystem.dir(binPath)
    filesystem.write(
      yarnPath,
      `#!/bin/sh\nunset COREPACK_ROOT SKIP_YARN_COREPACK_CHECK\nexec node ${shellQuote(filesystem.path(classicPath, "node_modules/yarn/bin/yarn.js"))} "$@"\n`,
    )
    chmodSync(yarnPath, 0o755)
    const pre = `export PATH=${shellQuote(binPath)}:"$PATH" && cd ${shellQuote(tempDir)}`
    expect(await system.run(`${pre} && yarn --version`)).toContain("1.22.22")

    await spawnIgniteAndPrintIfFail("new ClassicYarn --yes --install-deps=false --git=false", {
      pre,
      outputFileName: "ignite-new-classic-yarn.txt",
    })
    const appPath = filesystem.path(tempDir, "ClassicYarn")
    expect(filesystem.read(filesystem.path(appPath, "package.json"), "json").packageManager).toBe(
      "yarn@4.9.1",
    )
    // Later generator commands and user commands must also bypass Classic's startup check.
    expect(await system.run(`${pre} && cd ${shellQuote(appPath)} && yarn --version`)).toContain(
      "4.9.1",
    )
  })

  it("provides Corepack setup guidance before generating a Yarn project when Corepack is absent", async () => {
    const actualWhich = system.which
    jest
      .spyOn(system, "which")
      .mockImplementation((name) => (name === "corepack" ? undefined : actualWhich(name)))
    const output = jest.spyOn(print, "info").mockImplementation(() => undefined)
    const stopped = new Error("Unavailable Corepack")
    let exitCode: number | undefined
    jest.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = code
      throw stopped
    })
    const targetPath = filesystem.path(tempDir, "MissingCorepack")
    const toolbox = {
      filesystem,
      print,
      strings,
      system,
      meta: {
        get src() {
          throw new Error("Generation started before Corepack validation")
        },
      },
      parameters: {
        first: "MissingCorepack",
        options: { yes: true, targetPath, installDeps: false, git: false },
        argv: ["new", "MissingCorepack", "--yes"],
      },
    } as unknown as GluegunToolbox

    await expect(newCommand.run(toolbox)).rejects.toBe(stopped)
    expect(exitCode).toBe(1)
    const message = output.mock.calls.flat().join("\n")
    expect(message).toContain("Yarn 4.9.1 requires Corepack")
    expect(message).toContain("npm install --global corepack")
    expect(message).toContain("--packager=npm")
    expect(filesystem.exists(targetPath)).toBe(false)
  })

  it.each(["4.6.0"])(
    "pins generated Yarn to 4.9.1 when the host reports %s",
    async (hostVersion) => {
      const actualCorepack = system.which("corepack")
      if (!actualCorepack) throw new Error("Corepack is required for the Yarn integration fixture")
      const binPath = filesystem.path(tempDir, "bin")
      const yarnPath = filesystem.path(binPath, "yarn")
      const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`
      filesystem.dir(binPath)
      filesystem.write(
        yarnPath,
        `#!/bin/sh\ncase "$1" in\n  -v|--version) printf '%s\\n' '${hostVersion}';;\n  *) exec ${shellQuote(actualCorepack)} yarn@4.9.1 "$@";;\nesac\n`,
      )
      chmodSync(yarnPath, 0o755)

      await spawnIgniteAndPrintIfFail("new PinnedYarn --yes --install-deps=false --git=false", {
        pre: `export PATH=${shellQuote(binPath)}:"$PATH" && cd ${shellQuote(tempDir)}`,
        outputFileName: `ignite-new-yarn-${hostVersion}.txt`,
      })
      const packageJson = filesystem.read(
        filesystem.path(tempDir, "PinnedYarn/package.json"),
        "json",
      )
      expect(packageJson.packageManager).toBe("yarn@4.9.1")
    },
  )

  it("generates a Yarn, CNG, Expo Router project without demo content with --yes", async () => {
    const result = await spawnIgniteAndPrintIfFail(
      "new Defaults --yes --install-deps=false --git=false",
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-defaults.txt" },
    )
    const appPath = filesystem.path(tempDir, "Defaults")
    const packageJson = filesystem.read(`${appPath}/package.json`, "json")

    expect(result).toContain("--packager=yarn")
    expect(result).toContain("--workflow=cng")
    expect(result).toContain("--navigation=expo-router")
    expect(result).not.toContain("--experimental=expo-router")
    expect(packageJson.main).toBe("expo-router/entry")
    expect(packageJson.packageManager).toBe("yarn@4.9.1")
    expect(packageJson.scripts.lint).toBe("eslint .")
    expect(packageJson.scripts["lint:fix"]).toBe("eslint . --fix")
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit -p . --pretty")
    expect(packageJson.scripts.check).toBe(
      "yarn lint && yarn typecheck && yarn test --runInBand && yarn depcruise",
    )
    expect(packageJson.dependencies["expo-router"]).toBeDefined()
    expect(packageJson.dependencies["expo-application"]).toBeUndefined()
    expect(filesystem.exists(`${appPath}/src/app/_layout.tsx`)).toBe("file")
    expect(
      filesystem.exists(`${appPath}/src/screens/DemoShowroomScreen/DemoShowroomScreen.tsx`),
    ).toBe(false)
    expect(filesystem.exists(`${appPath}/src/navigators`)).toBe(false)
    expect(filesystem.read(`${appPath}/.gitignore`)).toContain("/android")
    expect(filesystem.read(`${appPath}/.gitignore`)).toContain("/ios")
  })

  it.each(["expo-router", "react-navigation"])(
    "ships portable project guidance with %s",
    async (navigation) => {
      await spawnIgniteAndPrintIfFail(
        `new PortableGuidance --yes --navigation=${navigation} --install-deps=false --git=false`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-new-guidance-${navigation}.txt` },
      )
      const appPath = filesystem.path(tempDir, "PortableGuidance")
      const documentPaths = ["AGENTS.md", "README.md", "docs/optional-modules.md"]
      for (const documentPath of documentPaths) {
        expect(filesystem.exists(filesystem.path(appPath, documentPath))).toBe("file")
      }
      const [agents, readme, catalog] = documentPaths.map((documentPath) =>
        filesystem.read(filesystem.path(appPath, documentPath)),
      )
      for (const document of [agents, readme, catalog]) {
        expect(document).not.toMatch(/Revue|Cadence|Gas City|Cincy|T3|Riverfront|Infinite Red/i)
      }
      expect(agents.split("\n").length).toBeLessThanOrEqual(70)
      for (const command of ["lint", "typecheck", "test", "check"]) {
        expect(agents).toContain(`yarn ${command}`)
        expect(readme).toContain(`yarn ${command}`)
      }
      for (const boundary of [
        "src/app",
        "app/navigators",
        "assets/",
        "test/",
        "ignite/templates/",
        ".env",
        "ios/",
        "android/",
      ]) {
        expect(agents).toContain(boundary)
      }
      expect(agents).toMatch(/evidence/i)
      expect(readme).toContain("Corepack")
      expect(readme).toContain("4.9.1")
      expect(readme).toContain("yarn install")
      expect(readme).toContain("--navigation=react-navigation")
      expect(readme).toContain("Continuous Native Generation")
      for (const profile of [
        "development-simulator",
        "development-device",
        "preview",
        "production",
      ]) {
        expect(readme).toContain(profile)
      }
      expect(readme).toContain("EAS_PROJECT_ID")
      expect(readme).toMatch(/expo-updates/)
      expect(readme).toMatch(/does not enable.*over.the.air/i)
      expect(readme).toContain("[Optional modules](docs/optional-modules.md)")
      const moduleRows = catalog
        .split("\n")
        .filter((line) => line.startsWith("|"))
        .map((line) =>
          line
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        )
      for (const [module, status] of [
        ["Supabase", "available"],
        ["Firebase", "planned"],
        ["Clerk", "planned"],
        ["WatermelonDB", "planned"],
        ["RevenueCat / purchases", "planned"],
      ]) {
        expect(moduleRows.find((row) => row[0] === module)?.[1]).toBe(status)
      }
      expect(catalog).toMatch(/row.level security/i)
      expect(catalog).toMatch(/native.*build|build.*native/i)
      expect(catalog).toMatch(/not.*installable/i)
    },
  )

  it.each([
    ["yarn", "yarn install --immutable", "yarn check"],
    ["pnpm", "pnpm install --frozen-lockfile", "pnpm run check"],
    ["npm", "npm ci --legacy-peer-deps", "npm run check"],
    ["bun", "bun install --frozen-lockfile", "bun run check"],
  ])("generates self-contained PR checks for %s", async (manager, install, check) => {
    await spawnIgniteAndPrintIfFail(
      `new Checks --yes --packager=${manager} --install-deps=false --git=false`,
      { pre: `cd ${tempDir}`, outputFileName: `ignite-new-checks-${manager}.txt` },
    )
    const appPath = filesystem.path(tempDir, "Checks")
    const workflowPath = filesystem.path(appPath, ".github/workflows/pr-checks.yml")
    expect(filesystem.exists(workflowPath)).toBe("file")
    const workflow = parse(filesystem.read(workflowPath))
    expect(workflow.on).toHaveProperty("pull_request")
    const steps = workflow.jobs.checks.steps
    expect(steps).toContainEqual({ uses: "actions/checkout@v4" })
    expect(steps).toContainEqual({ uses: "actions/setup-node@v4", with: { "node-version": 20 } })
    expect(steps).toContainEqual({ name: "Install dependencies", run: install })
    expect(steps).toContainEqual({ name: "Run checks", run: check })
    for (const step of steps.filter((step) => step.uses)) {
      expect(step.uses).toMatch(/^(actions\/|oven-sh\/)/)
    }
    if (manager === "yarn")
      expect(steps).toContainEqual({ name: "Set up package manager", run: "corepack enable" })
    if (manager === "pnpm") {
      expect(steps).toContainEqual({
        name: "Set up package manager",
        run: "corepack enable\ncorepack prepare pnpm@10.9.0 --activate",
      })
    }
    if (manager === "bun") {
      expect(steps).toContainEqual({
        uses: "oven-sh/setup-bun@v2",
        with: { "bun-version": "latest" },
      })
    }
    if (manager === "npm") expect(steps.some((step) => step.run?.includes("corepack"))).toBe(false)
    const { scripts } = filesystem.read(filesystem.path(appPath, "package.json"), "json")
    const prefix = manager === "yarn" ? "yarn" : `${manager} run`
    const testArgs = manager === "npm" ? " -- --runInBand" : " --runInBand"
    expect(scripts.check).toBe(
      `${prefix} lint && ${prefix} typecheck && ${prefix} test${testArgs} && ${prefix} depcruise`,
    )
  })

  it.each(["expo-router", "react-navigation"])(
    "resolves generic EAS variants with %s",
    async (navigation) => {
      await spawnIgniteAndPrintIfFail(
        `new VariantApp --yes --navigation=${navigation} --bundle=org.example.variantapp --install-deps=false --git=false`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-new-variants-${navigation}.txt` },
      )
      const appPath = filesystem.path(tempDir, "VariantApp")
      const { build } = filesystem.read(`${appPath}/eas.json`, "json")
      expect(Object.keys(build).sort()).toEqual([
        "development-device",
        "development-simulator",
        "preview",
        "production",
      ])
      for (const [profile, variant] of [
        ["development-simulator", "development"],
        ["development-device", "development"],
        ["preview", "preview"],
        ["production", "production"],
      ]) {
        expect(build[profile]).toMatchObject({
          environment: variant,
          channel: variant,
          env: { APP_VARIANT: variant },
        })
      }
      expect(build["development-simulator"]).toMatchObject({
        developmentClient: true,
        distribution: "internal",
        ios: { simulator: true },
      })
      expect(build["development-device"]).toMatchObject({
        developmentClient: true,
        distribution: "internal",
        ios: { simulator: false },
      })
      expect(build.preview).toMatchObject({
        distribution: "internal",
        android: { buildType: "apk" },
      })
      const { scripts } = filesystem.read(`${appPath}/package.json`, "json")
      for (const platform of ["ios", "android"]) {
        expect(scripts[`build:${platform}:sim`]).toBe(
          `eas build --profile development-simulator --platform ${platform} --local`,
        )
        expect(scripts[`build:${platform}:device`]).toBe(
          `eas build --profile development-device --platform ${platform} --local`,
        )
      }

      await system.run(`cd ${appPath} && yarn install --mode=skip-build`)
      const typecheck = await spawnAndLog(
        "yarn tsc --noEmit --strict --skipLibCheck --module commonjs --target es2022 app.config.ts",
        {
          pre: `cd ${appPath}`,
          outputFileName: `ignite-new-variants-typecheck-${navigation}.txt`,
        },
      )
      if (typecheck.exitCode !== 0) console.error(typecheck.output)
      expect(typecheck.exitCode).toBe(0)
      for (const [variant, name, identifier] of [
        ["development", "VariantApp (Dev)", "org.example.variantapp.dev"],
        ["preview", "VariantApp (Preview)", "org.example.variantapp.preview"],
        ["production", "VariantApp", "org.example.variantapp"],
      ]) {
        const config = JSON.parse(
          await system.run(
            `cd ${appPath} && env -u EAS_PROJECT_ID APP_VARIANT=${variant} EXPO_NO_DOTENV=1 yarn expo config --json`,
          ),
        )
        expect(config.name).toBe(name)
        expect(config.ios.bundleIdentifier).toBe(identifier)
        expect(config.android.package).toBe(identifier)
        expect(config.ios.privacyManifests.NSPrivacyAccessedAPITypes).toHaveLength(1)
        expect(config.extra.ignite.version).toBeDefined()
        expect(config.extra.eas).toBeUndefined()
        expect(config.updates.url).toBeUndefined()
        expect(config.runtimeVersion).toBeUndefined()
      }
      const projectId = "00000000-0000-4000-8000-000000000000"
      const config = JSON.parse(
        await system.run(
          `cd ${appPath} && APP_VARIANT=preview EAS_PROJECT_ID=${projectId} EXPO_NO_DOTENV=1 yarn expo config --json`,
        ),
      )
      expect(config.extra.eas.projectId).toBe(projectId)
      expect(config.extra.ignite.version).toBeDefined()
      expect(config.updates).toMatchObject({
        url: "https://u.expo.dev/00000000-0000-4000-8000-000000000000",
        fallbackToCacheTimeout: 0,
      })
      expect(config.runtimeVersion).toEqual({ policy: "appVersion" })
    },
  )

  it("honors --navigation=react-navigation and an explicit demo override", async () => {
    const result = await spawnIgniteAndPrintIfFail(
      "new ReactNavigation --yes --navigation=react-navigation --remove-demo=false --install-deps=false --git=false --packager=bun",
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-react-navigation.txt" },
    )
    const appPath = filesystem.path(tempDir, "ReactNavigation")
    const packageJson = filesystem.read(`${appPath}/package.json`, "json")

    expect(result).toContain("--navigation=react-navigation")
    expect(result).toContain("--remove-demo=false")
    expect(packageJson.main).not.toBe("expo-router/entry")
    expect(packageJson.dependencies["expo-router"]).toBeUndefined()
    expect(packageJson.dependencies["expo-application"]).toBeDefined()
    expect(filesystem.exists(`${appPath}/app/navigators/AppNavigator.tsx`)).toBe("file")
    expect(filesystem.exists(`${appPath}/app/screens/DemoShowroomScreen`)).toBe("dir")
    expect(filesystem.exists(`${appPath}/src`)).toBe(false)
  })

  it.each([
    ["--navigation=unknown", "Invalid navigation", "expo-router, react-navigation"],
    ["--navigation", "Invalid navigation", "expo-router, react-navigation"],
    [
      "--navigation=react-navigation --experimental=expo-router",
      "Conflicting navigation",
      "--experimental=expo-router",
    ],
    [
      "--navigation=expo-router --remove-demo=false",
      "requires demo removal",
      "--navigation=react-navigation",
    ],
  ])("rejects unsupported navigation choices: %s", async (flags, error, guidance) => {
    const { exitCode, output } = await spawnAndLogIgnite(
      `new InvalidNavigation --yes --install-deps=false --git=false --packager=bun ${flags}`,
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-navigation-error.txt" },
    )

    expect(exitCode).toBe(1)
    expect(output).toContain(error)
    expect(output).toContain(guidance)
    expect(filesystem.exists(filesystem.path(tempDir, "InvalidNavigation"))).toBe(false)
  })
})
