import { loadSupabaseConfig } from "./config"

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example123",
}

describe("Supabase public configuration", () => {
  it("loads public configuration and supports local development", () => {
    expect(loadSupabaseConfig(valid)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example123",
    })
    expect(
      loadSupabaseConfig({ ...valid, EXPO_PUBLIC_SUPABASE_URL: "http://localhost:54321" }).url,
    ).toBe("http://localhost:54321")
  })

  it.each([
    ["EXPO_PUBLIC_SUPABASE_URL", undefined],
    ["EXPO_PUBLIC_SUPABASE_URL", ""],
    ["EXPO_PUBLIC_SUPABASE_URL", "not-a-url"],
    ["EXPO_PUBLIC_SUPABASE_URL", "http://example.com"],
    ["EXPO_PUBLIC_SUPABASE_URL", "https://user:password@example.com"],
    ["EXPO_PUBLIC_SUPABASE_URL", "https://example.com?token=private"],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_"],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_private"],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "eyJhbGciOiJIUzI1NiJ9.private.payload"],
  ])("rejects invalid public %s without exposing its value", (field, value) => {
    let message = ""
    try {
      loadSupabaseConfig({ ...valid, [field]: value })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(field)
    if (value) expect(message).not.toContain(value)
  })

  it("reads the two statically named Expo public environment variables", () => {
    const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    const previousKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    try {
      process.env.EXPO_PUBLIC_SUPABASE_URL = valid.EXPO_PUBLIC_SUPABASE_URL
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = valid.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      expect(loadSupabaseConfig()).toEqual({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable_example123",
      })
    } finally {
      if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL
      else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl
      if (previousKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey
    }
  })
})
