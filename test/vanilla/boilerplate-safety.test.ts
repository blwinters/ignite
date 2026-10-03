import { readFileSync } from "fs"
import { resolve } from "path"
import { transpileModule, ModuleKind } from "typescript"
import { runInNewContext } from "vm"

function loadTemplate(
  filename: string,
  dependencies: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  const source = readFileSync(resolve(__dirname, "../../boilerplate", filename), "utf8")
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  const module = { exports: {} as any }
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    process: { env },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected template dependency: ${name}`)
      return dependencies[name]
    },
  })
  return module.exports
}

describe("React Navigation back handler", () => {
  it.each([
    [undefined, false],
    [{ index: 0, routes: [{ name: "Home" }] }, true],
  ])("handles root state %j without traversing absent state", (rootState, expected) => {
    const effects: (() => void)[] = []
    let onBackPress: () => boolean
    const canExit = jest.fn(() => true)
    const exitApp = jest.fn()
    const goBack = jest.fn()
    const navigationRef = {
      isReady: () => true,
      getRootState: () => rootState,
      canGoBack: () => true,
      goBack,
    }
    const { useBackButtonHandler } = loadTemplate("app/navigators/navigationUtilities.ts", {
      "react": {
        useEffect: (effect) => effects.push(effect),
        useRef: (current) => ({ current }),
      },
      "react-native": {
        Platform: { OS: "android" },
        BackHandler: {
          exitApp,
          addEventListener: (_event, handler) => {
            onBackPress = handler
            return { remove: () => undefined }
          },
        },
      },
      "@react-navigation/native": { createNavigationContainerRef: () => navigationRef },
      "@/config": { default: {} },
      "@/utils/storage": {},
      "@/utils/useIsMounted": {},
    })
    useBackButtonHandler(canExit)
    effects.forEach((effect) => effect())
    expect(onBackPress()).toBe(expected)
    if (rootState) {
      expect(canExit).toHaveBeenCalledWith("Home")
      expect(exitApp).toHaveBeenCalledTimes(1)
    } else {
      expect(canExit).not.toHaveBeenCalled()
      expect(exitApp).not.toHaveBeenCalled()
    }
    expect(goBack).not.toHaveBeenCalled()
  })
})

describe("EAS project configuration", () => {
  it.each([undefined, "", "   "])(
    "omits project and update fields for EAS_PROJECT_ID=%j",
    (projectId) => {
      const env: Record<string, string> = { APP_VARIANT: "preview" }
      if (projectId !== undefined) env.EAS_PROJECT_ID = projectId
      const variants = loadTemplate("app/config/variants.ts", {}, env)
      const getConfig = loadTemplate(
        "app.config.ts",
        { "tsx/cjs": {}, "./app/config/variants": variants },
        env,
      )
      const config = getConfig({
        config: {
          name: "ConfigFixture",
          ios: { bundleIdentifier: "org.example.configfixture" },
          android: { package: "org.example.configfixture" },
          extra: { ignite: { version: "11.5.0" } },
          updates: { fallbackToCacheTimeout: 0 },
          plugins: ["existing-plugin"],
        },
      })
      expect(config.extra.eas).toBeUndefined()
      expect(config.updates.url).toBeUndefined()
      expect(config.runtimeVersion).toBeUndefined()
      expect(config.extra.ignite.version).toBe("11.5.0")
      expect(config.updates.fallbackToCacheTimeout).toBe(0)
      expect(config.plugins).toEqual(["existing-plugin"])
      expect(config.ios.privacyManifests.NSPrivacyAccessedAPITypes).toHaveLength(1)
    },
  )
})
