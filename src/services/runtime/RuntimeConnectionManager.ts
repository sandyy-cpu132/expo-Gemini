/**
 * RuntimeConnectionManager
 * Manages loopback connectivity, auto-bootstrapping Termux services, health monitoring,
 * and engine failover.
 */

import { termuxIntegration } from '../../../modules/termux-integration';
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

export type ConnectionEvent =
  | 'idle'
  | 'checking_server'
  | 'starting_termux'
  | 'waiting_readiness'
  | 'connected'
  | 'server_unavailable'
  | 'reconnecting';

export interface RuntimeListener {
  onStatusChange?: (status: EngineStatus, event: ConnectionEvent, details?: string) => void;
  onModelsDiscovered?: (models: ModelInfo[]) => void;
}

export class RuntimeConnectionManager {
  private static instance: RuntimeConnectionManager;
  private config: TermuxRuntimeConfig;
  private llamaAdapter: LlamaCppAdapter;
  private prismAdapter: PrismMLAdapter;
  private activeEngineType: EngineType = 'llama.cpp';
  private connectionEvent: ConnectionEvent = 'idle';
  private isAutoConnecting = false;
  private listeners: Set<RuntimeListener> = new Set();
  private healthCheckTimer: any = null;
  private retryCount = 0;
  private maxRetries = 5;

  private diagnostics: RuntimeDiagnostics = {
    termuxAppInstalled: true,
    termuxRunCommandPermission: true,
    llamaStatus: 'disconnected',
    llamaLatencyMs: null,
    prismStatus: 'disconnected',
    prismLatencyMs: null,
    activePort: 8080,
    lastCheckedAt: Date.now(),
  };

  private constructor() {
    this.config = {
      llamaBaseUrl: 'http://127.0.0.1:8080',
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

  public getEngine(type: EngineType): InferenceEngine {
    return type === 'llama.cpp' ? this.llamaAdapter : this.prismAdapter;
  }

  public getActiveEngineType(): EngineType {
    return this.activeEngineType;
  }

  public getDiagnostics(): RuntimeDiagnostics {
    return { ...this.diagnostics };
  }

  public getConnectionEvent(): ConnectionEvent {
    return this.connectionEvent;
  }

  public subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(status: EngineStatus, event: ConnectionEvent, details?: string) {
    this.connectionEvent = event;
    for (const l of this.listeners) {
      l.onStatusChange?.(status, event, details);
    }
  }

  /**
   * Primary workflow:
   * 1. Probe loopback port.
   * 2. If running, connect and discover models immediately.
   * 3. If offline, dispatch Termux RUN_COMMAND intent.
   * 4. Poll with bounded exponential backoff until server is ready.
   */
  public async initializeConnection(targetEngine?: EngineType): Promise<boolean> {
    if (this.isAutoConnecting) return false;
    this.isAutoConnecting = true;

    if (targetEngine) {
      this.activeEngineType = targetEngine;
    }

    const currentPort = this.activeEngineType === 'llama.cpp' ? 8080 : 8000;
    this.diagnostics.activePort = currentPort;

    this.notify('connecting', 'checking_server', `Checking loopback :${currentPort}...`);

    try {
      // 1. Probe current port
      const probe = await termuxIntegration.probeSocket('127.0.0.1', currentPort, 1200);
      if (probe.isOpen) {
        return await this.finalizeConnection('Already running in background');
      }

      // 2. Server not running -> Attempt automatic start via Termux RUN_COMMAND
      this.notify(
        'connecting',
        'starting_termux',
        `Starting Termux ${this.activeEngineType} service via RUN_COMMAND...`
      );

      const startResult = await termuxIntegration.startTermuxService(
        this.config.runCommandPath,
        this.activeEngineType,
        currentPort
      );

      // 3. Wait for readiness with exponential backoff
      this.notify(
        'connecting',
        'waiting_readiness',
        `Awaiting server readiness on port ${currentPort}...`
      );

      const isReady = await this.pollUntilReady(currentPort, 10, 800);
      if (isReady) {
        return await this.finalizeConnection('Termux background server bootstrapped successfully');
      } else {
        this.notify(
          'disconnected',
          'server_unavailable',
          `Server offline on port ${currentPort}. Is Termux running with start_ai_service.sh?`
        );
        this.diagnostics.errorDetails = `Connection refused on 127.0.0.1:${currentPort}.`;
        this.startBackgroundWatchdog();
        return false;
      }
    } catch (err: any) {
      this.notify('error', 'server_unavailable', err.message || 'Connection failure');
      return false;
    } finally {
      this.isAutoConnecting = false;
    }
  }

  private async pollUntilReady(port: number, maxAttempts = 8, initialDelayMs = 800): Promise<boolean> {
    let delay = initialDelayMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, delay));
      const probe = await termuxIntegration.probeSocket('127.0.0.1', port, 1000);
      if (probe.isOpen) {
        return true;
      }
      delay = Math.min(delay * 1.35, 2500);
    }
    return false;
  }

  private async finalizeConnection(reason: string): Promise<boolean> {
    const engine = this.getActiveEngine();
    const ok = await engine.connect();
    if (ok) {
      this.notify('connected', 'connected', reason);
      this.retryCount = 0;
      this.updateDiagnosticsAfterCheck();

      // Discover models
      try {
        const models = await engine.getModels();
        for (const l of this.listeners) {
          l.onModelsDiscovered?.(models);
        }
      } catch {
        // Models discovery non-fatal
      }

      this.startBackgroundWatchdog();
      return true;
    } else {
      this.notify('disconnected', 'server_unavailable', 'Port open but HTTP health failed');
      return false;
    }
  }

  public async switchEngine(engineType: EngineType): Promise<boolean> {
    if (this.activeEngineType === engineType && (await this.getActiveEngine().getStatus()) === 'connected') {
      return true;
    }

    await this.getActiveEngine().disconnect();
    this.activeEngineType = engineType;
    return await this.initializeConnection(engineType);
  }

  public async probeAllEngines(): Promise<RuntimeDiagnostics> {
    const llamaProbe = await termuxIntegration.probeSocket('127.0.0.1', 8080, 1000);
    const prismProbe = await termuxIntegration.probeSocket('127.0.0.1', 8000, 1000);

    this.diagnostics.llamaStatus = llamaProbe.isOpen ? 'connected' : 'disconnected';
    this.diagnostics.llamaLatencyMs = llamaProbe.latencyMs;

    this.diagnostics.prismStatus = prismProbe.isOpen ? 'connected' : 'disconnected';
    this.diagnostics.prismLatencyMs = prismProbe.latencyMs;

    this.diagnostics.lastCheckedAt = Date.now();
    return { ...this.diagnostics };
  }

  private updateDiagnosticsAfterCheck() {
    this.probeAllEngines().catch(() => {});
  }

  private startBackgroundWatchdog() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

    this.healthCheckTimer = setInterval(async () => {
      const engine = this.getActiveEngine();
      const status = await engine.getStatus();
      if (status !== 'connected' && this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.notify('connecting', 'reconnecting', `Watchdog re-evaluating loopback connection (Attempt ${this.retryCount}/${this.maxRetries})`);
        await this.initializeConnection();
      }
    }, this.config.healthCheckIntervalMs);
  }

  public stopWatchdog() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

export const runtimeManager = RuntimeConnectionManager.getInstance();
