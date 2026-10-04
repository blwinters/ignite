import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ModuleKind, transpileModule } from "typescript"

const root = resolve(__dirname, "../../boilerplate")
const pluginPath = join(root, "plugins/withIosDeploymentFloor.ts")
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"))
const configuredFloor = "16.0"

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
    ["16.0", ["16.0", "16.0", "16.0", "17.0", "27.0", "28.0", "16.0"]],
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
