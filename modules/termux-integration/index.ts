import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeTermux = {
  isTermuxInstalled(): Promise<boolean>;
  hasRunCommandPermission(): Promise<boolean>;
  probeSocket(host: string, port: number, timeoutMs: number): Promise<{
    host: string;
    port: number;
    isOpen: boolean;
    latencyMs: number | null;
    error?: string;
  }>;
  executeCommand(opts: {
    executable: string;
    arguments: string[];
    background: boolean;
    sessionAction: string;
  }): Promise<{ success: boolean; message: string }>;
};

const native = requireOptionalNativeModule<NativeTermux>('TermuxIntegrationModule');

export type TermuxAvailability =
  | { available: true }
  | { available: false; reason: 'not-android' | 'native-module-missing' };

export function termuxAvailability(): TermuxAvailability {
  if (!native) return { available: false, reason: 'native-module-missing' };
  return { available: true };
}

export async function isTermuxInstalled(): Promise<boolean> {
  return native ? native.isTermuxInstalled() : false;
}

export async function hasRunCommandPermission(): Promise<boolean> {
  return native ? native.hasRunCommandPermission() : false;
}

export async function probeTcp(host = '127.0.0.1', port = 8080, timeoutMs = 1200) {
  if (!native) {
    return { host, port, isOpen: false, latencyMs: null, error: 'native-module-missing' };
  }
  return native.probeSocket(host, port, timeoutMs);
}

export async function dispatchTermuxScript(scriptPath: string, engine: string, port: number) {
  if (!native) {
    return { success: false, message: 'Native Termux module is not available on this build.' };
  }
  return native.executeCommand({
    executable: '/data/data/com.termux/files/usr/bin/bash',
    arguments: ['-c', `${scriptPath} ${engine} ${port}`],
    background: true,
    sessionAction: '0',
  });
}

export function generateTermuxSetupScript(): string {
  return `#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# CloverPal Offline AI — Termux Background Engine Launcher
# Place this at: ~/.termux/start_ai_service.sh
# Make executable: chmod +x ~/.termux/start_ai_service.sh
# ==============================================================================

ENGINE="\${1:-llama.cpp}"
PORT="\${2:-8080}"
MODELS_DIR="$HOME/models"
ENV_FILE="$HOME/.termux/ai.env"

# Load explicit configuration if present
if [ -f "$ENV_FILE" ]; then
    . "$ENV_FILE"
fi

mkdir -p "$MODELS_DIR"

# Prevent duplicate background servers on the same port
if pgrep -f "llama-server.*--port $PORT" > /dev/null; then
    echo "[CloverPal] Server already active on port $PORT"
    exit 0
fi

# Acquire wake lock to keep Termux active in background
termux-wake-lock 2>/dev/null || true

echo "[CloverPal] Starting AI Engine: $ENGINE on port $PORT..."

if [ "$ENGINE" = "llama.cpp" ]; then
    MODEL_PATH="\${LLAMA_MODEL_PATH:-}"
    if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
        MODEL_PATH=$(find "$MODELS_DIR" -name "*.gguf" | head -n 1)
    fi

    if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
        echo "[ERROR] No .gguf model found in $MODELS_DIR or specified in $ENV_FILE"
        exit 1
    fi

    echo "[CloverPal] Launching llama-server with $MODEL_PATH..."
    exec llama-server \\
        -m "$MODEL_PATH" \\
        --host 127.0.0.1 \\
        --port "$PORT" \\
        -c 4096 \\
        -t 4 \\
        --embedding \\
        --slots
elif [ "$ENGINE" = "prism-ml" ]; then
    echo "[CloverPal] Launching Prism ML Server on port $PORT..."
    exec prism-serve \\
        --host 127.0.0.1 \\
        --port "$PORT" \\
        --model-dir "$MODELS_DIR" \\
        --threads 4
fi
`;
}
