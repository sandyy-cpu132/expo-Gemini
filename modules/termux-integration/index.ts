/**
 * Expo Native Module TypeScript Interface for Termux Integration
 * Controls Android RUN_COMMAND intent, Termux boot services, and loopback socket probing.
 */

export interface TermuxExecutionResult {
  success: boolean;
  message: string;
  commandSent?: string;
  exitCode?: number;
}

export interface SocketProbeResult {
  host: string;
  port: number;
  isOpen: boolean;
  latencyMs: number | null;
}

class TermuxIntegrationService {
  /**
   * Checks if the Termux Android application (com.termux) is installed on the device.
   */
  async isTermuxInstalled(): Promise<boolean> {
    if (typeof window !== 'undefined' && !(window as any).expo?.modules?.TermuxIntegrationModule) {
      // Browser or simulator environment
      return true;
    }
    try {
      const nativeModule = (window as any).expo?.modules?.TermuxIntegrationModule;
      return await nativeModule.isTermuxInstalled();
    } catch {
      return false;
    }
  }

  /**
   * Checks if the com.termux.permission.RUN_COMMAND has been granted to the app.
   */
  async hasRunCommandPermission(): Promise<boolean> {
    try {
      const nativeModule = (window as any).expo?.modules?.TermuxIntegrationModule;
      if (nativeModule) {
        return await nativeModule.hasRunCommandPermission();
      }
    } catch {
      // fallback
    }
    return true;
  }

  /**
   * Sends the Android RUN_COMMAND Intent to Termux to start the llama.cpp or Prism ML server in the background.
   */
  async startTermuxService(
    scriptPath = '~/.termux/start_ai_service.sh',
    engine: 'llama.cpp' | 'prism-ml' = 'llama.cpp',
    port = 8080
  ): Promise<TermuxExecutionResult> {
    try {
      const nativeModule = (window as any).expo?.modules?.TermuxIntegrationModule;
      if (nativeModule) {
        return await nativeModule.executeCommand({
          executable: '/data/data/com.termux/files/usr/bin/bash',
          arguments: ['-c', `${scriptPath} ${engine} ${port}`],
          background: true,
          sessionAction: '0', // 0 = run in background without creating a terminal window
        });
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Native invocation error: ${err.message || 'Termux Intent failed'}`,
      };
    }

    return {
      success: true,
      message: `Simulated launch of Termux service for ${engine} on port ${port}`,
      commandSent: `bash -c "${scriptPath} ${engine} ${port}"`,
    };
  }

  /**
   * Probes a local loopback port directly via fetch / socket.
   */
  async probeSocket(host = '127.0.0.1', port = 8080, timeoutMs = 1200): Promise<SocketProbeResult> {
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // Attempt minimal ping to loopback HTTP server
      const res = await fetch(`http://${host}:${port}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(async () => {
        // Fallback root fetch
        return await fetch(`http://${host}:${port}/`, {
          method: 'GET',
          signal: controller.signal,
        });
      });
      clearTimeout(timer);

      const latencyMs = Math.round(performance.now() - startTime);
      return {
        host,
        port,
        isOpen: res.status !== 0,
        latencyMs,
      };
    } catch {
      return {
        host,
        port,
        isOpen: false,
        latencyMs: null,
      };
    }
  }

  /**
   * Generates the shell script the user can copy into Termux ~/.termux/start_ai_service.sh
   */
  generateTermuxSetupScript(): string {
    return `#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# CloverPal Offline AI — Termux Background Engine Launcher
# Place this at: ~/.termux/start_ai_service.sh
# Make executable: chmod +x ~/.termux/start_ai_service.sh
# ==============================================================================

ENGINE="\${1:-llama.cpp}"
PORT="\${2:-8080}"
MODELS_DIR="$HOME/models"

mkdir -p "$MODELS_DIR"

# Acquire wake lock to keep Termux active in background
termux-wake-lock 2>/dev/null || true

echo "[CloverPal] Starting AI Engine: $ENGINE on port $PORT..."

if [ "$ENGINE" = "llama.cpp" ]; then
    # Look for any .gguf model in ~/models
    MODEL_PATH=$(find "$MODELS_DIR" -name "*.gguf" | head -n 1)
    if [ -z "$MODEL_PATH" ]; then
        echo "[ERROR] No .gguf model found in $MODELS_DIR"
        echo "Please download a model: curl -L -o $MODELS_DIR/llama-3.2-3b.Q4_K_M.gguf <URL>"
        exit 1
    fi
    echo "[CloverPal] Launching llama-server with $MODEL_PATH..."
    exec llama-server \\
        -m "$MODEL_PATH" \\
        --host 127.0.0.1 \\
        --port "$PORT" \\
        -c 4096 \\
        -ngl 99 \\
        -t 4 \\
        --embedding \\
        --cont-batching \\
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
}

export const termuxIntegration = new TermuxIntegrationService();
