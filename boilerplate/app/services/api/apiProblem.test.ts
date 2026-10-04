import { AxiosError, CanceledError } from "axios"

import { getGeneralApiProblem } from "./apiProblem"

test.each([
  ["ERR_NETWORK", { kind: "cannot-connect", temporary: true }],
  ["ECONNREFUSED", { kind: "cannot-connect", temporary: true }],
  ["ECONNABORTED", { kind: "timeout", temporary: true }],
  ["ETIMEDOUT", { kind: "timeout", temporary: true }],
  ["ERR_BAD_RESPONSE", { kind: "unknown", temporary: true }],
])("classifies Axios error code %s", (code, problem) => {
  expect(getGeneralApiProblem(new AxiosError("Request failed", code))).toEqual(problem)
})

test.each([
  [401, { kind: "unauthorized" }],
  [403, { kind: "forbidden" }],
  [404, { kind: "not-found" }],
  [418, { kind: "rejected" }],
  [429, { kind: "rejected" }],
  [500, { kind: "server" }],
  [503, { kind: "server" }],
])("classifies HTTP %s", (status, problem) => {
  const error = new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: {} } as never,
    data: null,
  })
  expect(getGeneralApiProblem(error)).toEqual(problem)
})

test("ignores Axios cancellation", () => {
  expect(getGeneralApiProblem(new CanceledError())).toBeNull()
})

test("ignores standard AbortSignal cancellation", () => {
  const error = new Error("Aborted")
  error.name = "AbortError"
  expect(getGeneralApiProblem(error)).toBeNull()
})

test.each([new Error("Unexpected"), null, undefined, "failure", { message: "Unknown" }])(
  "accepts unknown errors %j",
  (error) => {
    expect(getGeneralApiProblem(error)).toEqual({ kind: "unknown", temporary: true })
  },
)

test("classifies malformed response data", () => {
  expect(getGeneralApiProblem(new TypeError("Expected an episodes array"))).toEqual({
    kind: "bad-data",
  })
})
