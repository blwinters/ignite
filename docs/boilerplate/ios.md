---
title: ios
sidebar_position: 30
---

# `ios` folder

If you choose the `manual` workflow option when spinning up a new app (or you run `pnpm run prebuild:clean`) you'll get an `ios` (and probably [`android`](./android.md)) folder in your project root. This folder contains your native iOS / Xcode project, which has been pre-configured to work with React Native.

We generally recommend using the [Expo CNG (continuous native generation)](../expo/CNG.md) workflow, but if you need to customize your native code manually, you can do so here.

Just like any React Native project, you can open this folder in Xcode and run your app on a simulator or device. Learn more here: [https://reactnative.dev/docs/native-debugging#debugging-native-code](https://reactnative.dev/docs/native-debugging#debugging-native-code)

## Deployment minimum

New apps default to iOS 16.0. The existing `expo-build-properties` plugin sets the app deployment target, and `plugins/withIosDeploymentFloor.ts` raises pod and resource-bundle deployment targets below that floor after React Native's post-install setup. Higher targets required by dependencies are preserved. The marked Podfile block is updated rather than duplicated on repeated prebuilds; a changed or missing React Native anchor fails clearly.

Keep the `ios.deploymentTarget` option for `expo-build-properties` and the `deploymentTarget` option for `./plugins/withIosDeploymentFloor` in `app.json` equal when changing the minimum. Apply lasting native changes through Expo configuration or config plugins. Regenerate an existing project without deleting its native caches, then install pods:

```sh
APP_VARIANT=development pnpm exec expo prebuild --platform ios --no-install
(cd ios && pod install)
```

Use your generated app's package manager in place of `pnpm` if different. Build without an `IPHONEOS_DEPLOYMENT_TARGET` command-line override to verify the persisted floor.

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
