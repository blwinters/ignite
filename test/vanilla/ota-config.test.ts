import { filesystem } from "gluegun"
import { execFileSync } from "node:child_process"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import * as tempy from "tempy"
import { ModuleKind, transpileModule } from "typescript"

import { spawnIgniteAndPrintIfFail } from "../_test-helpers"

const projectId = "00000000-0000-4000-8000-000000000000"
const otherProject = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

// Execute generated configuration and its real variant module without installing native dependencies.
function loadConfigModule(filename: string, env: Record<string, string>, variants?: unknown) {
  const { outputText } = transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  const module = { exports: {} as any }
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    process: { env },
    require: (name: string) => {
      if (name === "tsx/cjs") return {}
      if (name === "./app/config/variants" || name === "./src/config/variants") return variants
      throw new Error(`Unexpected configuration dependency: ${name}`)
    },
  })
  return module.exports
}

describe.each(["expo-router", "react-navigation"])("generated %s OTA support", (navigation) => {
  let tempDir: string
  let appPath: string
  let baseConfig: any
  let pkg: any
  let eas: any
  let toolsBin: string

  beforeAll(async () => {
    tempDir = tempy.directory({ prefix: "ignite-ota-" })
    await spawnIgniteAndPrintIfFail(
      `new OtaApp --yes --packager=npm --navigation=${navigation} --bundle=org.example.otaapp --install-deps=false --git=false`,
      { pre: `cd ${tempDir}`, outputFileName: `ignite-ota-${navigation}.txt` },
    )
    appPath = join(tempDir, "OtaApp")
    baseConfig = JSON.parse(readFileSync(join(appPath, "app.json"), "utf8"))
    pkg = JSON.parse(readFileSync(join(appPath, "package.json"), "utf8"))
    eas = JSON.parse(readFileSync(join(appPath, "eas.json"), "utf8"))
    const toolsPath = join(tempDir, "command-tools")
    toolsBin = join(toolsPath, "node_modules", ".bin")
    if (pkg.devDependencies["cross-env"]) {
      filesystem.dir(toolsPath)
      filesystem.write(join(toolsPath, "package.json"), {
        private: true,
        devDependencies: { "cross-env": pkg.devDependencies["cross-env"] },
      })
      execFileSync(
        "npm",
        ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
        {
          cwd: toolsPath,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
    }
  })

  afterAll(() => filesystem.remove(tempDir))

  function configure(config = baseConfig, id = "", variant = "preview") {
    const env = { EAS_PROJECT_ID: id, APP_VARIANT: variant }
    const variants = loadConfigModule(
      join(appPath, navigation === "expo-router" ? "src" : "app", "config/variants.ts"),
      env,
    )
    return loadConfigModule(join(appPath, "app.config.ts"), env, variants)({ config })
  }

  it.each([
    ["development", "OtaApp (Dev)", "org.example.otaapp.dev"],
    ["preview", "OtaApp (Preview)", "org.example.otaapp.preview"],
    ["production", "OtaApp", "org.example.otaapp"],
  ])("enables saved project updates for %s without changing its variant", (variant, name, id) => {
    const config = configure(
      {
        ...baseConfig,
        extra: { ...baseConfig.extra, retained: true, eas: { projectId: ` ${projectId} ` } },
        updates: { fallbackToCacheTimeout: 0, enabled: false },
      },
      "",
      variant,
    )
    expect(config.updates).toEqual({
      enabled: true,
      url: "https://u.expo.dev/00000000-0000-4000-8000-000000000000",
      fallbackToCacheTimeout: 0,
    })
    expect(config.runtimeVersion).toEqual({ policy: "appVersion" })
    expect(config.extra).toMatchObject({ retained: true, eas: { projectId } })
    expect(config.extra.ignite.version).toBeDefined()
    expect(config.name).toBe(name)
    expect(config.ios.bundleIdentifier).toBe(id)
    expect(config.android.package).toBe(id)
    expect(config.web).toEqual(baseConfig.web)
    expect(config.ios.privacyManifests.NSPrivacyAccessedAPITypes).toHaveLength(1)
  })

  it("uses the environment project consistently while retaining saved metadata", () => {
    const config = configure(
      { ...baseConfig, extra: { retained: true, eas: { projectId, retained: "eas metadata" } } },
      ` ${otherProject} `,
    )
    expect(config.updates).toMatchObject({
      enabled: true,
      url: "https://u.expo.dev/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    })
    expect(config.extra).toEqual({
      retained: true,
      eas: { projectId: otherProject, retained: "eas metadata" },
    })
  })

  it.each(["", "   "])("disables an unlinked app for environment ID %j", (id) => {
    const config = configure(
      {
        ...baseConfig,
        extra: { retained: true },
        updates: {
          enabled: true,
          url: "https://example.com/stale-update",
          fallbackToCacheTimeout: 0,
        },
      },
      id,
    )
    expect(config.updates.enabled).toBe(false)
    expect(config.updates.url).toBeUndefined()
    expect(config.updates.fallbackToCacheTimeout).toBe(0)
    expect(config.runtimeVersion).toBeUndefined()
    expect(config.extra).toEqual({ retained: true })
  })

  it.each(["environment", "saved"])("rejects a malformed %s project link", (source) => {
    const config = {
      ...baseConfig,
      extra: { eas: { projectId: source === "saved" ? "not-a-project-id" : projectId } },
    }
    expect(() => configure(config, source === "environment" ? "not-a-project-id" : "")).toThrow(
      "EAS project ID must be a UUID",
    )
  })

  it("ships the SDK-compatible update runtime and a standalone development profile", () => {
    expect(pkg.dependencies["expo-updates"]).toBe("~57.0.24")
    const profile = eas.build["development-ota"]
    expect(profile).toMatchObject({
      node: "24.21.0",
      corepack: false,
      distribution: "internal",
      environment: "development",
      channel: "development",
      env: { APP_VARIANT: "development" },
      ios: { simulator: false },
      android: { buildType: "apk" },
    })
    expect(profile.developmentClient ?? false).toBe(false)
    expect(profile.ios.buildConfiguration ?? "Release").toBe("Release")
  })

  it.each(["development", "preview", "production"])(
    "publishes %s with matching variant and environment through the package command",
    (channel) => {
      const executable = join(tempDir, "eas")
      writeFileSync(
        executable,
        `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), variant: process.env.APP_VARIANT }));\n`,
      )
      chmodSync(executable, 0o700)
      const output = execFileSync(
        "npm",
        ["run", "--silent", `update:${channel}`, "--", "--message", "Test-only CLI boundary"],
        {
          cwd: appPath,
          env: {
            ...process.env,
            APP_VARIANT: "conflicting-parent-value",
            PATH: `${toolsBin}:${tempDir}:${process.env.PATH}`,
          },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
      expect(JSON.parse(output)).toEqual({
        variant: channel,
        args: [
          "update",
          "--channel",
          channel,
          "--environment",
          channel,
          "--platform",
          "all",
          "--message",
          "Test-only CLI boundary",
        ],
      })
    },
  )

  it.each(["development", "preview", "production"])(
    "sets %s and forwards arguments without POSIX shell assignment support",
    (channel) => {
      const executable = join(tempDir, "eas")
      writeFileSync(
        executable,
        `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), variant: process.env.APP_VARIANT }));\n`,
      )
      chmodSync(executable, 0o700)
      const [command, ...args] = pkg.scripts[`update:${channel}`].split(" ")
      const output = execFileSync(command, [...args, "--message", "Message with spaces"], {
        cwd: appPath,
        env: {
          ...process.env,
          APP_VARIANT: "conflicting-parent-value",
          PATH: `${toolsBin}:${tempDir}:${process.env.PATH}`,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      expect(JSON.parse(output)).toEqual({
        variant: channel,
        args: [
          "update",
          "--channel",
          channel,
          "--environment",
          channel,
          "--platform",
          "all",
          "--message",
          "Message with spaces",
        ],
      })
    },
  )

  it.each(["ios", "android"])("builds standalone development OTA for %s", (platform) => {
    const executable = join(tempDir, "eas")
    writeFileSync(
      executable,
      `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`,
    )
    chmodSync(executable, 0o700)
    const output = execFileSync("npm", ["run", "--silent", `build:${platform}:ota`], {
      cwd: appPath,
      env: { ...process.env, PATH: `${tempDir}:${process.env.PATH}` },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    expect(JSON.parse(output)).toEqual([
      "build",
      "--profile",
      "development-ota",
      "--platform",
      platform,
      "--local",
    ])
  })
})
