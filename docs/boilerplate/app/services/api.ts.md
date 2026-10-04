# api.ts

This is the API service. It is a singleton class and contains the code for making API calls to your backend. You can use it like this:

```typescript
import { api } from "@/services/api"

try {
  const episodes = await api.getEpisodes()
  // Use the returned episodes array.
} catch (error) {
  console.error("Error fetching episodes:", error)
}
```

The demo-only `getEpisodes` method is removed when generating a demo-free app. You can add methods to this class to call your own endpoints. Its `client` is an Axios instance configured with your API URL, a 10,000 ms timeout, and a JSON Accept header.

API methods return data or throw on HTTP, network, timeout, malformed-data, or cancellation failures. An optional `getGeneralApiProblem(error: unknown)` helper maps caught errors to display categories; it returns `null` for cancellation. Classification does not turn a failed request into successful data.

Pass an optional signal when a caller needs cancellation:

```typescript
const controller = new AbortController()
const request = api.getEpisodes(controller.signal)
// Later, if the result is no longer needed:
controller.abort()
try {
  await request
} catch (error) {
  // Axios rejects cancelled requests; handle or ignore cancellation here.
}
```

Axios handles HTTP transport. This client adds no retries or cache. A query library can own server-data caching, loading/error state, query retries, refresh, and invalidation while calling the same throwing API methods.

There are lots of other ways to handle API calls, such as using [React Query](https://tanstack.com/query/latest/), [SWR](https://swr.vercel.app/), or [Apollo Client](https://www.apollographql.com/docs/react/) and others. We've used all of these in production apps and they're all really good in different ways. We've chosen to use a simple, custom API client in this boilerplate to keep things flexible.
