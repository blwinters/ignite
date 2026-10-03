import { chmodSync } from "fs"
import { filesystem, print, strings, system, GluegunToolbox } from "gluegun"
import * as tempy from "tempy"

import { packager, PackagerName } from "../../src/tools/packager"
import { spawnAndLogIgnite, spawnIgniteAndPrintIfFail } from "../_test-helpers"

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
