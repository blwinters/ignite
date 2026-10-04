import { QueryClient } from "@tanstack/react-query"
import { isAxiosError, isCancel } from "axios"

/** Retry transient transport failures at most twice. Query functions must throw errors. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2 || isCancel(error) || !isAxiosError(error)) return false
  if (error.code === "ERR_CANCELED") return false
  if (error.response) return error.response.status >= 500 && error.response.status < 600
  return ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "")
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 300_000, retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  })
}
