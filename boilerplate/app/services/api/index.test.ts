import { AxiosError, CanceledError } from "axios"
import type { AxiosAdapter } from "axios"

import type { EpisodeItem } from "./types"

import { Api } from "./index"

const episode: EpisodeItem = {
  title: "RNR 400 - Networking",
  pubDate: "2026-10-03",
  link: "https://example.com/episode",
  guid: "episode-400",
  author: "React Native Radio",
  thumbnail: "https://example.com/thumbnail.png",
  description: "An episode about networking",
  content: "Episode content",
  enclosure: {
    link: "https://example.com/audio.mp3",
    type: "audio/mpeg",
    length: 100,
    duration: 60,
    rating: { scheme: "urn:simple", value: "clean" },
  },
  categories: ["Technology"],
}

function withAdapter(adapter: AxiosAdapter, config?: { url: string; timeout: number }) {
  const api = new Api(config)
  expect(api.client).toBeDefined()
  api.client.defaults.adapter = adapter
  return api
}

test("requests episodes with the existing base URL, JSON Accept header, and timeout", async () => {
  const api = withAdapter(async (config) => {
    expect(config.baseURL).toBe("https://api.rss2json.com/v1/")
    expect(config.timeout).toBe(10000)
    expect(config.headers.get("Accept")).toBe("application/json")
    expect(config.url).toBe("api.json?rss_url=https%3A%2F%2Ffeeds.simplecast.com%2FhEI_f9Dx")
    return { config, status: 200, statusText: "OK", headers: {}, data: { items: [episode] } }
  })
  await expect(api.getEpisodes()).resolves.toEqual([episode])
})

test("uses the supplied API URL and timeout for requests", async () => {
  const api = withAdapter(
    async (config) => {
      expect(config.baseURL).toBe("https://example.com/v2/")
      expect(config.timeout).toBe(250)
      return { config, status: 200, statusText: "OK", headers: {}, data: { items: [] } }
    },
    { url: "https://example.com/v2/", timeout: 250 },
  )
  await expect(api.getEpisodes()).resolves.toEqual([])
})

test("forwards the caller's cancellation signal", async () => {
  const controller = new AbortController()
  const api = withAdapter(async (config) => {
    expect(config.signal).toBe(controller.signal)
    return { config, status: 200, statusText: "OK", headers: {}, data: { items: [] } }
  })
  await expect(api.getEpisodes(controller.signal)).resolves.toEqual([])
})

test.each([
  [
    "unauthorized",
    new AxiosError("Unauthorized", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config: { headers: {} } as never,
      data: null,
    } as never),
  ],
  [
    "server",
    new AxiosError("Server error", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 500,
      statusText: "Server error",
      headers: {},
      config: { headers: {} } as never,
      data: null,
    } as never),
  ],
  ["network", new AxiosError("Network Error", "ERR_NETWORK")],
  ["timeout", new AxiosError("Timed out", "ECONNABORTED")],
])(
  "rejects %s failures without converting them into successful data or retrying",
  async (_kind, error) => {
    let attempts = 0
    const api = withAdapter(async () => {
      attempts++
      throw error
    })
    await expect(api.getEpisodes()).rejects.toBe(error)
    expect(attempts).toBe(1)
  },
)

test.each([undefined, null, {}, { items: null }, { items: {} }, { items: "bad data" }])(
  "rejects malformed episode responses %j",
  async (data) => {
    const api = withAdapter(async (config) => ({
      config,
      status: 200,
      statusText: "OK",
      headers: {},
      data,
    }))
    await expect(api.getEpisodes()).rejects.toBeInstanceOf(Error)
  },
)

test("rejects already cancelled requests before sending them", async () => {
  const controller = new AbortController()
  controller.abort()
  let attempts = 0
  const api = withAdapter(async (config) => {
    attempts++
    return { config, status: 200, statusText: "OK", headers: {}, data: { items: [] } }
  })
  await expect(api.getEpisodes(controller.signal)).rejects.toBeInstanceOf(CanceledError)
  expect(attempts).toBe(0)
})

test("rejects when cancellation arrives during a request", async () => {
  const controller = new AbortController()
  let finish!: () => void
  const api = withAdapter(
    (config) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({ config, status: 200, statusText: "OK", headers: {}, data: { items: [] } })
      }),
  )
  const request = api.getEpisodes(controller.signal)
  controller.abort()
  finish()
  await expect(request).rejects.toBeInstanceOf(CanceledError)
})

// @demo remove-file
