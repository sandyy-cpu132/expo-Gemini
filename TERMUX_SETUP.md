# Termux Setup Guide: CloverPal Offline AI

This guide walks you through setting up Termux on an Android phone to run local AI inference with `llama.cpp` entirely offline on loopback (`127.0.0.1:8080` for chat, `127.0.0.1:8081` for embeddings).

---

## 1. Prerequisites: Termux from F-Droid

> **CRITICAL WARNING:** Do NOT install Termux from the Google Play Store. The Play Store release is abandoned due to Google's SDK restrictions, cannot update its package repositories, and will fail to execute commands.

1. Install **Termux** from **F-Droid** (or GitHub: `termux/termux-app` Releases).
2. Install **Termux:API** from **F-Droid** (needed for wake locks and device state).
3. Open Termux once to let it initialize its sandbox filesystem.

---

## 2. Grant Permissions

Android prevents third-party apps from interacting with Termux unless two specific permissions are configured:

### A. Grant RUN_COMMAND Permission
1. Open Android **Settings** → **Apps** (or **App Management**) → **See all apps**.
2. Select **CloverPal Offline AI**.
3. Tap **Permissions** → **Additional Permissions** (or three dots menu → All permissions).
4. Select **Run commands in Termux environment** (`com.termux.permission.RUN_COMMAND`) and choose **Allow**.

### B. Disable Battery Optimization
1. In Android **Settings** → **Apps** → **Termux** → **Battery**, select **Unrestricted**.
2. In Android **Settings** → **Apps** → **CloverPal Offline AI** → **Battery**, select **Unrestricted**.
   *This ensures Android's Low Memory Killer (LMK) does not terminate your local inference server when switching apps.*

---

## 3. Enable External App Commands in Termux

Termux requires an explicit configuration flag to allow external apps to trigger scripts via intents.

In Termux, run:

```bash
mkdir -p ~/.termux
echo "allow-external-apps=true" >> ~/.termux/termux.properties
```

Restart Termux or run:
```bash
termux-reload-settings
```

---

## 4. Install llama.cpp in Termux

Termux User Repository (TUR) provides pre-compiled `llama.cpp` packages optimized for ARM64:

```bash
# Update base repositories
pkg update && pkg upgrade -y

# Install tools and tur-repo
pkg install curl wget git tur-repo -y

# Install pre-built llama.cpp
pkg install llama.cpp -y
```

*(Alternatively, if compiling manually from source with clang: `pkg install clang cmake build-essential && git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build -DGGML_OPENMP=OFF && cmake --build build --config Release -j4 && cp build/bin/llama-server $PREFIX/bin/`)*

---

## 5. Download a Quantized Model

Create the models directory and download an instruction-tuned model. Recommended models for mobile hardware:

- **Ultra-lightweight (Phones with 4GB - 6GB RAM):** Qwen 2.5 1.5B Instruct Q4_K_M (~1.1 GB)
- **Balanced (Phones with 8GB RAM):** Llama 3.2 3B Instruct Q4_K_M (~2.0 GB)

Download example:

```bash
mkdir -p ~/models
cd ~/models

# Download Qwen 2.5 1.5B Instruct (GGUF)
curl -L -o ~/models/qwen2.5-1.5b-instruct-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf

# Optional: Download Nomic Embed for Port 8081 RAG
curl -L -o ~/models/nomic-embed-text-v1.5.Q4_K_M.gguf \
  https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf
```

---

## 6. Install the Service Launcher Script

CloverPal provides a pre-configured launcher script in the app under **Settings → Copy Launcher Script**.

Save the script to `~/.termux/start_ai_service.sh`:

```bash
cat << 'EOF' > ~/.termux/start_ai_service.sh
#!/data/data/com.termux/files/usr/bin/bash
ENGINE="${1:-llama.cpp}"
PORT="${2:-8080}"
MODELS_DIR="$HOME/models"

mkdir -p "$MODELS_DIR"

# Prevent duplicate background servers on the same port
if pgrep -f "llama-server.*--port $PORT" > /dev/null; then
    echo "[CloverPal] Server already active on port $PORT"
    exit 0
fi

# Acquire wake lock to keep Termux active in background
termux-wake-lock 2>/dev/null || true

if [ "$ENGINE" = "llama.cpp" ]; then
    MODEL_PATH="${LLAMA_MODEL_PATH:-}"
    if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
        MODEL_PATH=$(find "$MODELS_DIR" -name "*.gguf" | grep -v "embed" | head -n 1)
    fi

    if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
        echo "[ERROR] No .gguf model found in $MODELS_DIR"
        exit 1
    fi

    echo "[CloverPal] Launching llama-server with $MODEL_PATH on port $PORT..."
    exec llama-server \
        -m "$MODEL_PATH" \
        --host 127.0.0.1 \
        --port "$PORT" \
        -c 4096 \
        -t 4 \
        --slots
fi
EOF

# Make executable
chmod +x ~/.termux/start_ai_service.sh
```

---

## 7. Test in Termux Before Launching the App

Before switching to CloverPal, test running the script directly in Termux:

```bash
~/.termux/start_ai_service.sh llama.cpp 8080
```

Verify the output logs show:
```
llama_server: HTTP server listening on http://127.0.0.1:8080
```

In a second Termux tab or via curl:
```bash
curl http://127.0.0.1:8080/health
# Should return: {"status":"ok"} or similar
```

---

## 8. Troubleshooting Guide

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **`Connection refused` / Status Disconnected** | `llama-server` is not running on port 8080. | Open Termux and run `ps aux \| grep llama`. If not running, start it manually or tap "Launch Engine in Termux" in the app's Termux tab. |
| **`SecurityException: Permission denied (com.termux.permission.RUN_COMMAND)`** | App is missing the external intent permission. | Go to Android Settings → Apps → CloverPal Offline AI → Permissions → Additional Permissions → Enable "Run commands in Termux". |
| **Termux ignores intent / "Execution rejected"** | `allow-external-apps=true` is missing in properties. | Run `echo "allow-external-apps=true" >> ~/.termux/termux.properties` in Termux and reload with `termux-reload-settings`. |
| **`Out of memory` (OOM killed)** | Model is too large for device RAM. | Use a smaller model (1.5B or 3B INT4 quantized). Close background apps. Add `--threads 4` and reduce context size (`-c 2048`). |
| **Inference pauses when screen turns off** | Android suspended Termux CPU threads. | Run `termux-wake-lock` in Termux and set Battery to **Unrestricted** for both apps in Android Settings. |
| **Slow generation (< 3 tokens/sec)** | Thread count does not match big/mid CPU cores. | Most mobile processors have 4 performance cores. Adjust thread count to `-t 4` in the startup script. |
