# CloverPal Offline AI — Android Termux Client

[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Expo%20React%20Native%20SDK%2052-emerald)](https://expo.dev)
[![Engine](https://img.shields.io/badge/Inference-llama.cpp%20(Port%208080)-blue)](https://github.com/ggml-org/llama.cpp)
[![RAG](https://img.shields.io/badge/RAG-Hybrid%20Dense%20%2B%20BM25%20%2B%20RRF-indigo)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Offline%20Air--Gapped-green)](#)

A companion-first, 100% offline Android AI application built with **Expo React Native** (SDK 52) and **Expo Router**, inspired by the visual warmth of **CloverPal** and the advanced inference controls of **ChatterUI**. Connects directly to local inference engines running inside **Termux** (`llama.cpp` on `127.0.0.1:8080` for chat and `127.0.0.1:8081` for embeddings).

---

## Key Features

- **Genuine Expo React Native Android Architecture**:
  - Pure React Native components (`View`, `Text`, `FlatList`, `Pressable`, `KeyboardAvoidingView`).
  - Zero DOM markup, zero web artifacts, zero web views.
- **Automatic Termux Connection**:
  - Probes local loopback ports (`127.0.0.1:8080`).
  - Launches background AI engines automatically using the Android `com.termux.permission.RUN_COMMAND` intent.
  - Sockets probed via Kotlin native module with deterministic cleanup.
- **Local Inference with llama.cpp**:
  - SSE streaming `/completion` loopback client with pure `AbortController.abort()` cancellation.
  - Generates real generation metrics (tokens/second, prompt tokens, eval tokens, latency).
- **Offline RAG (Retrieval-Augmented Generation)**:
  - Ingest TXT, Markdown, CSV, JSON, and source code directly on device.
  - Heading-preserving chunker (1200 character target size, 200 character overlap).
  - Dense cosine similarity + BM25 keyword scoring fused via Reciprocal Rank Fusion (RRF).
  - Prompt injection boundary fences protecting system instructions from untrusted document overrides.
- **Offline Personas & Character Cards**:
  - 4 pre-seeded personas: *Clover* (Compassionate Companion), *Aegis* (Systems Architect), *Athena* (Research Scholar), *Kaelen* (Narrative Weaver).
  - Letter-badge visual avatars rendered natively without remote image dependencies.
  - Character Card V2 JSON import and export.
- **Multi-Agent Group Discussions**:
  - Multi-character room coordinator with round-robin, manual mention (`@Name`), and auto-moderated turn taking with loop breaker prevention.
- **Persistent Personal Memory & SQLite Storage**:
  - Local SQLite database (`cloverpal.db`) with versioned migrations, parameterized SQL, and full database JSON export/import.
  - Scoped memories with importance ratings (1-5) and categories.

---

## Quick Start: Building the Android APK

### 1. Build Installable Standalone APK with EAS

```bash
# 1. Install dependencies
npm install

# 2. Log in to Expo
eas login

# 3. Build the preview APK
eas build --platform android --profile preview
```

### 2. Local Development Build

```bash
# Verify the native Android manifest & network security config locally
npx expo prebuild --platform android --clean

# Run development build on connected Android device via ADB
npx expo run:android
```

---

## Quick Start: Termux Setup

1. Install **Termux** and **Termux:API** from **F-Droid** (do NOT use Google Play Store).
2. In Android Settings → Apps → CloverPal Offline AI → Permissions → Grant **"Run commands in Termux environment"**.
3. In Termux, run:
   ```bash
   pkg update && pkg install curl tur-repo llama.cpp -y
   echo "allow-external-apps=true" >> ~/.termux/termux.properties
   ```
4. Download a quantized `.gguf` model to `~/models/` (e.g. Qwen 2.5 1.5B or Llama 3.2 3B).
5. Copy the startup script from the app's Settings tab to `~/.termux/start_ai_service.sh` and run `chmod +x ~/.termux/start_ai_service.sh`.

---

## Documentation Index

- [PROJECT_STATUS.md](./PROJECT_STATUS.md) — Implementation verification matrix and code audits.
- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) — System flow, component hierarchy, and security contracts.
- [TERMUX_SETUP.md](./TERMUX_SETUP.md) — Step-by-step Termux service installation and troubleshooting guide.
- [EXPO_ANDROID_BUILD.md](./EXPO_ANDROID_BUILD.md) — EAS and local Android Gradle build guide.
- [OFFLINE_VALIDATION.md](./OFFLINE_VALIDATION.md) — Offline tests and zero-cloud verification evidence.

---

## License

Apache-2.0
