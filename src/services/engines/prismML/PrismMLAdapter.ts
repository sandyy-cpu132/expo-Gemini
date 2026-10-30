/**
 * Prism ML Engine Adapter (Experimental / Unverified)
 * Gated behind experimental settings flag until verified on device.
 */

import {
  ChatMessage,
  EngineCapabilities,
  EngineStatus,
  EngineType,
  GenerationSettings,
  GenerationStats,
  ModelInfo,
} from '../../../types';
import { GenerationChunk, InferenceEngine } from '../contracts/InferenceEngine';

export class PrismMLAdapter implements InferenceEngine {
  readonly engineType: EngineType = 'prism-ml';
  public baseUrl: string;
  private currentStatus: EngineStatus = 'disconnected';
  private abortController: AbortController | null = null;
  private lastStats: GenerationStats | null = null;

  constructor(customConfig?: { baseUrl?: string }) {
    this.baseUrl = (customConfig?.baseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  }

  async connect(): Promise<boolean> {
    this.currentStatus = 'connecting';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/healthz`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        this.currentStatus = 'connected';
        return true;
      }
    } catch {
      // offline
    }
    this.currentStatus = 'error';
    return false;
  }

  async disconnect(): Promise<void> {
    this.stopGeneration();
    this.currentStatus = 'disconnected';
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`);
      this.currentStatus = res.ok ? 'connected' : 'disconnected';
    } catch {
      this.currentStatus = 'disconnected';
    }
    return this.currentStatus;
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    return {
      supportsStreaming: true,
      supportsEmbeddings: false,
      supportsContextShift: false,
      supportsMirostat: false,
      supportsStopSequences: true,
      supportsGrammar: false,
      maxContextLength: 4096,
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        return list.map((m: any) => ({
          id: m.id || 'prism-model',
          name: m.name || m.id || 'Prism Model',
          engine: 'prism-ml' as EngineType,
          loaded: true,
          contextLength: 4096,
        }));
      }
    } catch {
      // Server down -> return empty
    }
    return [];
  }

  async generate(
    messages: ChatMessage[],
    settings?: Partial<GenerationSettings>
  ): Promise<{ text: string; stats?: GenerationStats }> {
    let fullText = '';
    let stats: GenerationStats | undefined;

    await this.streamGenerate(messages, settings, (chunk) => {
      fullText += chunk.token;
      if (chunk.stats) stats = chunk.stats;
    });

    return { text: fullText, stats };
  }

  async streamGenerate(
    messages: ChatMessage[],
    settings: Partial<GenerationSettings> | undefined,
    onChunk: (chunk: GenerationChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.abortController = new AbortController();
    const effectiveSignal = signal || this.abortController.signal;

    const body = {
      messages,
      temperature: settings?.temperature ?? 0.7,
      top_p: settings?.topP ?? 0.9,
      max_tokens: settings?.maxTokens ?? 2048,
      stream: true,
      stop: settings?.stopSequences,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: effectiveSignal,
      });

      if (!response.ok) {
        throw new Error(`Prism ML error (${response.status})`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || json.token || '';
      onChunk({ token: content, isFinished: true });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        onChunk({ token: '', isFinished: true });
        return;
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  stopGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  getGenerationStats(): GenerationStats | null {
    return this.lastStats;
  }

  getEngineInfo() {
    return {
      name: 'Prism ML (Experimental / Unverified)',
      version: 'v0.1-preview',
      status: this.currentStatus,
    };
  }
}
