import { filesystem } from "gluegun"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import * as tempy from "tempy"
import {
  createSourceFile,
  isImportDeclaration,
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript"
import { parse } from "yaml"

import { spawnIgniteAndPrintIfFail } from "../_test-helpers"

const root = resolve(__dirname, "../../boilerplate")
const pluginPath = join(root, "plugins/withIosDeploymentFloor.ts")
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"))
const configuredFloor = "16.4"

describe("Node 24 CLI runtime", () => {
  it("selects Node 24 for nvm and every CI job", () => {
    expect(readFileSync(resolve(root, "../.nvmrc"), "utf8").trim()).toBe("24")
    const workflow = parse(readFileSync(resolve(root, "../.github/workflows/ci.yml"), "utf8"))
    expect(
      Object.values(workflow.jobs).map((job: any) =>
        job.steps
          .filter((step) => step.uses?.startsWith("actions/setup-node@"))
          .map((step) => step.with["node-version"]),
      ),
    ).toEqual([[24], [24]])
  })

  it("accepts the Node 24 minimum and rejects older or odd CLI runtimes", () => {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        `const semver = require("semver");
const range = require("./package.json").engines.node;
console.log(JSON.stringify(process.argv.slice(1).map(version => semver.satisfies(version, range))));`,
        "20.19.4",
        "22.13.0",
        "23.7.0",
        "24.2.0",
        "24.3.0",
        "24.21.0",
        "25.0.0",
        "26.0.0",
      ],
      { cwd: resolve(root, ".."), encoding: "utf8" },
    )
    expect(JSON.parse(output)).toEqual([false, false, false, false, true, true, false, false])
  })
})

describe("SDK 57 native starter compatibility", () => {
  it.each(["expo-router", "react-navigation"])(
    "generates a scene-enabled, SDK-aligned %s app with an iOS 16.4 floor",
    async (navigation) => {
      const tempDir = tempy.directory({ prefix: "ignite-native-sdk-" })
      try {
        await spawnIgniteAndPrintIfFail(
          `new NativeApp --yes --packager=npm --navigation=${navigation} --modules=tanstack-query --install-deps=false --git=false`,
          { pre: `cd ${tempDir}`, outputFileName: `ignite-native-sdk-${navigation}.txt` },
        )
        const generated = resolve(tempDir, "NativeApp")
        const pkg = JSON.parse(readFileSync(join(generated, "package.json"), "utf8"))
        const config = JSON.parse(readFileSync(join(generated, "app.json"), "utf8"))
        expect(readFileSync(join(generated, ".nvmrc"), "utf8").trim()).toBe("24")
        expect(pkg.engines.node).toBe("^24.3.0")
        const workflow = parse(
          readFileSync(join(generated, ".github/workflows/pr-checks.yml"), "utf8"),
        )
        expect(workflow.jobs.checks.steps).toContainEqual({
          uses: "actions/setup-node@v4",
          with: { "node-version": 24 },
        })
        const properties = config.plugins.find((entry) => entry[0] === "expo-build-properties")
        const floor = config.plugins.find(
          (entry) => entry[0] === "./plugins/withIosDeploymentFloor",
        )
        expect(properties[1].ios).toEqual({ deploymentTarget: "16.4", enableSceneSupport: true })
        expect(floor[1].deploymentTarget).toBe("16.4")
        expect(config.android).toBeDefined()
        expect(config.web).toBeDefined()
        expect(pkg.dependencies).toMatchObject({
          "expo": "57.0.26",
          "expo-build-properties": "~57.0.22",
          "expo-dev-client": "~57.0.19",
          "expo-network": "~57.0.2",
          "@expo/metro-runtime": "~57.0.16",
          "react": "19.2.3",
          "react-dom": "19.2.3",
          "react-native": "0.86.3",
          "react-native-reanimated": "4.5.1",
          "react-native-worklets": "0.10.1",
          "react-native-gesture-handler": "~2.32.0",
          "react-native-screens": "~4.26.0",
          "react-native-safe-area-context": "~5.7.0",
          "react-native-keyboard-controller": "1.21.9",
          "i18next": "26.4.2",
          "react-i18next": "17.0.15",
        })
        expect(pkg.devDependencies).toMatchObject({
          "@react-native/jest-preset": "0.86.3",
          "@react-native/metro-config": "0.86.3",
          "jest-expo": "~57.0.5",
          "eslint-config-expo": "~57.0.2",
          "react-test-renderer": "19.2.3",
          "typescript": "~6.0.3",
        })
        if (navigation === "expo-router") expect(pkg.dependencies["expo-router"]).toBe("~57.0.24")
        else expect(pkg.dependencies["expo-router"]).toBeUndefined()
        for (const file of [
          "theme/context.tsx",
          "components/Screen.tsx",
          "utils/useHeader.tsx",
          "components/Text.test.tsx",
        ]) {
          const sourcePath = join(generated, navigation === "expo-router" ? "src" : "app", file)
          const source = createSourceFile(
            sourcePath,
            readFileSync(sourcePath, "utf8"),
            ScriptTarget.Latest,
            true,
          )
          const imports = source.statements
            .filter(isImportDeclaration)
            .map((statement) => statement.moduleSpecifier.getText(source).slice(1, -1))
          expect(imports).toContain(
            navigation === "expo-router"
              ? "expo-router/react-navigation"
              : "@react-navigation/native",
          )
          if (navigation === "expo-router")
            expect(imports.some((specifier) => specifier.startsWith("@react-navigation/"))).toBe(
              false,
            )
        }
      } finally {
        filesystem.remove(tempDir)
      }
    },
  )
})

describe("Expo lint exclusions", () => {
  it.each([
    ["expo-env.d.ts", true],
    ["app/services/api/types.ts", false],
  ])("reports %s ignored as %s using the app ESLint configuration", (file, ignored) => {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        `const { ESLint } = require("eslint");
new ESLint({ cwd: process.cwd() }).isPathIgnored(process.argv[1])
  .then((ignored) => console.log(JSON.stringify(ignored)));`,
        file,
      ],
      { cwd: root, encoding: "utf8" },
    )
    expect(JSON.parse(output)).toBe(ignored)
  })
})

// Exercise the template without installing native dependencies. Only Expo's mod
// registration boundary is supplied; the plugin and emitted Ruby run unchanged.
function loadPlugin() {
  expect(existsSync(pluginPath)).toBe(true)
  const { outputText } = transpileModule(readFileSync(pluginPath, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  const module = {
    exports: {} as {
      addDeploymentFloor: (contents: string, deploymentTarget: string) => string
      default: (config: unknown, options: { deploymentTarget: string }) => unknown
    },
  }
  new Function("require", "module", "exports", outputText)(
    (name: string) => {
      if (name !== "expo/config-plugins") throw new Error(`Unexpected dependency: ${name}`)
      return {
        withPodfile: (config: unknown, action: (mod: unknown) => unknown) => action(config),
      }
    },
    module,
    module.exports,
  )
  return module.exports
}

const podfile = `# Keep user content
target 'Example' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
    # Keep later customizations
  end
end
`

describe("persistent iOS deployment floors", () => {
  it("configures matching app and pod floors", () => {
    const properties = app.plugins.find(
      (entry: unknown) => Array.isArray(entry) && entry[0] === "expo-build-properties",
    )
    const floor = app.plugins.find(
      (entry: unknown) => Array.isArray(entry) && entry[0] === "./plugins/withIosDeploymentFloor",
    )
    expect(properties?.[1]?.ios?.deploymentTarget).toBe(configuredFloor)
    expect(floor?.[1]?.deploymentTarget).toBe(configuredFloor)
  })

  it("applies the configured floor to the Podfile mod", () => {
    const { default: plugin, addDeploymentFloor } = loadPlugin()
    const mod = { modResults: { contents: podfile, language: "rb" }, name: "Example" }
    expect(plugin(mod, { deploymentTarget: configuredFloor })).toEqual({
      ...mod,
      modResults: {
        ...mod.modResults,
        contents: addDeploymentFloor(podfile, configuredFloor),
      },
    })
  })

  it("inserts one block after React Native setup and preserves unrelated content", () => {
    const { addDeploymentFloor } = loadPlugin()
    const result = addDeploymentFloor(podfile, configuredFloor)
    expect(result.split("# @generated begin ios-deployment-floor")).toHaveLength(2)
    expect(result.indexOf("# @generated begin ios-deployment-floor")).toBeGreaterThan(
      result.indexOf(":ccache_enabled => ccache_enabled?(podfile_properties),\n    )"),
    )
    expect(
      result.replace(
        /\n[ \t]*# @generated begin ios-deployment-floor[\s\S]*?# @generated end ios-deployment-floor\n/,
        "",
      ),
    ).toBe(podfile)
    expect(addDeploymentFloor(result, configuredFloor)).toBe(result)
  })

  it("updates an existing block when the floor changes", () => {
    const { addDeploymentFloor } = loadPlugin()
    const result = addDeploymentFloor(addDeploymentFloor(podfile, "16.0"), "27.0")
    expect(result).toBe(addDeploymentFloor(podfile, "27.0"))
  })

  it("rejects a missing React Native post-install anchor", () => {
    const { addDeploymentFloor } = loadPlugin()
    expect(() => addDeploymentFloor("target 'Example' do\nend\n", configuredFloor)).toThrow(
      /react_native_post_install/,
    )
  })

  it.each(["", "latest", "16.0'; raise 'unsafe"])("rejects invalid floor %j", (floor) => {
    const { addDeploymentFloor } = loadPlugin()
    expect(() => addDeploymentFloor(podfile, floor)).toThrow(/deploymentTarget/)
  })

  it.each([
    ["16.4", ["16.4", "16.4", "16.4", "17.0", "27.0", "28.0", "16.4"]],
    ["27.0", ["27.0", "27.0", "27.0", "27.0", "27.0", "28.0", "27.0"]],
  ])(
    "raises old or absent pod targets to %s while preserving higher targets",
    (floor, expected) => {
      const result = loadPlugin().addDeploymentFloor(podfile, floor)
      const block = result.match(
        /# @generated begin ios-deployment-floor[\s\S]*?# @generated end ios-deployment-floor/,
      )![0]
      const ruby = `require 'json'
require 'rubygems'
BuildConfiguration = Struct.new(:build_settings)
Target = Struct.new(:build_configurations)
Project = Struct.new(:targets)
Installer = Struct.new(:pods_project)
configs = ['9.0', '15.1', '16.0', '17.0', '27.0', '28.0', nil].map do |value|
  BuildConfiguration.new(value ? {'IPHONEOS_DEPLOYMENT_TARGET' => value} : {})
end
installer = Installer.new(Project.new([Target.new(configs)]))
${block}
puts JSON.generate(configs.map { |config| config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] })
`
      const output = execFileSync("ruby", ["-e", ruby], { encoding: "utf8" })
      expect(JSON.parse(output)).toEqual(expected)
    },
  )
})
