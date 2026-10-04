import { PropsWithChildren, useEffect, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { createQueryClient } from "./client"
import { bindNativeQueryLifecycle } from "./nativeLifecycle"

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(createQueryClient)
  useEffect(bindNativeQueryLifecycle, [])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
