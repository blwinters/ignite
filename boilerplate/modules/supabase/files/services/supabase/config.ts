export type SupabasePublicEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
}

export function loadSupabaseConfig(
  env: SupabasePublicEnv = {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
): { url: string; publishableKey: string } {
  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? ""
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  try {
    if (!url || url !== url.trim()) throw new Error()
    const parsed = new URL(url)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    if (
      (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error()
  } catch {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL to a valid HTTPS URL (HTTP is allowed for localhost).",
    )
  }
  if (!publishableKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to a valid publishable key.")
  }
  return { url, publishableKey }
}
