import axios from "axios"

export type GeneralApiProblem =
  /**
   * Times up.
   */
  | { kind: "timeout"; temporary: true }
  /**
   * Cannot connect to the server for some reason.
   */
  | { kind: "cannot-connect"; temporary: true }
  /**
   * The server experienced a problem. Any 5xx error.
   */
  | { kind: "server" }
  /**
   * We're not allowed because we haven't identified ourself. This is 401.
   */
  | { kind: "unauthorized" }
  /**
   * We don't have access to perform that request. This is 403.
   */
  | { kind: "forbidden" }
  /**
   * Unable to find that resource.  This is a 404.
   */
  | { kind: "not-found" }
  /**
   * All other 4xx series errors.
   */
  | { kind: "rejected" }
  /**
   * Something truly unexpected happened. Most likely can try again. This is a catch all.
   */
  | { kind: "unknown"; temporary: true }
  /**
   * The data we received is not in the expected format.
   */
  | { kind: "bad-data" }

/**
 * Optionally classifies rejected requests for display. API methods still throw errors.
 *
 * Cancellation is not a user-facing failure.
 */
export function getGeneralApiProblem(error: unknown): GeneralApiProblem | null {
  if (axios.isCancel(error) || (error instanceof Error && error.name === "AbortError")) {
    return null
  }

  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return { kind: "timeout", temporary: true }
    }

    const status = error.response?.status
    if (status !== undefined && status >= 500 && status < 600) {
      return { kind: "server" }
    }
    if (status !== undefined && status >= 400 && status < 500) {
      switch (status) {
        case 401:
          return { kind: "unauthorized" }
        case 403:
          return { kind: "forbidden" }
        case 404:
          return { kind: "not-found" }
        default:
          return { kind: "rejected" }
      }
    }

    if (
      error.code === "ERR_NETWORK" ||
      error.code === "ECONNREFUSED" ||
      error.code === "ECONNRESET" ||
      error.code === "ENOTFOUND" ||
      (!error.response && error.request)
    ) {
      return { kind: "cannot-connect", temporary: true }
    }
  } else if (error instanceof TypeError) {
    return { kind: "bad-data" }
  }

  return { kind: "unknown", temporary: true }
}
