import { filesystem, GluegunToolbox, print, strings, system } from "gluegun"
import * as tempy from "tempy"
import { parse } from "yaml"

import { packager } from "../../src/tools/packager"
import { spawnAndLogIgnite, spawnIgniteAndPrintIfFail } from "../_test-helpers"

const newCommand = require("../../src/commands/new")

describe("Supabase fork CI", () => {
  it("installs and validates the selected module through the same fixture path as the base app", () => {
    const workflowPath = filesystem.path(__dirname, "../../.github/workflows/ci.yml")
    expect(filesystem.exists(workflowPath)).toBe("file")
    const workflow = parse(filesystem.read(workflowPath))
    const fixtures = workflow.jobs.fixtures
    expect(fixtures.strategy.matrix.include).toContainEqual({
      name: "supabase",
      flags: "--modules=supabase",
    })
    const generate = fixtures.steps.find((step) => step.name === "Generate fixture")
    expect(generate.env).toEqual({ FIXTURE_FLAGS: "${{ matrix.flags }}" })
    expect(generate.run).toContain('node "$GITHUB_WORKSPACE/bin/ignite" new FixtureApp --yes')
    expect(generate.run).toContain("--install-deps=false --git=false --use-cache=false")
    expect(generate.run).toContain("$FIXTURE_FLAGS")
    expect(fixtures.steps).toContainEqual({
      "name": "Install fixture dependencies",
      "working-directory": "${{ env.FIXTURE_PATH }}",
      "run": "yarn install --mode=skip-build --no-immutable",
    })
    expect(fixtures.steps).toContainEqual({
      "name": "Apply initial generation formatting",
      "working-directory": "${{ env.FIXTURE_PATH }}",
      "run": "yarn lint:fix",
    })
    expect(fixtures.steps).toContainEqual({
      "name": "Check generated fixture",
      "working-directory": "${{ env.FIXTURE_PATH }}",
      "run": "yarn check",
    })
  })
})

describe("ignite new optional Supabase module", () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = tempy.directory({ prefix: "ignite-supabase-" })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    filesystem.remove(tempDir)
  })

  it("offers only Supabase in an interactive multiselect with no default selection", async () => {
    jest.spyOn(packager, "availablePackagers").mockReturnValue(["npm"])
    jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Exited without a module selection prompt")
    })
    jest.spyOn(system, "run").mockRejectedValue(new Error("No subprocesses during prompt test"))
    const stopped = new Error("Captured module prompt")
    let question: any
    const toolbox = {
      filesystem,
      print,
      strings,
      system,
      parameters: {
        first: "Modules",
        argv: ["new", "Modules"],
        options: {
          bundle: "com.modules",
          targetPath: `${tempDir}/Modules`,
          workflow: "cng",
          git: false,
          packager: "npm",
          installDeps: false,
          navigation: "expo-router",
          removeDemo: true,
          noTimeout: true,
        },
      },
      meta: { src: filesystem.path(__dirname, "../../src") },
      prompt: {
        ask: async (buildQuestion) => {
          question = buildQuestion()
          throw stopped
        },
      },
    } as unknown as GluegunToolbox
    await expect(newCommand.run(toolbox)).rejects.toBe(stopped)
    expect(question.type).toBe("multiselect")
    expect(question.name).toBe("modules")
    expect(question.choices).toEqual(["supabase"])
    expect(question.initial).toEqual([])
  })

  it.each(["expo-router", "react-navigation"])(
    "adds only selected Supabase files and dependencies after %s conversion",
    async (navigation) => {
      await spawnIgniteAndPrintIfFail(
        `new Selected --yes --packager=npm --navigation=${navigation} --modules=supabase,supabase --install-deps=false --git=true`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-new-supabase-${navigation}.txt` },
      )
      const appPath = `${tempDir}/Selected`
      const pkg = filesystem.read(`${appPath}/package.json`, "json")
      expect(pkg.dependencies["@supabase/supabase-js"]).toBeDefined()
      expect(pkg.dependencies["react-native-url-polyfill"]).toBeDefined()
      for (const file of ["config.ts", "config.test.ts", "client.ts"]) {
        expect(filesystem.exists(`${appPath}/services/supabase/${file}`)).toBe("file")
      }
      expect(filesystem.exists(`${appPath}/modules`)).toBe(false)
      expect(filesystem.exists(`${appPath}/docs/supabase.md`)).toBe("file")
      const removal = filesystem
        .read(`${appPath}/docs/supabase.md`)
        .split("## Removal")[1]
        ?.replace(/\s+/g, " ")
      expect(removal).toBeDefined()
      expect(removal).toMatch(/first.*imports.*usages/i)
      expect(removal).toContain("@supabase/supabase-js")
      expect(removal).toContain("react-native-url-polyfill")
      expect(removal).toMatch(/npm.*uninstall/i)
      expect(removal).toMatch(/Yarn.*pnpm.*Bun.*remove/i)
      expect(removal).toMatch(/delete.*services\/supabase/i)
      expect(removal).toMatch(/docs\/supabase\.md/)
      expect(removal).toMatch(/remove.*EXPO_PUBLIC_SUPABASE_URL/i)
      expect(removal).toContain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
      expect(removal).toContain(".env.example")
      expect(removal).toMatch(/check/)
      const env = filesystem.read(`${appPath}/.env.example`)
      expect(env.trim().split("\n")).toEqual([
        "EXPO_PUBLIC_SUPABASE_URL=",
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
      ])
      expect((await system.run(`git -C ${appPath} check-ignore .env .env.local`)).trim()).toBe(
        ".env\n.env.local",
      )
      expect((await system.run(`git -C ${appPath} ls-files .env.example`)).trim()).toBe(
        ".env.example",
      )
    },
  )

  it("selects no module under --yes and keeps optional templates out of the base app", async () => {
    await spawnIgniteAndPrintIfFail(
      "new Base --yes --packager=npm --install-deps=false --git=false",
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-supabase-base.txt" },
    )
    const appPath = `${tempDir}/Base`
    const pkg = filesystem.read(`${appPath}/package.json`, "json")
    expect(pkg.dependencies["@supabase/supabase-js"]).toBeUndefined()
    expect(pkg.dependencies["react-native-url-polyfill"]).toBeUndefined()
    for (const file of ["modules", "services/supabase", ".env.example", "docs/supabase.md"]) {
      expect(filesystem.exists(`${appPath}/${file}`)).toBe(false)
    }
  })

  it("keeps selected module dependency caches separate from the base app", async () => {
    const base = await spawnIgniteAndPrintIfFail(
      `new CacheProject --target-path=${tempDir}/base --yes --debug --packager=npm --use-cache=true --install-deps=false --git=false`,
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-module-cache-base.txt" },
    )
    const selected = await spawnIgniteAndPrintIfFail(
      `new CacheProject --target-path=${tempDir}/selected --yes --debug --packager=npm --modules=supabase --use-cache=true --install-deps=false --git=false`,
      { pre: `cd ${tempDir}`, outputFileName: "ignite-new-module-cache-selected.txt" },
    )
    const cachePath = (output: string) => output.match(/cachePath: ([^\s\u001b]+)/)?.[1]
    expect(cachePath(base)).toBeDefined()
    expect(cachePath(selected)).toBeDefined()
    expect(cachePath(selected)).not.toBe(cachePath(base))
  })

  it.each(["unknown", "firebase", "clerk", "watermelondb", "revenuecat", "purchases"])(
    "fails before writing the project for unavailable module %s",
    async (name) => {
      const result = await spawnAndLogIgnite(
        `new Unavailable --yes --packager=npm --modules=${name} --install-deps=false --git=false`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-new-module-error-${name}.txt` },
      )
      expect(result.exitCode).toBe(1)
      expect(result.output).toMatch(/unknown|planned|unavailable/i)
      expect(result.output).toMatch(/supabase/i)
      expect(filesystem.exists(`${tempDir}/Unavailable`)).toBe(false)
    },
  )
})
