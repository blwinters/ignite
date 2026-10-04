import { AppState, Platform } from "react-native"
import * as Network from "expo-network"
import { focusManager, onlineManager } from "@tanstack/react-query"

/** Web keeps TanStack's browser listeners; native bindings belong to the root provider. */
export function bindNativeQueryLifecycle(): () => void {
  if (Platform.OS === "web") return () => undefined

  let mounted = true
  let networkEventReceived = false
  const updateOnline = (state: Network.NetworkState) => {
    if (!mounted) return
    if (state.isConnected === false || state.isInternetReachable === false) {
      onlineManager.setOnline(false)
    } else if (state.isConnected === true && state.isInternetReachable === true) {
      onlineManager.setOnline(true)
    }
  }

  if (AppState.currentState != null) focusManager.setFocused(AppState.currentState === "active")
  const appSubscription = AppState.addEventListener("change", (state) => {
    if (mounted) focusManager.setFocused(state === "active")
  })
  const networkSubscription = Network.addNetworkStateListener((state) => {
    networkEventReceived = true
    updateOnline(state)
  })
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (!networkEventReceived) updateOnline(state)
    })
    .catch(() => {
      // A failed/unknown initial read cannot establish that the device is offline.
    })

  return () => {
    mounted = false
    appSubscription.remove()
    networkSubscription.remove()
  }
}
