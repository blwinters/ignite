import "react-native-url-polyfill/auto"
import { createClient } from "@supabase/supabase-js"

import { loadSupabaseConfig } from "./config"

const { url, publishableKey } = loadSupabaseConfig()

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
