# Expo Android Build Guide: CloverPal Offline AI

This document provides reproducible build instructions for compiling the CloverPal Offline AI client into a release Android APK or Google Play AAB bundle.

---

## 1. System Requirements

- **Node.js**: v20+ or v22 LTS
- **Java Development Kit**: OpenJDK 17
- **Android SDK**: Build tools 34.0.0, API Level 34
- **EAS CLI**: `npm install -g eas-cli`

---

## 2. Local Android Prebuild (Development Build)

To generate the standalone Android native Gradle project:

```bash
# 1. Install dependencies
npm install

# 2. Run Expo Prebuild to generate the android/ folder
npx expo prebuild --platform android --clean

# 3. Compile and launch directly on a connected Android phone or emulator
npx expo run:android --variant release
```

---

## 3. Building Standalone APK with EAS Build

You can generate a standalone `.apk` directly without local Android Studio setup using Expo Application Services (EAS):

```bash
# 1. Login to Expo
eas login

# 2. Configure project if needed
eas build:configure

# 3. Build standalone APK for testing on physical devices
eas build --platform android --profile preview --local
```

Or run via EAS cloud servers:

```bash
eas build --platform android --profile preview
```

---

## 4. Key Gradle & Android Manifest Verifications

- **Package Name**: `com.cloverpal.offlineai`
- **New Architecture**: Enabled (`"newArchEnabled": true` in `app.json`)
- **Native Module**: `modules/termux-integration` is linked automatically via Expo Autolinking.
- **Manifest Permissions**:
  - `com.termux.permission.RUN_COMMAND`
  - `android.permission.INTERNET` (Loopback communication)
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.POST_NOTIFICATIONS`
