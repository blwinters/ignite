import { filesystem } from "gluegun"
import * as tempy from "tempy"

import {
  copyDefaultScreenGenerator,
  copyExpoRouterGeneratorTemplates,
  removeExpoRouterGeneratorTemplates,
  removeScreenGenerator,
  runIgnite,
  spawnAndLog,
} from "../_test-helpers"

const BOILERPLATE_PATH = filesystem.path(__dirname, "../../boilerplate")

const setup = (): { TEMP_DIR: string } => {
  const TEMP_DIR = tempy.directory({ prefix: "ignite-" })

  beforeEach(() => {
    // create the destination directory
    filesystem.dir(TEMP_DIR)
    // copy the relevant folders
    filesystem.copy(BOILERPLATE_PATH + "/app", TEMP_DIR + "/app", { overwrite: true })
    filesystem.copy(BOILERPLATE_PATH + "/ignite", TEMP_DIR + "/ignite", { overwrite: true })
    filesystem.copy(BOILERPLATE_PATH + "/.prettierrc", TEMP_DIR + "/.prettierrc")
  })

  afterEach(() => {
    filesystem.remove(TEMP_DIR) // clean up our mess
  })

  return { TEMP_DIR }
}

const { read } = filesystem

const { TEMP_DIR } = setup()
const options = {
  pre: `cd ${TEMP_DIR}`,
  post: `cd ${process.cwd()}`,
}

/**
 * "/user/home/ignite" replaces the temp directory, so we don't get failures when it changes every test run
 * @returns command output with temp directory replaced
 */
const replaceHomeDir = (result: string, { mock = "/user/home/ignite", temp = TEMP_DIR } = {}) =>
  result.replace(new RegExp(temp, "g"), mock)

describe("ignite-cli generate", () => {
  it.each([
    ["component", "ExceptionallyLongComponentNameThatNeedsWrapping"],
    ["screen", "ExceptionallyLongScreenNameThatNeedsWrappingScreen"],
    ["navigator", "ExceptionallyLongNavigatorNameThatNeedsWrappingNavigator"],
  ])("formats emitted %s files with the project's configuration", async (generator, name) => {
    filesystem.write(`${TEMP_DIR}/.prettierrc`, {
      printWidth: 60,
      semi: true,
      singleQuote: true,
    })
    const result = await runIgnite(`generate ${generator} ${name}`, options)
    const generatedPath = result.trim().split("\n").at(-1)?.trim()
    expect(generatedPath).toBeDefined()
    const prettier = filesystem.path(require.resolve("prettier"), "..", "bin", "prettier.cjs")
    const paths = [generatedPath]
    if (generator === "screen") {
      const patchedPath = `${TEMP_DIR}/app/navigators/navigationTypes.ts`
      expect(read(patchedPath)).toContain("ExceptionallyLongScreenNameThatNeedsWrapping: undefined")
      paths.push(patchedPath)
    }
    const checked = await spawnAndLog(
      `node "${prettier}" --check ${paths.map((path) => `"${path}"`).join(" ")}`,
      { outputFileName: `generate-format-${generator}.txt` },
    )
    expect(checked).toEqual(expect.objectContaining({ exitCode: 0 }))
    const eslint = filesystem.path(require.resolve("eslint"), "..", "..", "bin", "eslint.js")
    const linted = await spawnAndLog(
      `node "${eslint}" --no-eslintrc --config "${BOILERPLATE_PATH}/.eslintrc.js" --rule 'import/no-unresolved: off' ${paths.map((path) => `"${path}"`).join(" ")}`,
      { outputFileName: `generate-lint-${generator}.txt` },
    )
    expect(linted).toEqual(expect.objectContaining({ exitCode: 0 }))
  })

  it("preserves skipped files and formats explicitly overwritten files", async () => {
    const componentPath = `${TEMP_DIR}/app/components/Topping.tsx`
    const original = "export const Topping=()=>null;\n"
    filesystem.write(componentPath, original)
    await runIgnite("generate component Topping", options)
    expect(read(componentPath)).toBe(original)

    await runIgnite("generate component Topping --overwrite", options)
    const prettier = filesystem.path(require.resolve("prettier"), "..", "bin", "prettier.cjs")
    const checked = await spawnAndLog(`node "${prettier}" --check "${componentPath}"`, {
      outputFileName: "generate-format-overwrite.txt",
    })
    expect(checked).toEqual(expect.objectContaining({ exitCode: 0 }))
    expect(read(componentPath)).toContain("Describe your component here")
  })

  it("honors EditorConfig indentation when Prettier config omits tabWidth", async () => {
    filesystem.write(
      `${TEMP_DIR}/.editorconfig`,
      "root = true\n\n[*]\nindent_style = space\nindent_size = 4\n",
    )
    await runIgnite("generate component Topping", options)
    const componentPath = `${TEMP_DIR}/app/components/Topping.tsx`
    const prettier = filesystem.path(require.resolve("prettier"), "..", "bin", "prettier.cjs")
    const checked = await spawnAndLog(`node "${prettier}" --check "${componentPath}"`, {
      outputFileName: "generate-format-editorconfig.txt",
    })
    expect(checked).toEqual(expect.objectContaining({ exitCode: 0 }))
  })

  describe("components", () => {
    it("should generate Topping component and patch index components export", async () => {
      const result = await runIgnite(`generate component Topping`, options)

      expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
        "   
           
           Generated new files:
           /user/home/ignite/app/components/Topping.tsx
        "
      `)
      expect(read(`${TEMP_DIR}/app/components/Topping.tsx`)).toMatchInlineSnapshot(`
"import { StyleProp, TextStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface ToppingProps {
  /**
   * An optional style override useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>
}

/**
 * Describe your component here
 */
export const Topping = (props: ToppingProps) => {
  const { style } = props
  const $styles = [$container, style]
  const { themed } = useAppTheme()

  return (
    <View style={$styles}>
      <Text style={themed($text)}>Hello</Text>
    </View>
  )
}

const $container: ViewStyle = {
  justifyContent: "center",
}

const $text: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontFamily: typography.primary.normal,
  fontSize: 14,
  color: colors.palette.primary500,
})
"
`)
      expect(read(`${TEMP_DIR}/app/components/index.ts`)).toMatchInlineSnapshot(`undefined`)
    })

    it("should generate Topping component in subdirectory and patch index components export", async () => {
      const result = await runIgnite(`generate component sub/to/my/Topping`, options)

      expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
        "   
           
           Generated new files:
           /user/home/ignite/app/components/sub/to/my/Topping.tsx
        "
      `)
      expect(read(`${TEMP_DIR}/app/components/sub/to/my/Topping.tsx`)).toMatchInlineSnapshot(`
"import { StyleProp, TextStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface ToppingProps {
  /**
   * An optional style override useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>
}

/**
 * Describe your component here
 */
export const Topping = (props: ToppingProps) => {
  const { style } = props
  const $styles = [$container, style]
  const { themed } = useAppTheme()

  return (
    <View style={$styles}>
      <Text style={themed($text)}>Hello</Text>
    </View>
  )
}

const $container: ViewStyle = {
  justifyContent: "center",
}

const $text: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontFamily: typography.primary.normal,
  fontSize: 14,
  color: colors.palette.primary500,
})
"
`)
      expect(read(`${TEMP_DIR}/app/components/index.ts`)).toMatchInlineSnapshot(`undefined`)
    })
  })
})

describe("ignite-cli generate with path params", () => {
  it("should generate Topping component in the src/components directory", async () => {
    const result = await runIgnite(`generate component Topping --dir=src/components`, options)

    expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
      "   
         
         Generated new files:
         /user/home/ignite/src/components/Topping.tsx
      "
    `)
  })

  it("should generate Sicilian screen in the src/screens directory", async () => {
    const result = await runIgnite(`generate screen Sicilian --dir=src/screens`, options)

    expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
      "   
         
         Generated new files:
         /user/home/ignite/src/screens/SicilianScreen.tsx
      "
    `)
  })
})

describe("ignite-cli generate screens expo-router style", () => {
  beforeEach(() => {
    // modify the generator template for screens to be a standard pattern for expo-router
    removeScreenGenerator(TEMP_DIR)

    // copy expo router specific screen and route generator templates
    copyExpoRouterGeneratorTemplates(TEMP_DIR)
  })

  afterEach(() => {
    // restore the generator template for screens to be a standard pattern for react-navigation
    removeExpoRouterGeneratorTemplates(TEMP_DIR)
    copyDefaultScreenGenerator(TEMP_DIR)
  })

  it("should generate `log-in` screen exactly in the requested path", async () => {
    const result = await runIgnite(`generate route log-in --dir="src/app/(app)/(tabs)"`, options)

    expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
      "   
         
         Generated new files:
         /user/home/ignite/src/app/(app)/(tabs)/log-in.tsx
      "
    `)

    expect(read(`${TEMP_DIR}/src/app/(app)/(tabs)/log-in.tsx`)).toMatchInlineSnapshot(`
"import { LogInScreen } from "@/screens/LogInScreen"

export default function LogIn() {
  return <LogInScreen />
}
"
`)
  })

  it("should generate dynamic id files at requested path", async () => {
    const result = await runIgnite(
      `generate dynamic-route [id] --case=none --dir="src/app/(app)/(tabs)/podcasts"`,
      options,
    )

    expect(replaceHomeDir(result)).toMatchInlineSnapshot(`
        "   
           
           Generated new files:
           /user/home/ignite/src/app/(app)/(tabs)/podcasts/[id].tsx
        "
      `)
    expect(read(`${TEMP_DIR}/src/app/(app)/(tabs)/podcasts/[id].tsx`)).toMatchInlineSnapshot(`
"import { IdScreen } from "@/screens/IdScreen"

export default function Id() {
  return <IdScreen />
}
"
`)
  })
})
