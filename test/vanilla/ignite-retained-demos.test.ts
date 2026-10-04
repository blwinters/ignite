import { filesystem } from "gluegun"
import * as tempy from "tempy"

import { spawnAndLog, spawnIgniteAndPrintIfFail, YARN_FIXTURE_INSTALL } from "../_test-helpers"

describe("generated retained React Navigation demos", () => {
  let tempDir: string
  let appPath: string

  beforeAll(async () => {
    tempDir = tempy.directory({ prefix: "ignite-retained-demo-" })
    await spawnIgniteAndPrintIfFail(
      "new RetainedDemo --yes --navigation=react-navigation --remove-demo=false --install-deps=false --git=false",
      { pre: `cd ${tempDir}`, outputFileName: "ignite-retained-demo-generate.txt" },
    )
    appPath = filesystem.path(tempDir, "RetainedDemo")
    const install = await spawnAndLog(YARN_FIXTURE_INSTALL, {
      pre: `cd ${appPath}`,
      outputFileName: "ignite-retained-demo-install.txt",
    })
    if (install.exitCode !== 0) console.error(install.output)
    expect(install.exitCode).toBe(0)
  })

  afterAll(() => filesystem.remove(tempDir))

  it.each([
    ["lint", "yarn lint:fix && yarn lint"],
    ["behavior", "yarn test --runInBand --watchman=false app/screens/DemoScreens.test.tsx"],
    ["typecheck", "yarn typecheck"],
  ])("passes the real generated %s check", async (name, command) => {
    const result = await spawnAndLog(command, {
      pre: `cd ${appPath}`,
      outputFileName: `ignite-retained-demo-${name}.txt`,
    })
    if (result.exitCode !== 0) console.error(result.output)
    expect(result.exitCode).toBe(0)
  })
})
