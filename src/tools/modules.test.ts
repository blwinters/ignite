import { filesystem, GluegunToolbox } from "gluegun"
import * as tempy from "tempy"

import { applyOptionalModules, ModuleDescriptor, parseOptionalModules } from "./modules"

describe("optional modules", () => {
  it.each([
    [undefined, []],
    ["", []],
    ["supabase", ["supabase"]],
    [" supabase, supabase ,", ["supabase"]],
  ])("normalizes selection %j", (raw, expected) => {
    expect(parseOptionalModules(raw as string | undefined)).toEqual(expected)
  })

  it.each(["unknown", "firebase", "clerk", "watermelondb", "revenuecat", "purchases"])(
    "rejects unavailable module %s with installable choices",
    (name) => {
      expect(() => parseOptionalModules(name)).toThrow(/supabase/i)
      expect(() => parseOptionalModules(name)).toThrow(/unknown|planned|unavailable/i)
    },
  )

  it("applies a descriptor without replacing existing dependencies or copying the catalog", async () => {
    const targetPath = tempy.directory({ prefix: "ignite-module-unit-" })
    try {
      filesystem.write(`${targetPath}/package.json`, {
        dependencies: { expo: "55.0.5" },
        scripts: { check: "npm run lint && npm run typecheck" },
      })
      filesystem.write(`${targetPath}/.gitignore`, "node_modules/\n")
      const context = {
        filesystem,
        meta: { src: filesystem.path(__dirname, "..") },
      } as GluegunToolbox
      await applyOptionalModules(context, targetPath, ["supabase", "supabase"])
      const pkg = filesystem.read(`${targetPath}/package.json`, "json")
      expect(Object.keys(pkg.dependencies).sort()).toEqual([
        "@supabase/supabase-js",
        "expo",
        "react-native-url-polyfill",
      ])
      expect(pkg.dependencies.expo).toBe("55.0.5")
      expect(pkg.scripts.check).toBe("npm run lint && npm run typecheck")
      for (const file of ["client.ts", "config.ts", "config.test.ts"]) {
        expect(filesystem.exists(`${targetPath}/services/supabase/${file}`)).toBe("file")
      }
      expect(filesystem.exists(`${targetPath}/docs/supabase.md`)).toBe("file")
      expect(filesystem.exists(`${targetPath}/modules`)).toBe(false)
      expect(filesystem.read(`${targetPath}/.env.example`)).toBe(
        "EXPO_PUBLIC_SUPABASE_URL=\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n",
      )
      const descriptor = filesystem.read(
        filesystem.path(__dirname, "../../boilerplate/modules/supabase/module.json"),
        "json",
      ) as ModuleDescriptor
      expect(descriptor.publicEnv).toEqual([
        "EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ])
    } finally {
      filesystem.remove(targetPath)
    }
  })
})
