/**
 * This Api class lets you define an API endpoint and methods to request
 * data and process it.
 *
 * See the [Backend API Integration](https://docs.infinite.red/ignite-cli/boilerplate/app/services/#backend-api-integration)
 * documentation for more details.
 */
import axios from "axios"
import type { AxiosInstance } from "axios"

import Config from "@/config"
import type { EpisodeItem } from "@/services/api/types" // @demo remove-current-line

import type {
  ApiConfig,
  ApiFeedResponse, // @demo remove-current-line
} from "./types"

/**
 * Shared Axios request configuration. Retries and caching belong to callers.
 */
export const DEFAULT_API_CONFIG: ApiConfig = {
  url: Config.API_URL,
  timeout: 10000,
}

/**
 * Manages all requests to the API. You can use this class to build out
 * various requests that you need to call from your backend API.
 */
export class Api {
  client: AxiosInstance
  config: ApiConfig

  /**
   * Set up our API instance. Keep this lightweight!
   */
  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    this.config = config
    this.client = axios.create({
      baseURL: this.config.url,
      timeout: this.config.timeout,
      headers: {
        Accept: "application/json",
      },
    })
  }

  // @demo remove-block-start
  /**
   * Gets a list of recent React Native Radio episodes.
   */
  async getEpisodes(signal?: AbortSignal): Promise<EpisodeItem[]> {
    const response = await this.client.get<ApiFeedResponse>(
      `api.json?rss_url=https%3A%2F%2Ffeeds.simplecast.com%2FhEI_f9Dx`,
      { signal },
    )

    if (!Array.isArray(response.data?.items)) {
      throw new TypeError("Expected an episodes array in the API response")
    }

    // Transform response data here when your application's model differs from the API.
    return response.data.items.map((raw) => ({ ...raw }))
  }
  // @demo remove-block-end
}

// Singleton instance of the API for convenience
export const api = new Api()
