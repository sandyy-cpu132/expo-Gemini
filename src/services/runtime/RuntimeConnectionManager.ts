/**
 * RuntimeConnectionManager
 * State machine managing loopback connectivity to local llama.cpp / Prism ML servers in Termux.
 * Never reports fake success. Checks AppState to avoid background polling.
 */

import { AppState, AppStateStatus } from 'react-native';
import {
  dispatchTermuxScript,
  hasRunCommandPermission,
  isTermuxInstalled,
  probeTcp,
  termuxAvailability,
} from '../../../modules/termux-integration';
import {
  EngineStatus,
  EngineType,
  ModelInfo,
  RuntimeDiagnostics,
  TermuxRuntimeConfig,
} from '../../types';
import { InferenceEngine } from '../engines/contracts/InferenceEngine';
import { LlamaCppAdapter } from '../engines/llamaCpp/LlamaCppAdapter';
import { PrismMLAdapter } from '../engines/prismML/PrismMLAdapter';

export type ConnectionState =
  | 'idle'
  | 'checking'
  | 'starting'
  | 'waiting'
  | 'connected'
  | 'failed';

export interface RuntimeListener {
  onStateChange?: (state: ConnectionState, message: string) => void;
  onDiagnosticsUpdate?: (diag: RuntimeDiagnostics) => void;
}

export class RuntimeConnectionManager {
  private static instance: RuntimeConnectionManager;
  private config: TermuxRuntimeConfig;
  private llamaAdapter: LlamaCppAdapter;
  private prismAdapter: PrismMLAdapter;
  private activeEngineType: EngineType = 'llama.cpp';
  private currentState: ConnectionState = 'idle';
  private stateMessage = 'Ready';
  private listeners: Set<RuntimeListener> = new Set();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private appState: AppStateStatus = 'active';

  private diagnostics: RuntimeDiagnostics = {
    termuxAppInstalled: false,
    termuxRunCommandPermission: false,
    llamaStatus: 'disconnected',
    llamaLatencyMs: null,
    embeddingServerStatus: 'disconnected',
    embeddingLatencyMs: null,
    prismStatus: 'disconnected',
    prismLatencyMs: null,
    activePort: 8080,
    lastCheckedAt: 0,
  };

  private constructor() {
    this.config = {
      llamaBaseUrl: 'http://127.0.0.1:8080',
      embeddingBaseUrl: 'http://127.0.0.1:8081',
      prismBaseUrl: 'http://127.0.0.1:8000',
      selectedEngine: 'llama.cpp',
      autoConnectOnLaunch: true,
      runCommandPath: '~/.termux/start_ai_service.sh',
      termuxServiceScript: 'bash ~/.termux/start_ai_service.sh',
      healthCheckIntervalMs: 8000,
      maxRetries: 5,
    };

    this.llamaAdapter = new LlamaCppAdapter(this.config.llamaBaseUrl);
    this.prismAdapter = new PrismMLAdapter({ baseUrl: this.config.prismBaseUrl });
    this.activeEngineType = this.config.selectedEngine;

    // Track app foreground/background
    AppState.addEventListener('change', (next) => {
      this.appState = next;
      if (next === 'active') {
        this.startWatchdog();
      } else {
        this.stopWatchdog();
      }
    });
  }

  public static getInstance(): RuntimeConnectionManager {
    if (!RuntimeConnectionManager.instance) {
      RuntimeConnectionManager.instance = new RuntimeConnectionManager();
    }
    return RuntimeConnectionManager.instance;
  }

  public getActiveEngine(): InferenceEngine {
    return this.activeEngineType === 'llama.cpp' ? this.llamaAdapter : this.prismAdapter;
  }

  public getActiveEngineType(): EngineType {
    return this.activeEngineType;
  }

  public getCurrentState(): ConnectionState {
    return this.currentState;
  }

  public getStateMessage(): string {
    return this.stateMessage;
  }

  public getDiagnostics(): RuntimeDiagnostics {
    return { ...this.diagnostics };
  }

  public subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private transitionTo(state: ConnectionState, message: string) {
    this.currentState = state;
    this.stateMessage = message;
    for (const l of this.listeners) {
      l.onStateChange?.(state, message);
    }
  }

  /**
   * Probes port via raw TCP and verifies HTTP GET /health returns 200 with ok status.
   */
  public async verifyServerHealth(port: number): Promise<{ healthy: boolean; latencyMs: number | null; error?: string }> {
    const tcp = await probeTcp('127.0.0.1', port, 1200);
    if (!tcp.isOpen) {
      return { healthy: false, latencyMs: null, error: tcp.error || 'Port closed' };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && (body.status === 'ok' || body.status === 'loading model')) {
          return { healthy: true, latencyMs: tcp.latencyMs };
        }
      }
      return { healthy: false, latencyMs: tcp.latencyMs, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { healthy: false, latencyMs: tcp.latencyMs, error: err.message || 'Health probe failed' };
    }
  }

  /**
   * Main connection sequence
   */
  public async initializeConnection(targetEngine?: EngineType): Promise<boolean> {
    if (this.isConnecting) return false;
    this.isConnecting = true;

    if (targetEngine) {
      this.activeEngineType = targetEngine;
    }

    const currentPort = this.activeEngineType === 'llama.cpp' ? 8080 : 8000;
    this.diagnostics.activePort = currentPort;

    // 1. Check native Termux module availability
    const avail = termuxAvailability();
    if (!avail.available) {
      this.transitionTo('failed', 'Native Termux integration module is not available on this build.');
      this.isConnecting = false;
      return false;
    }

    this.transitionTo('checking', `Probing 127.0.0.1:${currentPort}...`);

    // Probe current port
    const initialHealth = await this.verifyServerHealth(currentPort);
    if (initialHealth.healthy) {
      this.diagnostics.llamaStatus = 'connected';
      this.diagnostics.llamaLatencyMs = initialHealth.latencyMs;
      this.transitionTo('connected', `Connected to local server on port ${currentPort}`);
      this.isConnecting = false;
      this.startWatchdog();
      return true;
    }

    // Server is not running -> check prerequisites for start
    const installed = await isTermuxInstalled();
    this.diagnostics.termuxAppInstalled = installed;
    if (!installed) {
      this.transitionTo('failed', 'Termux app (com.termux) is not installed on this device.');
      this.isConnecting = false;
      return false;
    }

    const perm = await hasRunCommandPermission();
    this.diagnostics.termuxRunCommandPermission = perm;
    if (!perm) {
      this.transitionTo(
        'failed',
        'Permission com.termux.permission.RUN_COMMAND is not granted. Enable in Android App Settings.'
      );
      this.isConnecting = false;
      return false;
    }

    // 2. Dispatch Termux script
    this.transitionTo('starting', `Sending RUN_COMMAND to Termux for ${this.activeEngineType}...`);
    const dispatch = await dispatchTermuxScript(
      this.config.runCommandPath,
      this.activeEngineType,
      currentPort
    );

    if (!dispatch.success) {
      this.transitionTo('failed', `Failed to dispatch intent: ${dispatch.message}`);
      this.isConnecting = false;
      return false;
    }

    // 3. Waiting for readiness with capped exponential backoff (up to 25s)
    this.transitionTo('waiting', `Awaiting server readiness on port ${currentPort}...`);
    const ready = await this.pollReadiness(currentPort, 25000);

    if (ready) {
      this.diagnostics.llamaStatus = 'connected';
      this.transitionTo('connected', `Connected to local server on port ${currentPort}`);
      this.startWatchdog();
      this.isConnecting = false;
      return true;
    }

    // Timeout failure with diagnostic checklist
    this.transitionTo(
      'failed',
      `Timeout waiting for port ${currentPort}. Checklist: 1) allow-external-apps=true in ~/.termux/termux.properties; 2) start_ai_service.sh exists & executable; 3) GGUF model in ~/models/`
    );
    this.diagnostics.llamaStatus = 'disconnected';
    this.isConnecting = false;
    return false;
  }

  private async pollReadiness(port: number, maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    let delay = 800;

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, delay));
      const health = await this.verifyServerHealth(port);
      if (health.healthy) {
        return true;
      }
      delay = Math.min(delay * 1.35, 2500);
    }
    return false;
  }

  public async probeAllDiagnostics(): Promise<RuntimeDiagnostics> {
    const installed = await isTermuxInstalled();
    const perm = await hasRunCommandPermission();
    const llama = await this.verifyServerHealth(8080);
    const embed = await this.verifyServerHealth(8081);
    const prism = await this.verifyServerHealth(8000);

    this.diagnostics = {
      termuxAppInstalled: installed,
      termuxRunCommandPermission: perm,
      llamaStatus: llama.healthy ? 'connected' : 'disconnected',
      llamaLatencyMs: llama.latencyMs,
      embeddingServerStatus: embed.healthy ? 'connected' : 'disconnected',
      embeddingLatencyMs: embed.latencyMs,
      prismStatus: prism.healthy ? 'connected' : 'disconnected',
      prismLatencyMs: prism.latencyMs,
      activePort: this.activeEngineType === 'llama.cpp' ? 8080 : 8000,
      lastCheckedAt: Date.now(),
    };

    for (const l of this.listeners) {
      l.onDiagnosticsUpdate?.(this.diagnostics);
    }

    return { ...this.diagnostics };
  }

  private startWatchdog() {
    this.stopWatchdog();
    if (this.appState !== 'active') return;

    this.watchdogTimer = setInterval(async () => {
      if (this.appState !== 'active') return;
      const port = this.activeEngineType === 'llama.cpp' ? 8080 : 8000;
      const check = await this.verifyServerHealth(port);
      if (check.healthy && this.currentState !== 'connected') {
        this.transitionTo('connected', `Connected to port ${port}`);
      } else if (!check.healthy && this.currentState === 'connected') {
        this.transitionTo('failed', `Lost connection to port ${port}`);
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}

export const runtimeManager = RuntimeConnectionManager.getInstance();
