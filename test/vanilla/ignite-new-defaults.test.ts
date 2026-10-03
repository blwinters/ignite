import { filesystem, print, strings, system, GluegunToolbox } from "gluegun"
import * as tempy from "tempy"

import { spawnAndLogIgnite, spawnIgniteAndPrintIfFail } from "../_test-helpers"

const newCommand = require("../../src/commands/new")

describe("ignite new defaults", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = tempy.directory({ prefix: "ignite-defaults-" })
  })

  afterEach(() => {
    filesystem.remove(tempDir)
  })

  it.each([
    ["packagerName", "packager", "yarn"],
    ["navigation", "navigation", "expo-router"],
    ["removeDemo", "removeDemo", true],
  ])("offers the %s default interactively", async (promptName, optionName, expected) => {
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
  })

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
