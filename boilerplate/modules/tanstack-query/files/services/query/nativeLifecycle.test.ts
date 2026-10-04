import { AppState, AppStateStatus, Platform } from "react-native"
import * as Network from "expo-network"
import { focusManager, onlineManager } from "@tanstack/react-query"

import { bindNativeQueryLifecycle } from "./nativeLifecycle"

describe("native Query lifecycle", () => {
  const originalOS = Platform.OS
  const originalState = AppState.currentState
  let appChange: (state: AppStateStatus) => void
  let networkChange: (state: Network.NetworkState) => void
  let resolveInitial: (state: Network.NetworkState) => void
  let rejectInitial: (error: Error) => void
  let appListeners: Set<unknown>
  let networkListeners: Set<unknown>
  let cleanup: (() => void) | undefined
  const connected = { isConnected: true, isInternetReachable: true }
  const disconnected = { isConnected: false, isInternetReachable: false }
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" })
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "background" })
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    appListeners = new Set()
    networkListeners = new Set()
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appChange = listener
      appListeners.add(listener)
      return { remove: () => appListeners.delete(listener) }
    })
    jest.spyOn(Network, "addNetworkStateListener").mockImplementation((listener) => {
      networkChange = listener
      networkListeners.add(listener)
      return { remove: () => networkListeners.delete(listener) }
    })
    jest.spyOn(Network, "getNetworkStateAsync").mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          resolveInitial = resolve
          rejectInitial = reject
        }),
    )
  })
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    jest.restoreAllMocks()
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS })
    Object.defineProperty(AppState, "currentState", { configurable: true, value: originalState })
    focusManager.setFocused(undefined)
    onlineManager.setOnline(true)
  })

  it("initializes focus and follows foreground/background events", () => {
    cleanup = bindNativeQueryLifecycle()
    expect(focusManager.isFocused()).toBe(false)
    appChange("active")
    expect(focusManager.isFocused()).toBe(true)
    appChange("inactive")
    expect(focusManager.isFocused()).toBe(false)
  })

  it("leaves unknown initial focus unchanged until an AppState event", () => {
    Object.defineProperty(AppState, "currentState", { configurable: true, value: null })
    cleanup = bindNativeQueryLifecycle()
    expect(focusManager.isFocused()).toBe(true)
  })

  it("initializes connectivity and follows disconnect/reconnect events", async () => {
    cleanup = bindNativeQueryLifecycle()
    resolveInitial(disconnected)
    await Promise.resolve()
    expect(onlineManager.isOnline()).toBe(false)
    networkChange(connected)
    expect(onlineManager.isOnline()).toBe(true)
    networkChange({ isConnected: true, isInternetReachable: false })
    expect(onlineManager.isOnline()).toBe(false)
  })

  it("does not let a late initial read overwrite a newer network event", async () => {
    cleanup = bindNativeQueryLifecycle()
    networkChange(connected)
    resolveInitial(disconnected)
    await Promise.resolve()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it("keeps online status when network reachability is unknown or the initial read fails", async () => {
    cleanup = bindNativeQueryLifecycle()
    networkChange({ isConnected: undefined, isInternetReachable: undefined })
    expect(onlineManager.isOnline()).toBe(true)
    networkChange({ isConnected: true, isInternetReachable: undefined })
    expect(onlineManager.isOnline()).toBe(true)
    rejectInitial(new Error("Unavailable network state"))
    await Promise.resolve()
    await Promise.resolve()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it("removes both listeners and ignores late reads or queued events after cleanup", async () => {
    cleanup = bindNativeQueryLifecycle()
    appChange("active")
    cleanup()
    expect(appListeners.size).toBe(0)
    expect(networkListeners.size).toBe(0)
    appChange("background")
    networkChange(disconnected)
    resolveInitial(disconnected)
    await Promise.resolve()
    expect(focusManager.isFocused()).toBe(true)
    expect(onlineManager.isOnline()).toBe(true)
  })

  it("delegates web focus and connectivity to TanStack's browser behavior", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" })
    focusManager.setFocused(false)
    onlineManager.setOnline(false)
    cleanup = bindNativeQueryLifecycle()
    expect(appListeners.size).toBe(0)
    expect(networkListeners.size).toBe(0)
    expect(focusManager.isFocused()).toBe(false)
    expect(onlineManager.isOnline()).toBe(false)
    expect(Network.getNetworkStateAsync).not.toHaveBeenCalled()
  })
})
