import { getAppVariant, getVariantConfig } from "./variants"

describe("app variants", () => {
  const originalVariant = process.env.APP_VARIANT

  afterEach(() => {
    if (originalVariant === undefined) delete process.env.APP_VARIANT
    else process.env.APP_VARIANT = originalVariant
  })

  it.each([
    ["development", "development"],
    ["preview", "preview"],
    ["production", "production"],
    [undefined, "production"],
    ["", "production"],
    ["unknown", "production"],
  ])("selects %s as %s", (value, expected) => {
    if (value === undefined) delete process.env.APP_VARIANT
    else process.env.APP_VARIANT = value
    expect(getAppVariant()).toBe(expected)
  })

  it.each([
    ["development", "Sample (Dev)", "org.example.ios.dev", "org.example.android.dev"],
    ["preview", "Sample (Preview)", "org.example.ios.preview", "org.example.android.preview"],
    ["production", "Sample", "org.example.ios", "org.example.android"],
  ])("derives independent platform identifiers for %s", (variant, name, ios, android) => {
    process.env.APP_VARIANT = variant
    expect(getVariantConfig("Sample", "org.example.ios", "org.example.android")).toEqual({
      name,
      ios: { bundleIdentifier: ios },
      android: { package: android },
    })
  })

  it("preserves omitted names and identifiers in partial Expo config", () => {
    expect(getVariantConfig(undefined, undefined, undefined, "development")).toEqual({
      name: undefined,
      ios: { bundleIdentifier: undefined },
      android: { package: undefined },
    })
  })
})
