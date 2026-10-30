# Offline Validation & Verification Report

## 1. Zero Cloud Dependency Audit

An exhaustive audit of the codebase confirms:
- **No Cloud LLM Endpoints**: No OpenAI, Anthropic, Gemini, or remote inference APIs are called during generation. All inference queries route strictly to `http://127.0.0.1:<port>`.
- **No Remote Vector DBs**: Embeddings and document chunks are indexed in local SQLite.
- **No Telemetry / Analytics Trackers**: No Google Analytics, Mixpanel, Sentry, or tracking beacons exist in the application.
- **No External CDN Dependencies**: Fonts, icons, and UI logic are bundled locally.

---

## 2. Ingestion & Retrieval Pipeline Invariants

| Test Invariant | Expected Behavior | Actual Verified Result | Status |
| :--- | :--- | :--- | :--- |
| **Heading Preservation** | Preserves Markdown section headers during chunking | Section titles mapped to `sectionHeader` metadata | **PASSED** |
| **Embedding Dimensionality** | Generates stable normalized 384-dim vector | Vector length = 384; unit norm $\approx 1.0$ | **PASSED** |
| **Semantic Angle (Cosine)** | High semantic similarity between correlated concepts | `sim(related) > sim(unrelated)` | **PASSED** |
| **Lexical Keyword Match** | BM25 rewards exact keyword hits with term saturation | Valid BM25 IDF curve computed | **PASSED** |
| **Prompt Injection Fencing** | Untrusted document chunks cannot escape fence | Escape backticks sanitized; instruction boundary enforced | **PASSED** |
| **Context Truncation** | Preserves recent dialogue when token limit reached | Rolling message context budgeting | **PASSED** |

---

## 3. Disconnected Air-Gap Test Procedure

To verify offline operation on physical Android hardware:

1. Enable **Airplane Mode** (disconnect Wi-Fi, Cellular Data, and Bluetooth).
2. Launch the **CloverPal** app.
3. Verify that the app connects to the Termux loopback server (`127.0.0.1:8080`).
4. Ingest a sample text or markdown file into the Knowledge Base tab.
5. Ask a question regarding the ingested content.
6. Observe that:
   - Tokens stream with live tokens/second telemetry.
   - Grounded citations `[ref-1]` appear below the answer linking to the source excerpt.
   - No network packets leave the device.
