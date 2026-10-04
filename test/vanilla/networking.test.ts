import { createElement } from "react"
import { readFileSync } from "fs"
import { filesystem } from "gluegun"
import { resolve } from "path"
import { act, create } from "react-test-renderer"
import * as tempy from "tempy"
import { transpileModule, ModuleKind, JsxEmit } from "typescript"

import { spawnIgniteAndPrintIfFail } from "../_test-helpers"

// Run the starter's tests against its real source without installing a native app fixture.
function loadApiTemplate(filename: string) {
  const path = resolve(__dirname, "../../boilerplate/app/services/api", filename)
  const source = readFileSync(path, "utf8")
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  const module = { exports: {} as any }
  const localRequire = (name: string) => {
    if (name === "@/config") return loadApiTemplate("../../config/config.dev.ts")
    if (name.startsWith("./")) return loadApiTemplate(`${name.slice(2)}.ts`)
    return require(name)
  }
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports)
  return module.exports
}

describe("starter API runtime", () => {
  loadApiTemplate("index.test.ts")
  loadApiTemplate("apiProblem.test.ts")
})

describe("demo episode consumer", () => {
  const episodes = [
    {
      guid: "episode-400",
      title: "Networking",
      pubDate: "2026-10-03",
      link: "https://example.com/episode",
      author: "React Native Radio",
      thumbnail: "https://example.com/image.png",
      description: "Networking discussion",
      content: "Episode content",
      enclosure: {
        link: "https://example.com/audio.mp3",
        type: "audio/mpeg",
        length: 100,
        duration: 60,
        rating: { scheme: "urn:simple", value: "clean" },
      },
      categories: ["Technology"],
    },
  ]
  let tree: ReturnType<typeof create>
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(async () => {
    if (tree) await act(async () => tree.unmount())
    jest.restoreAllMocks()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  function loadEpisodes(getEpisodes: () => Promise<unknown>) {
    const { outputText } = transpileModule(
      readFileSync(resolve(__dirname, "../../boilerplate/app/context/EpisodeContext.tsx"), "utf8"),
      { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
    )
    const module = { exports: {} as any }
    const dependencies = {
      "react": require("react"),
      "react/jsx-runtime": require("react/jsx-runtime"),
      "@/services/api": { api: { getEpisodes } },
      "@/i18n/translate": { translate: (key: string) => key },
      "@/utils/formatDate": { formatDate: (date: string) => date },
    }
    new Function("require", "module", "exports", outputText)(
      (name: string) => {
        if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
        return dependencies[name]
      },
      module,
      module.exports,
    )
    return module.exports
  }

  async function mount(getEpisodes: () => Promise<unknown>) {
    // React 19 warns that the renderer is deprecated; keep all other console errors visible.
    const originalError = console.error
    jest.spyOn(console, "error").mockImplementation((message, ...args) => {
      if (String(message).startsWith("react-test-renderer is deprecated")) return
      originalError(message, ...args)
    })
    const { EpisodeProvider, useEpisodes } = loadEpisodes(getEpisodes)
    let context: any
    const Consumer = () => {
      context = useEpisodes()
      return null
    }
    await act(async () => {
      tree = create(createElement(EpisodeProvider, null, createElement(Consumer)))
    })
    return () => context
  }

  it("updates episode state from the returned application data", async () => {
    const getContext = await mount(async () => episodes)
    await act(async () => {
      await getContext().fetchEpisodes()
    })
    expect(getContext().totalEpisodes).toBe(1)
    expect(getContext().episodesForList).toEqual(episodes)
  })

  it("handles rejected requests and keeps previously loaded episodes", async () => {
    let fail = false
    const getContext = await mount(async () => {
      if (fail) throw new Error("Network unavailable")
      return episodes
    })
    await act(async () => {
      await getContext().fetchEpisodes()
    })
    fail = true
    jest.spyOn(console, "error").mockImplementation(() => undefined)
    await act(async () => {
      await expect(getContext().fetchEpisodes()).resolves.toBeUndefined()
    })
    expect(getContext().episodesForList).toEqual(episodes)
  })
})

describe("generated transport", () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = tempy.directory({ prefix: "ignite-networking-" })
  })
  afterEach(() => {
    filesystem.remove(tempDir)
  })

  it.each(["expo-router", "react-navigation"])(
    "uses Axios without Apisauce in the generated %s app",
    async (navigation) => {
      await spawnIgniteAndPrintIfFail(
        `new Networking --yes --packager=npm --navigation=${navigation} --install-deps=false --git=false`,
        { pre: `cd ${tempDir}`, outputFileName: `ignite-networking-${navigation}.txt` },
      )
      const appPath = `${tempDir}/Networking`
      const pkg = filesystem.read(`${appPath}/package.json`, "json")
      expect(pkg.dependencies.axios).toBe("1.20.0")
      expect(pkg.dependencies.apisauce).toBeUndefined()
      const apiPath = `${appPath}/${navigation === "expo-router" ? "src" : "app"}/services/api`
      expect(filesystem.exists(`${apiPath}/index.test.ts`)).toBe(false)
      // The generated, demo-free source must compile and load with Axios alone.
      const { outputText } = transpileModule(filesystem.read(`${apiPath}/index.ts`), {
        compilerOptions: { module: ModuleKind.CommonJS },
      })
      const module = { exports: {} as any }
      new Function("require", "module", "exports", outputText)(
        (name: string) =>
          name === "@/config"
            ? { default: { API_URL: "https://api.rss2json.com/v1/" } }
            : require(name),
        module,
        module.exports,
      )
      expect(module.exports.api.client.defaults.baseURL).toBe("https://api.rss2json.com/v1/")
    },
  )
})
