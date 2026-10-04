import { createElement } from "react"
import { readFileSync, existsSync } from "fs"
import { resolve } from "path"
import { act, create } from "react-test-renderer"
import { JsxEmit, ModuleKind, transpileModule } from "typescript"

jest.mock(
  "react-native",
  () => ({
    AppState: { currentState: "active", addEventListener: jest.fn() },
    Platform: { OS: "ios" },
  }),
  { virtual: true },
)
jest.mock(
  "expo-network",
  () => ({
    getNetworkStateAsync: jest.fn(),
    addNetworkStateListener: jest.fn(),
  }),
  { virtual: true },
)

const root = resolve(__dirname, "../../boilerplate/modules/tanstack-query/files/services/query")
const cache = new Map<string, any>()
function loadQueryTemplate(filename: string) {
  if (cache.has(filename)) return cache.get(filename)
  const { outputText } = transpileModule(readFileSync(resolve(root, filename), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  })
  const module = { exports: {} as any }
  const localRequire = (name: string) => {
    if (name.startsWith("./")) {
      const base = name.slice(2)
      return loadQueryTemplate(`${base}.${existsSync(resolve(root, `${base}.ts`)) ? "ts" : "tsx"}`)
    }
    return require(name)
  }
  new Function("require", "module", "exports", "jest", outputText)(
    localRequire,
    module,
    module.exports,
    jest,
  )
  cache.set(filename, module.exports)
  return module.exports
}

describe("Query module runtime", () => {
  // Missing optional runtime must fail as an assertion before evaluating its tests.
  it("ships runnable Query client and native lifecycle tests", () => {
    expect(existsSync(resolve(root, "client.test.ts"))).toBe(true)
    expect(existsSync(resolve(root, "nativeLifecycle.test.ts"))).toBe(true)
    expect(existsSync(resolve(root, "client.ts"))).toBe(true)
    expect(existsSync(resolve(root, "nativeLifecycle.ts"))).toBe(true)
  })
  if (existsSync(resolve(root, "client.ts"))) loadQueryTemplate("client.test.ts")
  if (existsSync(resolve(root, "nativeLifecycle.ts"))) loadQueryTemplate("nativeLifecycle.test.ts")
})

describe("QueryProvider", () => {
  it("keeps the real client and cache across renders, then removes native listeners on unmount", async () => {
    expect(existsSync(resolve(root, "QueryProvider.tsx"))).toBe(true)
    const { useQueryClient } = require("@tanstack/react-query")
    const { AppState } = require("react-native")
    const network = require("expo-network")
    const listeners = new Set<unknown>()
    AppState.addEventListener.mockImplementation((_event, callback) => {
      listeners.add(callback)
      return { remove: () => listeners.delete(callback) }
    })
    network.addNetworkStateListener.mockImplementation((callback) => {
      listeners.add(callback)
      return { remove: () => listeners.delete(callback) }
    })
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const originalError = console.error
    jest.spyOn(console, "error").mockImplementation((message, ...args) => {
      if (String(message).startsWith("react-test-renderer is deprecated")) return
      originalError(message, ...args)
    })
    let tree: ReturnType<typeof create> | undefined
    let client: any
    const Consumer = () => {
      client = useQueryClient()
      return null
    }
    try {
      const { QueryProvider } = loadQueryTemplate("QueryProvider.tsx")
      await act(async () => {
        tree = create(createElement(QueryProvider, null, createElement(Consumer)))
      })
      const firstClient = client
      client.setQueryData(["account", "123"], { name: "Ada" })
      await act(async () => {
        tree!.update(createElement(QueryProvider, null, createElement(Consumer)))
      })
      expect(client).toBe(firstClient)
      expect(client.getQueryData(["account", "123"])).toEqual({ name: "Ada" })
      expect(listeners.size).toBe(2)
    } finally {
      if (tree) await act(async () => tree!.unmount())
      expect(listeners.size).toBe(0)
      client?.clear()
      jest.restoreAllMocks()
      delete globalThis.IS_REACT_ACT_ENVIRONMENT
    }
  })
})
