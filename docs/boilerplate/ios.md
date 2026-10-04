---
title: ios
sidebar_position: 30
---

# `ios` folder

If you choose the `manual` workflow option when spinning up a new app (or you run `pnpm run prebuild:clean`) you'll get an `ios` (and probably [`android`](./android.md)) folder in your project root. This folder contains your native iOS / Xcode project, which has been pre-configured to work with React Native.

We generally recommend using the [Expo CNG (continuous native generation)](../expo/CNG.md) workflow, but if you need to customize your native code manually, you can do so here.

Just like any React Native project, you can open this folder in Xcode and run your app on a simulator or device. Learn more here: [https://reactnative.dev/docs/native-debugging#debugging-native-code](https://reactnative.dev/docs/native-debugging#debugging-native-code)

## Deployment minimum

New apps use stable Expo SDK 57 (`expo@57.0.26`, React Native `0.86.3`) and default to iOS 16.4, the SDK minimum. The existing `expo-build-properties` plugin sets the app deployment target, and `plugins/withIosDeploymentFloor.ts` raises pod and resource-bundle deployment targets below that floor after React Native's post-install setup. Higher targets required by dependencies are preserved. The marked Podfile block is updated rather than duplicated on repeated prebuilds; a changed or missing React Native anchor fails clearly.

Keep the `ios.deploymentTarget` option for `expo-build-properties` and the `deploymentTarget` option for `./plugins/withIosDeploymentFloor` in `app.json` equal when changing the minimum. Apply lasting native changes through Expo configuration or config plugins. Regenerate an existing project without deleting its native caches, then install pods:

```sh
APP_VARIANT=development pnpm exec expo prebuild --platform ios --no-install
(cd ios && pod install)
```

Use your generated app's package manager in place of `pnpm` if different. Build without an `IPHONEOS_DEPLOYMENT_TARGET` command-line override to verify the persisted floor.

## iOS 27 scene support

SDK 57 keeps the application lifecycle by default. Apps built with Xcode 27 need scenes to launch on iOS 27, so the starter enables `ios.enableSceneSupport: true` in `expo-build-properties`. Expo must be at least `57.0.23`; the pinned `57.0.26` and build-properties `~57.0.22` provide the supported opt-in. Both navigation choices retain Android and web support. See Expo's [scene lifecycle guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).

For the first native regeneration after upgrading from an older SDK, inspect `ios/` for handwritten changes and preserve the complete native tree and local `.expo/` caches in an explicit backup outside the project. Moving them into a uniquely named backup on the same volume preserves build caches without duplicating them. Keep that backup until the replacement is verified, then generate a fresh template:

```sh
APP_VARIANT=development pnpm exec expo prebuild --clean --platform ios --no-install
(cd ios && pod install)
```

The SDK 57 plugin makes `AppDelegate` conform to `ExpoReactNativeFactoryProvider`, removes its legacy React Native startup block, and adds a scene manifest using Expo's built-in `EXExpoAppSceneDelegate`. It does not generate `SceneDelegate.swift` on SDK 57. Do not patch generated Swift or installed dependencies to bypass this plugin. A manually maintained AppDelegate or existing scene manifest may require the guide's manual migration; the plugin refuses incompatible templates.

Verify launch on iOS 27 without a deployment-target override, route-file edits with the aligned SDK 57 CLI/Router watcher, cold and warm URL delivery, and foreground/background transitions. Static checks do not establish native lifecycle behavior. SDK-managed packages follow the published Expo compatibility map; the matching React Native Jest preset and Metro configuration packages are required peers for Jest and Worklets. Use Node 24 (24.3.0 or newer within that major), selected by `nvm install` and `nvm use` in the generated project, and enable Corepack for its pinned package manager.

Router apps use `expo-router/react-navigation` for navigation themes and hooks, following the [SDK 56+ import migration](https://docs.expo.dev/router/migrate/sdk-55-to-56/). The generator converts those imports only for the Router choice; React Navigation apps keep the external packages. TypeScript `~6.0.3` requires explicit Jest/Node globals and relative aliases without deprecated `baseUrl`. `react-i18next@17.0.15` with `i18next@26.4.2` accepts the compiler version, resolving the npm peer conflict from the previous i18n packages. The starter includes a test of real locale initialization and Spanish/English switching.

## Device Hub and localhost fallback

On Xcode 27 hosts that use Device Hub, an Expo CLI error locating `Simulator.app` does not by itself mean Xcode is incomplete. Open Device Hub, boot a simulator with a runtime at or above the app's minimum, and find its identifier with `xcrun simctl list devices`. You can build and install independently of Expo's simulator-app lookup:

```sh
xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp \
  -configuration Debug -sdk iphonesimulator -destination 'id=<simulator-udid>' \
  -derivedDataPath ios/build
xcrun simctl install <simulator-udid> ios/build/Build/Products/Debug-iphonesimulator/YourApp.app
xcrun simctl launch <simulator-udid> your.development.bundle.identifier
```

Replace the workspace, scheme, app name, bundle identifier, and simulator identifier with those generated for your selected variant. Start Metro separately and open its development server in the installed client. If localhost resolves to IPv6 while the native client uses IPv4, use:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first APP_VARIANT=development pnpm exec expo start --dev-client --localhost
```

These are host workarounds; this plugin does not fix Expo's simulator lookup or DNS behavior. Confirm build/install/launch on a compatible runtime in addition to static checks. Physical-device signing and distribution remain separate setup steps.
