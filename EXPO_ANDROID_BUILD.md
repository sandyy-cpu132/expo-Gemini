# Expo Android Build Guide: CloverPal Offline AI

This document provides step-by-step instructions to compile the CloverPal Offline AI client into a standalone, installable Android APK via EAS Build or local native build tools.

---

## 1. Prerequisites

- **Node.js**: v20 LTS or v22 LTS
- **Package Manager**: `npm`
- **EAS CLI**: Install globally with:
  ```bash
  npm install -g eas-cli
  ```
- **Expo Account**: Free account at [expo.dev](https://expo.dev)

> **Why Expo Go Cannot Be Used:** Standard Expo Go is a sandboxed client that lacks custom native modules. CloverPal uses `modules/termux-integration` (Kotlin native module) and custom manifest entries (`com.termux.permission.RUN_COMMAND` and loopback network security configs), which require a development build or standalone APK built via EAS.

---

## 2. Expo Account Setup

Before initiating a build:

```bash
# 1. Log in to your Expo account
eas login

# 2. Check login status
eas whoami
```

---

## 3. Verify Native Config Plugin Locally

Before submitting to the cloud build worker, test that the config plugin generates the Android manifest and network security configuration properly:

```bash
# Clean prebuild dry-run
npx expo prebuild --platform android --clean
```

Verify that the output reports `✔ Finished prebuild`.

*(Note: The generated `android/` folder is ignored by git and can be deleted after verification with `rm -rf android`, as EAS runs prebuild automatically during cloud builds).*

---

## 4. Building the Installable Standalone APK via EAS

The project includes a pre-configured `eas.json` with an Android `preview` profile set to generate an installable `.apk` file:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

Run the build command:

```bash
eas build --platform android --profile preview
```

### Build Process Steps:
1. EAS CLI archives the project code (excluding `node_modules` and local artifacts).
2. The remote EAS builder runs `npx expo prebuild` using `app.json` and `./plugins/withTermuxManifest.js`.
3. Gradle compiles the native Kotlin module and links `expo-sqlite`, `react-native-screens`, and `expo-file-system`.
4. EAS generates an installable `.apk` file and provides a download URL and QR code in the terminal.

---

## 5. Sideloading the APK onto an Android Phone

Once the build finishes:

### Option A: Direct Download via Mobile Browser
Scan the QR code printed by EAS or open the build URL directly on your Android phone to download `cloverpal-offline-ai.apk`.

### Option B: Sideload via ADB (Android Debug Bridge)
Connect your phone via USB with USB Debugging enabled:

```bash
adb install -r cloverpal-offline-ai.apk
```

---

## 6. Local Development Build (`npx expo run:android`)

If you have Android Studio and the Android SDK installed locally (JDK 17, Android SDK Build Tools 34):

```bash
# Run local prebuild and compile release or debug variant
npx expo run:android

# Start the Expo Dev Client server
npx expo start --dev-client
```

---

## 7. Build Checklist Summary

- [x] `app.json` has `com.cloverpal.offlineai` package identifier.
- [x] `plugins/withTermuxManifest.js` configures `<queries>` for `com.termux`.
- [x] Cleartext traffic is locked to `127.0.0.1` and `localhost` in `network_security_config.xml`.
- [x] Zero cloud API dependencies or remote asset URLs.
- [x] Full TypeScript compilation passed (`npx tsc --noEmit`).
