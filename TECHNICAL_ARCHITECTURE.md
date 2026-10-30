# Technical Architecture: CloverPal Offline AI

## 1. High-Level Architectural Diagram

```
+-------------------------------------------------------------------------------+
|                       CloverPal Mobile App (Expo SDK 52)                      |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Expo Router Navigation (app/)                                         |   |
|   |  - app/_layout.tsx (SafeAreaProvider, DatabaseProvider, StatusBar)    |   |
|   |  - app/(tabs)/_layout.tsx (6 Tabs: Chat, Personas, Groups, RAG, etc.) |   |
|   +-----------------------------------------------------------------------+   |
|                                                                               |
|   +------------------------------------+  +-------------------------------+   |
|   | Presentation Components (src/)     |  | Offline Orchestration Layer   |   |
|   |  - RichResponseRenderer (Pure RN)  |  |  - RuntimeConnectionManager   |   |
|   |  - PersonaAvatar (Letter Badges)   |  |  - GroupChatOrchestrator      |   |
|   |  - ChatScreen (Virtual List & RAG) |  |  - ContextAssembler           |   |
|   +------------------------------------+  +-------------------------------+   |
|                                                                               |
|   +------------------------------------+  +-------------------------------+   |
|   | Storage Layer (expo-sqlite v15)    |  | Local Retrieval & Memory      |   |
|   |  - cloverpal.db (PRAGMA fk)        |  |  - IntelligentChunker (1200c) |   |
|   |  - Migrations 1 & 2 (embedding col)|  |  - HybridRetriever (RRF+BM25) |   |
|   |  - JSON Backup & Document Importer |  |  - LocalEmbeddingService      |   |
|   +------------------------------------+  +-------------------------------+   |
+-------------------------------------------------------------------------------+
                                    |
          Cleartext Loopback Only   |   Android RUN_COMMAND Intent
      (127.0.0.1:8080 & :8081)      |   (com.termux.RUN_COMMAND)
                                    v
+-------------------------------------------------------------------------------+
|                        Termux Android Linux Subsystem                         |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Termux RunCommandService (com.termux.app.RunCommandService)           |   |
|   |   - Executable: ~/.termux/start_ai_service.sh                         |   |
|   |   - WakeLock: termux-wake-lock (prevents CPU background sleep)        |   |
|   +-----------------------------------------------------------------------+   |
|                                                                               |
|   +---------------------------------+   +---------------------------------+   |
|   | Chat Engine: llama-server       |   | Embedding Engine: llama-server  |   |
|   |   - Port 8080 (127.0.0.1)       |   |   - Port 8081 (127.0.0.1)       |   |
|   |   - GGUF Quantized Models       |   |   - Nomic / BGE GGUF            |   |
|   |   - SSE Streaming /completion   |   |   - POST /embedding             |   |
|   +---------------------------------+   +---------------------------------+   |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Local Storage: ~/models/*.gguf (Llama 3.2, Qwen 2.5, Nomic Embed)     |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

---

## 2. Component Directory Architecture

```
/
├── app/                              # Expo Router Routes
│   ├── _layout.tsx                   # Root Provider Layout (Safe Area, DB, Theme)
│   └── (tabs)/
│       ├── _layout.tsx               # 6-Tab Bottom Bar (Dark Emerald Theme)
│       ├── index.tsx                 # Chat Screen Entry Point
│       ├── personas.tsx              # Character Library & Card V2 Import/Export
│       ├── groups.tsx                # Multi-Persona Group Chat Room
│       ├── knowledge.tsx             # Local RAG Knowledge Base & Collections
│       ├── memory.tsx                # Personal & Conversation Memory Manager
│       └── termux.tsx                # Termux Engine Status, Logs & Diagnostics
│
├── modules/
│   └── termux-integration/           # Custom Expo Native Module
│       ├── package.json              # Module Definition
│       ├── index.ts                  # JS Binding with requireOptionalNativeModule
│       └── android/src/main/java/    # Kotlin Native Bridge
│           └── TermuxIntegrationModule.kt
│
├── plugins/
│   └── withTermuxManifest.js         # Expo Config Plugin for AndroidManifest & NetSec
│
├── src/
│   ├── components/                   # Native React Native UI Components
│   │   ├── characters/               # CharacterLibraryScreen
│   │   ├── chat/                     # ChatScreen, RichResponseRenderer
│   │   ├── common/                   # PersonaAvatar, Modals
│   │   ├── groups/                   # GroupChatScreen
│   │   ├── knowledge/                # KnowledgeBaseScreen
│   │   ├── memory/                   # MemoryManagerScreen
│   │   └── settings/                 # SettingsScreen
│   ├── services/
│   │   ├── database/                 # Asynchronous expo-sqlite Repository
│   │   │   ├── db.ts                 # Database Client, Transactions, Seed Data
│   │   │   └── schema.ts             # Versioned Migrations 1 & 2
│   │   ├── engines/                  # Offline Inference Engine Adapters
│   │   │   ├── contracts/            # InferenceEngine Interface & Types
│   │   │   ├── llamaCpp/             # LlamaCppAdapter (SSE Streaming & Timings)
│   │   │   └── prismML/              # PrismMLAdapter (Experimental Gateway)
│   │   ├── group/                    # GroupChatOrchestrator
│   │   ├── memory/                   # Personal & Conversation Memory Services
│   │   ├── rag/                      # Offline RAG Retrieval Pipeline
│   │   │   ├── ContextAssembler.ts   # Prompt Injection Guard & Citations
│   │   │   ├── DocumentIngestion.ts  # FileTextExtractor & Indexer
│   │   │   ├── HybridRetriever.ts    # Dense Cosine + BM25 Lexical + RRF Fusion
│   │   │   ├── IntelligentChunker.ts # 1200 char chunking with header tracking
│   │   │   └── LocalEmbeddingService.ts # Port 8081 Client & 384-dim Hash Fallback
│   │   └── runtime/                  # RuntimeConnectionManager & State Machine
│   ├── theme/                        # CloverPal Emerald / Slate Dark Theme Tokens
│   └── types/                        # TypeScript Domain Types
│
├── app.json                          # Android Package & Permissions
├── eas.json                          # EAS Build Profiles (Preview APK & Production)
├── metro.config.js                   # Metro Bundler Config
└── tsconfig.json                     # TypeScript Configuration
```

---

## 3. Persistence Architecture (`expo-sqlite`)

The storage layer is built upon `expo-sqlite` (v15) using asynchronous APIs (`openDatabaseAsync('cloverpal.db')`).

### Database Migrations
- **Migration 1 (Baseline):**
  - `characters`: Persona attributes, personality, system prompts, greetings, response modes, and memory scope.
  - `conversations`: Chat sessions with engine, model, and active RAG collection IDs.
  - `messages`: Turn-based messages with sender metadata, citations JSON, and generation stats.
  - `group_chats`: Multi-agent room configurations and turn modes.
  - `collections`: Document knowledge collections.
  - `documents`: Document file metadata, chunk counts, and indexed timestamps.
  - `chunks`: Text chunks with dense vector JSON and section headers.
  - `memories`: Personal facts, bios, preferences, and projects with 1-5 importance ratings.
- **Migration 2 (Embedding Model Integrity):**
  - Alters `chunks` to add `embedding_model TEXT` and `embedding_dim INTEGER`.
  - Alters `documents` to add `status TEXT DEFAULT 'indexed'`.

### Safety Guarantees
- `PRAGMA foreign_keys = ON;` is executed on every connection.
- All write operations are wrapped in `withExclusiveTransactionAsync`.
- Zero raw string concatenation; all queries use parameterized SQL (`?`).
- Full JSON export and import using `expo-file-system` and `expo-sharing`.

---

## 4. Termux Integration & Native Bridge

Communication between CloverPal and Termux occurs across two channels:

1. **Native Intent Dispatch (`com.termux.permission.RUN_COMMAND`):**
   - Implemented in Kotlin via `TermuxIntegrationModule.kt`.
   - Dispatches an explicit `Intent("com.termux.RUN_COMMAND")` with component `ComponentName("com.termux", "com.termux.app.RunCommandService")`.
   - Starts the background service using `context.startService(intent)`.
   - If the permission is missing or Termux is not installed, it catches `SecurityException` and `ActivityNotFoundException` and returns explicit structured error diagnostics without crashing.

2. **Native TCP Socket Probing:**
   - Probes `127.0.0.1:<port>` with a timeout (default 1200ms) using Kotlin's `Socket().use { ... }` block, guaranteeing that sockets are cleanly closed even on timeout or error.

3. **Android Security & Cleartext Isolation:**
   - `plugins/withTermuxManifest.js` config plugin injects:
     - `<queries><package android:name="com.termux"/></queries>` into `AndroidManifest.xml`.
     - `android:networkSecurityConfig="@xml/network_security_config"` pointing to a custom XML resource.
     - `network_security_config.xml` that permits cleartext traffic **strictly** to `127.0.0.1` and `localhost`. All other cleartext network calls are blocked at the Android OS layer.

---

## 5. Inference Loop & Streaming

- **Engine:** `llama.cpp` running `llama-server`.
- **Protocol:** HTTP POST to `http://127.0.0.1:8080/completion`.
- **Payload:**
  - `prompt`: Formatted prompt or Llama-3 chat template with system instructions, personal memory context, injected RAG citations, and conversation history.
  - `temperature`, `top_p`, `top_k`, `min_p`, `repeat_penalty`, `mirostat`.
  - `stop`: `["<|eot_id|>", "<|end_of_text|>", "User:"]`.
  - `stream: true`.
- **Stream Processing:**
  - Standard Server-Sent Events (SSE) parsed line-by-line (`data: {...}`).
  - Emits real-time tokens to UI callbacks with UI throttling to avoid excessive re-renders.
  - Captures server `timings` (`prompt_ms`, `predicted_ms`, `tokens_per_second`) to construct accurate `GenerationStats`.
- **Cancellation:**
  - Uses `AbortController.abort()`. Aborting the fetch signal immediately terminates the local loopback TCP connection, causing `llama-server` to stop inference. No non-standard `/cancel` endpoints are used.

---

## 6. Local RAG Architecture

1. **Document Ingestion & Chunking (`IntelligentChunker.ts`):**
   - Splits text using character-based bounds: target size **1200 characters**, overlap **200 characters**.
   - Preserves Markdown headers (`# Header`, `## Section`) across chunk boundaries so chunks retain structural context.
2. **Dual-Port Architecture:**
   - Chat generation server operates on `127.0.0.1:8080`.
   - Embedding server operates on `127.0.0.1:8081` (`llama-server -m nomic-embed-text-v1.5.gguf --embedding --port 8081`).
   - If the embedding server is offline, the user can toggle a deterministic 384-dimensional keyword-hash vectorizer in Settings to continue testing and querying.
3. **Hybrid Retrieval (`HybridRetriever.ts`):**
   - **Dense Scoring:** Normalized cosine similarity between query vector and chunk vectors.
   - **Sparse Lexical Scoring:** BM25 term frequency algorithm on query tokens.
   - **Fusion:** Reciprocal Rank Fusion (RRF) with constant `k = 60` to balance semantic and exact-match results.
   - **Model Verification:** Rejects chunks whose `embedding_model` or `embedding_dim` do not match the current query embedding, preventing silent vector dimension errors.
4. **Context Assembly (`ContextAssembler.ts`):**
   - Surrounds retrieved chunks with explicit untrusted data boundary fences (`<<<UNTRUSTED_DOCUMENT_CONTENT>>>`).
   - Emits strict system instructions instructing the model to treat retrieved content solely as factual reference and never as system override directives.
   - Generates structured citations (`[Citation #1: filename, section]`).
