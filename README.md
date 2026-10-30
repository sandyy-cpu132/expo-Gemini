# CloverPal Offline AI — Android Termux Client

[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Expo%20React%20Native-emerald)](https://expo.dev)
[![Engine](https://img.shields.io/badge/Inference-llama.cpp%20%7C%20Prism%20ML-blue)](https://github.com/ggml-org/llama.cpp)
[![RAG](https://img.shields.io/badge/RAG-Hybrid%20Dense%20%2B%20BM25-indigo)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Offline%20Air--Gapped-green)](#)

A companion-first, offline Android AI application inspired by **CloverPal** and **ChatterUI**. Connects automatically to local inference engines running in **Termux** (`llama.cpp` and `Prism ML`), featuring local document ingestion, hybrid vector/BM25 RAG, isolated character cards, multi-character group chats, and persistent personal memory.

---

## Key Features

- **Automatic Termux Connection**: Never manage terminal sessions manually. CloverPal probes loopback ports and triggers the Android `RUN_COMMAND` intent automatically.
- **Dual Inference Engine Support**:
  - `llama.cpp` (Port 8080) for GGUF models with ARM NEON / Vulkan acceleration.
  - `Prism ML` (Port 8000) with a configurable REST adapter.
- **Rich Modular Response Rendering**:
  - Markdown headings, lists, tables, task lists, horizontal dividers.
  - Syntax-highlighted code blocks with line numbers, copy action, and language labels.
  - LaTeX mathematical equations ($inline$ and $$display$$).
  - Grounded clickable citations `[ref-1]` linking to source documents.
- **Character Cards System**:
  - Pre-seeded personas: *Clover* (Companion), *Aegis* (Systems Architect), *Athena* (Scholar), *Kaelen* (Narrative Weaver).
  - Full Character Card V2 JSON import and export.
- **Multi-Agent Group Discussions**:
  - Round-robin and auto-moderated turn taking with loop-prevention safeguards.
- **State-of-the-Art Local RAG**:
  - Ingest PDF, TXT, Markdown, CSV, JSON, and source code.
  - Heading-aware chunker with configurable overlap.
  - 384-dimensional offline embeddings + BM25 keyword scoring.
  - Prompt-injection hardened context fences.
- **Three Isolated Memory Tiers**:
  1. *Conversation Memory*: Rolling token window budgeting.
  2. *Personal Memory*: User preferences and facts explicitly saved.
  3. *Knowledge Base*: Document collections with vector retrieval.
- **Offline Persistence**: SQLite schema with foreign keys, indexes, and full database JSON backup/restore.

---

## Documentation Index

- [PROJECT_STATUS.md](./PROJECT_STATUS.md) — Implementation verification matrix.
- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) — System flow, component hierarchy, and security contracts.
- [TERMUX_SETUP.md](./TERMUX_SETUP.md) — Step-by-step Termux service installation and script setup.
- [EXPO_ANDROID_BUILD.md](./EXPO_ANDROID_BUILD.md) — EAS and local Android Gradle build guide.
- [OFFLINE_VALIDATION.md](./OFFLINE_VALIDATION.md) — Air-gap audit and test suites.

---

## Quick Start (Preview & Development)

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Build for Android
npx expo run:android --variant release
```

---

## License

Apache-2.0
