import { filesystem } from "gluegun"
import { dirname, resolve } from "path"
import * as tempy from "tempy"
import {
  createSourceFile,
  isImportDeclaration,
  isJsxOpeningElement,
  ScriptTarget,
} from "typescript"

import { spawnIgniteAndPrintIfFail } from "../_test-helpers"

describe("ignite new optional Query module", () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = tempy.directory({ prefix: "ignite-query-" })
  })
  afterEach(() => filesystem.remove(tempDir))

  it.each([
    ["expo-router", "tanstack-query,tanstack-query"],
    ["react-navigation", "tanstack-query"],
    ["expo-router", "supabase,tanstack-query"],
    ["react-navigation", "tanstack-query,supabase"],
  ])("wires one provider after %s conversion with %s", async (navigation, selection) => {
    await spawnIgniteAndPrintIfFail(
      `new QueryApp --yes --packager=npm --navigation=${navigation} --modules=${selection} --install-deps=false --git=false`,
      { pre: `cd ${tempDir}`, outputFileName: `ignite-query-${navigation}-${selection}.txt` },
    )
    const appPath = `${tempDir}/QueryApp`
    const pkg = filesystem.read(`${appPath}/package.json`, "json")
    expect(pkg.dependencies["@tanstack/react-query"]).toBe("5.104.1")
    expect(pkg.dependencies["expo-network"]).toBe("~57.0.2")
    for (const file of [
      "services/query/client.ts",
      "services/query/client.test.ts",
      "services/query/nativeLifecycle.ts",
      "services/query/nativeLifecycle.test.ts",
      "services/query/QueryProvider.tsx",
      "docs/query.md",
    ]) {
      expect(filesystem.exists(`${appPath}/${file}`)).toBe("file")
    }
    expect(filesystem.exists(`${appPath}/modules`)).toBe(false)
    const entry = `${appPath}/${navigation === "expo-router" ? "src/app/_layout.tsx" : "app/app.tsx"}`
    const { ESLint } = require("eslint")
    const eslint = new ESLint({
      cwd: appPath,
      useEslintrc: false,
      overrideConfigFile: resolve(__dirname, "../../boilerplate/.eslintrc.js"),
      // Supply the generated package's actual React version without a native install.
      overrideConfig: { settings: { react: { version: pkg.dependencies.react } } },
      fix: true,
    })
    // Match the hosted initial lint:fix phase without installing native dependencies
    // or changing files. Assert this rule's results without disabling any lint rules.
    const lintResults = await eslint.lintFiles([entry])
    const importErrors = lintResults.flatMap((result) =>
      result.messages.filter((message) => message.ruleId === "import/order"),
    )
    expect(importErrors).toEqual([])
    const ast = createSourceFile(entry, filesystem.read(entry), ScriptTarget.Latest, true)
    const imports: string[] = []
    let providers = 0
    const visit = (node) => {
      if (isImportDeclaration(node) && node.importClause?.getText(ast).includes("QueryProvider")) {
        imports.push(node.moduleSpecifier.getText(ast).slice(1, -1))
      }
      if (isJsxOpeningElement(node) && node.tagName.getText(ast) === "QueryProvider") providers++
      node.forEachChild(visit)
    }
    visit(ast)
    expect(providers).toBe(1)
    expect(imports).toHaveLength(1)
    expect(filesystem.exists(resolve(dirname(entry), `${imports[0]}.tsx`))).toBe("file")
    if (selection.includes("supabase")) {
      expect(pkg.dependencies["@supabase/supabase-js"]).toBe("2.105.3")
      expect(filesystem.exists(`${appPath}/services/supabase/client.ts`)).toBe("file")
      expect(filesystem.exists(`${appPath}/docs/supabase.md`)).toBe("file")
      expect(filesystem.read(`${appPath}/.env.example`)).toBe(
        "EXPO_PUBLIC_SUPABASE_URL=\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n",
      )
    } else {
      expect(pkg.dependencies["@supabase/supabase-js"]).toBeUndefined()
      expect(filesystem.exists(`${appPath}/.env.example`)).toBe(false)
    }
  })

  it("separates base, Query, and combined dependency caches regardless of selection order", async () => {
    const cachePaths: string[] = []
    for (const [index, selection] of [
      "",
      "tanstack-query",
      "supabase,tanstack-query",
      "tanstack-query,supabase",
    ].entries()) {
      const output = await spawnIgniteAndPrintIfFail(
        `new CacheQuery --target-path=${tempDir}/app${index} --yes --debug --packager=npm ${selection ? `--modules=${selection}` : ""} --use-cache=true --install-deps=false --git=false`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-query-cache-${index}.txt` },
      )
      const cachePath = output.match(/cachePath: ([^\s\u001b]+)/)?.[1]
      expect(cachePath).toBeDefined()
      cachePaths.push(cachePath!)
    }
    expect(new Set(cachePaths.slice(0, 3)).size).toBe(3)
    expect(cachePaths[2]).toBe(cachePaths[3])
  })
})
