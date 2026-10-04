import { onlineManager } from "@tanstack/react-query"
import { AxiosError, AxiosHeaders, CanceledError } from "axios"

import { createQueryClient } from "./client"

function httpError(status: number) {
  return new AxiosError("HTTP error", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "HTTP error",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message: "Failed request" },
  })
}

describe("Query defaults", () => {
  let client: ReturnType<typeof createQueryClient>
  beforeEach(() => {
    client = createQueryClient()
    onlineManager.setOnline(true)
    jest.useFakeTimers()
  })
  afterEach(() => {
    client.clear()
    jest.useRealTimers()
  })

  it("reuses fresh data for one minute, then refetches stale or invalidated data", async () => {
    let requests = 0
    const query = { queryKey: ["episodes"], queryFn: async () => ++requests }
    expect(await client.fetchQuery(query)).toBe(1)
    jest.advanceTimersByTime(59_999)
    expect(await client.fetchQuery(query)).toBe(1)
    jest.advanceTimersByTime(1)
    expect(await client.fetchQuery(query)).toBe(2)
    await client.invalidateQueries({ queryKey: ["episodes"] })
    expect(await client.fetchQuery(query)).toBe(3)
  })

  it("collects inactive cache entries after five minutes", async () => {
    await client.fetchQuery({ queryKey: ["unused"], queryFn: async () => "data" })
    jest.advanceTimersByTime(299_999)
    expect(client.getQueryData(["unused"])).toBe("data")
    jest.advanceTimersByTime(1)
    expect(client.getQueryData(["unused"])).toBeUndefined()
  })

  it.each([
    ["network", new AxiosError("Network Error", "ERR_NETWORK"), 3],
    ["timeout", new AxiosError("timeout", "ECONNABORTED"), 3],
    ["timeout code", new AxiosError("timeout", "ETIMEDOUT"), 3],
    ["500", httpError(500), 3],
    ["503", httpError(503), 3],
    ["400", httpError(400), 1],
    ["401", httpError(401), 1],
    ["429", httpError(429), 1],
    ["cancelled", new CanceledError("cancelled"), 1],
    ["unclassified Axios", new AxiosError("bad config", "ERR_BAD_OPTION"), 1],
    ["unclassified", new Error("unknown"), 1],
    ["unknown value", "network", 1],
  ])("attempts %s failures the allowed number of times", async (_label, error, expected) => {
    let attempts = 0
    const result = client.fetchQuery({
      queryKey: ["retry"],
      queryFn: async () => {
        attempts++
        throw error
      },
      retryDelay: 0,
    })
    const rejected = expect(result).rejects.toBe(error)
    await jest.runAllTimersAsync()
    await rejected
    expect(attempts).toBe(expected)
  })

  it("does not retry mutations automatically", async () => {
    let attempts = 0
    const error = new AxiosError("Network Error", "ERR_NETWORK")
    const mutation = client.getMutationCache().build(client, {
      mutationFn: async () => {
        attempts++
        throw error
      },
    })
    await expect(mutation.execute(undefined)).rejects.toBe(error)
    expect(attempts).toBe(1)
  })

  it("allows callers to override the global retry policy", async () => {
    let attempts = 0
    const result = client.fetchQuery({
      queryKey: ["custom"],
      retry: 1,
      retryDelay: 0,
      queryFn: async () => {
        attempts++
        throw new Error("custom")
      },
    })
    const rejected = expect(result).rejects.toThrow("custom")
    await jest.runAllTimersAsync()
    await rejected
    expect(attempts).toBe(2)
  })
})
