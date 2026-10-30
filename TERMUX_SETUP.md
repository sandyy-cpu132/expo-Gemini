# Termux Setup Guide: CloverPal Offline AI

This guide explains how to configure Termux on an Android device to enable automatic background AI inference without opening the terminal interface during everyday use.

---

## Prerequisites

1. **Android Device**: ARM64 architecture (Snapdragon 7 / 8 series or Dimensity recommended, 8GB+ RAM recommended for 3B models).
2. **Termux App**: Installed from **F-Droid** or GitHub Releases (do NOT use Google Play Store version as it is deprecated).
3. **Termux:Boot** (Optional): If you want the server to start automatically when your phone boots.

---

## Step 1: Grant Permissions

Android requires an explicit permission to allow an app to send commands to Termux:

1. Open Android **Settings** -> **Apps** -> **CloverPal Offline AI**.
2. Tap **Permissions** -> **Additional Permissions**.
3. Toggle on **`Run commands in Termux environment`** (`com.termux.permission.RUN_COMMAND`).
4. In Android Battery Settings, set both **Termux** and **CloverPal** to **Unrestricted** (prevents Android's Low Memory Killer from terminating the background server).

---

## Step 2: Configure Termux Environment

Open Termux once and execute:

```bash
# Update packages
pkg update && pkg upgrade -y

# Install build essentials, clang, and git
pkg install clang cmake git wget curl -y

# Create directory for script and models
mkdir -p ~/.termux
mkdir -p ~/models
```

---

## Step 3: Install Inference Engines

### Option A: llama.cpp

```bash
# Clone and build llama.cpp with ARM NEON acceleration
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DGGML_OPENMP=OFF
cmake --build build --config Release -j4
cp build/bin/llama-server $PREFIX/bin/
```

### Option B: Prism ML

If you are using Prism ML, ensure the binary or Python runner is available in `$PREFIX/bin/prism-serve` or configured in the app's Settings screen.

---

## Step 4: Download a Quantized Model

Place your desired `.gguf` model in `~/models/`. For example, Llama 3.2 3B Instruct Q4_K_M:

```bash
cd ~/models
wget https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf
```

---

## Step 5: Install the Launcher Script

Create `~/.termux/start_ai_service.sh`:

```bash
cat << 'EOF' > ~/.termux/start_ai_service.sh
#!/data/data/com.termux/files/usr/bin/bash

ENGINE="${1:-llama.cpp}"
PORT="${2:-8080}"
MODELS_DIR="$HOME/models"

mkdir -p "$MODELS_DIR"
termux-wake-lock 2>/dev/null || true

echo "[CloverPal] Launching $ENGINE on port $PORT..."

if [ "$ENGINE" = "llama.cpp" ]; then
    MODEL_PATH=$(find "$MODELS_DIR" -name "*.gguf" | head -n 1)
    if [ -z "$MODEL_PATH" ]; then
        echo "[ERROR] No .gguf model found in $MODELS_DIR"
        exit 1
    fi
    exec llama-server \
        -m "$MODEL_PATH" \
        --host 127.0.0.1 \
        --port "$PORT" \
        -c 4096 \
        -t 4 \
        --embedding \
        --cont-batching \
        --slots
elif [ "$ENGINE" = "prism-ml" ]; then
    exec prism-serve \
        --host 127.0.0.1 \
        --port "$PORT" \
        --model-dir "$MODELS_DIR" \
        --threads 4
fi
EOF

chmod +x ~/.termux/start_ai_service.sh
```

---

## Step 6: Verify Automatic Launch

1. Close Termux.
2. Open **CloverPal Offline AI**.
3. The app will detect the server is offline, dispatch `com.termux.RUN_COMMAND` intent, and connect to `http://127.0.0.1:8080` automatically.
4. The top status pill will turn **Green** (`LLAMA :8080`), and you can immediately begin chatting!
