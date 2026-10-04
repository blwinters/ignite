# Services folder

The `services` folder contains services, such as API clients.

"Services" is a somewhat broad term, but we use it to refer to code that is responsible for a specific task, such as making API calls, interacting with the file system, or handling push notifications and so on.

Ignite's boilerplate only comes with one service, the API client. However, you can add as many services as you like in this folder.

## Backend API Integration

Most apps need to communicate with a backend service of some sort. Some may have a REST API, some a GraphQL API, others might use Firebase/Firestore, Hasura, tRPC, Supabase, AWS/Amplify, or any number of different back end solutions.

Ignite purposely does not make any major decisions about what backend system we expect you to use. As a consultancy, we've integrated apps with all kinds of back ends (ask us about the _Coldfusion_ backend we integrated with a few years ago!), and can't be locked into one solution.

Ignite does come with a basic API setup which we'll describe here. Feel free to rip it out and use your own solution if this doesn't fit.

With that said, we've built large React Native apps using this pattern, and it works pretty well.

## HTTP Client

Ignite includes [Axios](https://axios-http.com/docs/intro) for HTTP requests, with a shared API URL, a 10,000 ms timeout, and an `Accept: application/json` header.

### Axios

The API class exposes its Axios instance as `api.client`. Add API methods that resolve application data or throw on failure. Methods can accept an optional `AbortSignal` and pass it to Axios for cancellation. The transport has no automatic retries or cache; those policies belong to callers or a server-state library.

### The Api class

In `./app/services/api`, you'll find the [Api class](./api.ts.md). This class is the place to add methods to call when you want to fetch data from your backend. Check out the file for examples of fetching data.

### Server-state caching

[TanStack Query](https://tanstack.com/query/) can call these API methods to manage caching, retries, loading state, and invalidation. Keep transport methods independent of cache policy so callers can use them with or without a query library.
