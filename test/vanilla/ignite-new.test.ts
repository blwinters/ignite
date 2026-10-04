import { filesystem } from "gluegun"
import * as tempy from "tempy"

import { runError, run, runIgnite, spawnAndLog, spawnIgniteAndPrintIfFail } from "../_test-helpers"

const APP_NAME = "Foo"
const originalDir = process.cwd()

describe("ignite new", () => {
  describe("errors", () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = tempy.directory({ prefix: "ignite-" })
    })

    afterEach(() => {
      filesystem.remove(tempDir) // clean up our mess
    })

    test(`invalid bundle id "thisisbad" throws expected error`, async () => {
      const result = await runError(`new BadBundleID --bundle thisisbad --yes`)
      expect((result as any).stdout).toContain(`Invalid Bundle Identifier.`)
    })
  })

  describe(`ignite new ${APP_NAME} --debug --packager=bun --navigation=react-navigation --remove-demo=false --yes`, () => {
    let tempDir: string
    let result: string
    let appPath: string

    beforeAll(async () => {
      tempDir = tempy.directory({ prefix: "ignite-" })

      result = await spawnIgniteAndPrintIfFail(
        `new ${APP_NAME} --debug --packager=bun --navigation=react-navigation --remove-demo=false --yes`,
        {
          pre: `cd ${tempDir}`,
          post: `cd ${originalDir}`,
          outputFileName: "ignite-new-output-bun.txt",
        },
      )

      appPath = filesystem.path(tempDir, APP_NAME)
    })

    afterAll(() => {
      // console.log(tempDir) // uncomment for debugging, then run `code <tempDir>` to see the generated app
      filesystem.remove(tempDir) // clean up our mess
    })

    it("should print success message", () => {
      // at some point this should probably be a snapshot?
      expect(result).toContain("Now get cooking! 🍽")
    })

    it("should have created expected directories", () => {
      // now let's examine the spun-up app
      const dirs = filesystem.list(appPath)
      expect(dirs).toContain("ios")
      expect(dirs).toContain("android")
      expect(dirs).toContain("app")
      expect(dirs).toContain("bun.lock")

      // check the contents of ignite/templates
      const templates = filesystem.list(`${appPath}/ignite/templates`)
      expect(templates).toContain("component")
      expect(templates).toContain("screen")
      expect(templates).toContain("app-icon")
    })

    it("should have created an apple privacy manifest file", () => {
      // now let's examine the spun-up app
      const dirs = filesystem.list(appPath + `/ios/${APP_NAME}/`)
      expect(dirs).toContain("PrivacyInfo.xcprivacy")
    })

    it(`should have renamed all permutations of hello-world to ${APP_NAME}`, async () => {
      // react-native-rename doesn't always catch everything, so we need to check for
      // any instances and fail if it doesn't work
      await checkForLeftoverHelloWorld(appPath)
    })

    it("should have changed the android bundle id", () => {
      const androidPackageName = APP_NAME.toLowerCase()
      const mainAppJava = filesystem.read(
        `${appPath}/android/app/src/main/java/com/${androidPackageName}/MainApplication.kt`,
      )
      expect(mainAppJava).toContain(`package com.${androidPackageName}`)
      const mainActivityJava = filesystem.read(
        `${appPath}/android/app/src/main/java/com/${androidPackageName}/MainActivity.kt`,
      )
      expect(mainActivityJava).toContain(`package com.${androidPackageName}`)
    })

    it("should have modified package.json for proper run scripts", () => {
      const igniteJSON = filesystem.read(`${appPath}/package.json`, "json")
      expect(igniteJSON).toHaveProperty("scripts")
      expect(igniteJSON).toHaveProperty("dependencies")
      expect(igniteJSON.scripts.android).toBe("expo run:android")
      expect(igniteJSON.scripts.ios).toBe("expo run:ios")
    })

    it("should have created app.tsx with export", () => {
      const appJS = filesystem.read(`${appPath}/app/app.tsx`)
      expect(appJS).toContain("export function App")
    })

    it("should pass nonmutating bun run check and validate generated components", async () => {
      // other common test operations
      const runOpts = {
        pre: `cd ${appPath}`,
        post: `cd ${originalDir}`,
      }

      // #region Assert Generated Checks Pass Without Changing Files
      try {
        const check = await spawnAndLog("bun run check", {
          ...runOpts,
          outputFileName: "ignite-new-checks-bun.txt",
        })
        if (check.exitCode !== 0) console.error(check.output)
        expect(check.exitCode).toBe(0)
      } finally {
        expect(await run("git diff --exit-code", runOpts)).toBe("")
      }
      // #endregion

      // #region Assert Generators Work
      // now lets test generators too, since we have a properly spun-up app!
      // components
      const componentGen = await runIgnite(`generate component womp-bomp`, runOpts)
      expect(componentGen).toContain(`app/components/WompBomp.tsx`)
      expect(filesystem.list(`${appPath}/app/components`)).toContain("WompBomp.tsx")
      expect(filesystem.read(`${appPath}/app/components/WompBomp.tsx`)).toContain(
        "export const WompBomp",
      )

      // screens
      const screenGen = await runIgnite(`generate screen bowser-screen`, runOpts)
      expect(screenGen).toContain(`Stripping Screen from end of name`)
      expect(screenGen).toContain(`app/screens/BowserScreen.tsx`)
      expect(filesystem.list(`${appPath}/app/screens`)).toContain("BowserScreen.tsx")
      expect(filesystem.read(`${appPath}/app/screens/BowserScreen.tsx`)).toContain(
        "export const BowserScreen",
      )

      // app-icons
      const iconSearchPath = "assets/images"
      const iconMatchString = "app-icon*.png"

      const allAppIcons = filesystem.find(filesystem.path(appPath, iconSearchPath), {
        directories: false,
        files: true,
        matching: iconMatchString,
      })

      allAppIcons.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
        filesystem.remove(i)
        expect(filesystem.exists(i) === "file").toBe(false)
      })

      const appIconGen = await runIgnite(
        `generate app-icon --skip-source-equality-validation`,
        runOpts,
      )

      expect(appIconGen).toContain(`Generating Expo app icons...`)

      allAppIcons.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
      })

      const inputFiles = filesystem.find(`${appPath}/ignite/templates/app-icon`, {
        directories: false,
        files: true,
        matching: "*.png",
      })

      inputFiles.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
        filesystem.remove(i)
        expect(filesystem.exists(i) === "file").toBe(false)
      })

      await runIgnite(`generate --update`, runOpts)

      inputFiles.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
      })

      // splash-screen
      const splashSearchPath = "assets/images"
      const splashMatchString = "splash-logo*.png"

      const splashScreenAssets = filesystem.find(filesystem.path(appPath, splashSearchPath), {
        directories: false,
        files: true,
        matching: splashMatchString,
      })

      splashScreenAssets.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
        filesystem.remove(i)
        expect(filesystem.exists(i) === "file").toBe(false)
      })

      function verifySplashScreenColor(type: "android" | "ios" | "expo", matchString: string) {
        const splashScreenColorStrings = {
          android: filesystem.read(
            filesystem.path(appPath, "android/app/src/main/res/values/colors.xml"),
          ),
          ios: filesystem.read(filesystem.path(appPath, "ios/Foo/BootSplash.storyboard")),
          expo: filesystem.read(filesystem.path(appPath, "app.json")),
        }

        const colorContent = splashScreenColorStrings[type]

        if (!colorContent) return

        expect(colorContent).toContain(matchString)
      }

      verifySplashScreenColor("android", `#191015`)
      verifySplashScreenColor("expo", `#191015`)
      verifySplashScreenColor(
        "ios",
        `red="0.0980392156862745" green="0.0627450980392157" blue="0.0823529411764706"`,
      )

      const splashScreenGen = await runIgnite(
        `generate splash-screen 000000  --skip-source-equality-validation`,
        runOpts,
      )

      expect(splashScreenGen).toContain(`Generating Expo splash screens`)

      splashScreenAssets.forEach((i) => {
        expect(filesystem.exists(i) === "file").toBe(true)
      })

      verifySplashScreenColor("expo", `#000000`)

      const inputFile = filesystem.path(appPath, "ignite/templates/splash-screen/logo.png")
      expect(filesystem.exists(inputFile) === "file").toBe(true)
      filesystem.remove(inputFile)
      expect(filesystem.exists(inputFile) === "file").toBe(false)
      await runIgnite(`generate --update`, runOpts)
      expect(filesystem.exists(inputFile) === "file").toBe(true)
      // #endregion

      // #region Assert Changes Can Be Commit To Git
      // commit the change
      await run(`git add ./app/context ./app/components ./app.json ./assets/images`, runOpts)
      await run(`git commit -m "generated test components & assets"`, runOpts)
      // #endregion

      // #region Assert package.json Scripts Can Be Run
      // run the tests; if they fail, run will raise and this test will fail
      await run(`bun run test`, runOpts)
      await run(`bun run lint`, runOpts)
      await run(`bun run compile`, runOpts)
      await run(`bun run deps:check`, runOpts)
      expect(await run("git diff HEAD --no-ext-diff", runOpts)).toContain("+  Bowser: undefined")
      // #endregion

      // we're done!
    })
  })

  // Yarn (only testing what might be affected by a different package manager: dependency installation, running commands)
  describe(`ignite new ${APP_NAME} --debug --packager=yarn --yes`, () => {
    let tempDir: string
    let result: string
    let appPath: string
    beforeAll(async () => {
      tempDir = tempy.directory({ prefix: "ignite-" })

      result = await spawnIgniteAndPrintIfFail(
        `new ${APP_NAME} --debug --packager=yarn --workflow=cng --yes`,
        {
          pre: `cd ${tempDir}`,
          post: `cd ${originalDir}`,
          outputFileName: "ignite-new-output-yarn.txt",
        },
      )

      appPath = filesystem.path(tempDir, APP_NAME)
    })

    afterAll(() => {
      // console.log(tempDir) // uncomment for debugging, then run `code <tempDir>` to see the generated app
      filesystem.remove(tempDir) // clean up our mess
    })

    it("should print success message", () => {
      // at some point this should probably be a snapshot?
      expect(result).toContain("Now get cooking! 🍽")
    })

    it("reports lint problems without editing and exposes explicit fixes with Yarn", async () => {
      const fixturePath = filesystem.path(appPath, "src/task2LintFixture.ts")
      const unformatted = "export const task2LintFixture='fixture';\n"
      filesystem.write(fixturePath, unformatted)
      try {
        const lint = await spawnAndLog("yarn lint", {
          pre: `cd ${appPath}`,
          outputFileName: "ignite-new-checks-lint.txt",
        })
        expect(filesystem.read(fixturePath)).toBe(unformatted)
        expect(lint.exitCode).toBe(1)
        const fix = await spawnAndLog("yarn lint:fix", {
          pre: `cd ${appPath}`,
          outputFileName: "ignite-new-checks-lint-fix.txt",
        })
        if (fix.exitCode !== 0) throw new Error(fix.output)
        expect(filesystem.read(fixturePath)).toBe('export const task2LintFixture = "fixture"\n')
      } finally {
        filesystem.remove(fixturePath)
      }
    })

    it("should pass nonmutating check with Yarn after initial generation formatting", async () => {
      // other common test operations
      const runOpts = {
        pre: `cd ${appPath}`,
        post: `cd ${originalDir}`,
      }

      // #region Assert package.json Scripts Can Be Run
      // run the tests; if they fail, run will raise and this test will fail
      const check = await spawnAndLog("yarn check", {
        ...runOpts,
        outputFileName: "ignite-new-checks-yarn.txt",
      })
      if (check.exitCode !== 0) throw new Error(check.output)
      expect(await run("git diff --exit-code", runOpts)).toBe("")
    })
    // #endregion

    // we're done!
  })
})

async function checkForLeftoverHelloWorld(filePath: string) {
  const ignoreFolders = [
    "/xcuserdata",
    "bun.lock",
    ".git",
    "node_modules",
    "Pods",
    "/build",
    ".expo",
    ".yarn",
  ]
  // ignore some folders
  if (!ignoreFolders.every((f) => !filePath.includes(f))) return

  if (!filesystem.isDirectory(filePath)) {
    // we append the filePath to the end of the message to make it easier to
    // find the file in the console output
    const contents = filesystem.read(filePath) + ` (Filename: ${filePath})`
    expect(contents).not.toContain("helloworld")
    expect(contents).not.toContain("HelloWorld")
    expect(contents).not.toContain("hello-world")

    // it's a file, so eject
    return
  }

  // check to make sure there are no instances of helloworld or HelloWorld or hello-world
  // anywhere in the app -- including folder and filenames.
  const appFiles = filesystem.list(filePath) ?? []

  for (const file of appFiles) {
    expect(file).not.toContain("helloworld")
    expect(file).not.toContain("HelloWorld")
    expect(file).not.toContain("hello-world")
    await checkForLeftoverHelloWorld(`${filePath}/${file}`)
  }
}
