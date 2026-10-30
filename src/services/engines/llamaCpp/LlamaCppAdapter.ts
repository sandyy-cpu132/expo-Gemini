/**
 * llama.cpp HTTP Server Adapter
 * Connects to llama.cpp server running on Termux loopback (default: http://127.0.0.1:8080).
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

export class LlamaCppAdapter implements InferenceEngine {
  readonly engineType: EngineType = 'llama.cpp';
  public baseUrl: string;
  private currentStatus: EngineStatus = 'disconnected';
  private abortController: AbortController | null = null;
  private lastStats: GenerationStats | null = null;
  private serverContextLength = 4096;

  constructor(baseUrl = 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async connect(): Promise<boolean> {
    this.currentStatus = 'connecting';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && (body.status === 'ok' || body.status === 'loading model')) {
          this.currentStatus = 'connected';
          this.fetchServerProps().catch(() => {});
          return true;
        }
      }
    } catch {
      // offline
    }
    this.currentStatus = 'error';
    return false;
  }

  private async fetchServerProps(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/props`);
      if (res.ok) {
        const data = await res.json();
        if (data.default_generation_settings?.n_ctx) {
          this.serverContextLength = data.default_generation_settings.n_ctx;
        }
      }
    } catch {
      // Ignore
    }
  }

  async disconnect(): Promise<void> {
    this.stopGeneration();
    this.currentStatus = 'disconnected';
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && (body.status === 'ok' || body.status === 'loading model')) {
          this.currentStatus = 'connected';
          return 'connected';
        }
      }
    } catch {
      // unreachable
    }
    this.currentStatus = 'disconnected';
    return 'disconnected';
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    return {
      supportsStreaming: true,
      supportsEmbeddings: true,
      supportsContextShift: true,
      supportsMirostat: true,
      supportsStopSequences: true,
      supportsGrammar: true,
      maxContextLength: this.serverContextLength,
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (res.ok) {
        const data = await res.json();
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          return data.data.map((m: { id: string }) => ({
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            engine: 'llama.cpp',
            loaded: true,
            contextLength: this.serverContextLength,
          }));
        }
      }
    } catch {
      // Server down -> return empty array (no fake success)
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

    const requestBody = {
      messages,
      temperature: settings?.temperature ?? 0.7,
      top_p: settings?.topP ?? 0.9,
      top_k: settings?.topK ?? 40,
      min_p: settings?.minP ?? 0.05,
      repeat_penalty: settings?.repeatPenalty ?? 1.1,
      presence_penalty: settings?.presencePenalty ?? 0.0,
      frequency_penalty: settings?.frequencyPenalty ?? 0.0,
      max_tokens: settings?.maxTokens ?? 2048,
      stream: true,
      stop: settings?.stopSequences ?? ['<|eot_id|>', '<|end_of_text|>'],
    };

    const startTime = performance.now();
    let promptTime = 0;
    let tokenCount = 0;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        signal: effectiveSignal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`llama.cpp error (${response.status}): ${errorText.slice(0, 200)}`);
      }

      if (!response.body) {
        // Fallback for non-streaming environments: read json
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        onChunk({ token: content, isFinished: true });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed === 'data: [DONE]') {
            const totalMs = performance.now() - startTime;
            const evalMs = totalMs - promptTime;
            const tps = tokenCount > 0 && evalMs > 0 ? (tokenCount / evalMs) * 1000 : 0;
            const stats: GenerationStats = {
              promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
              completionTokens: tokenCount,
              totalTokens: Math.ceil(JSON.stringify(messages).length / 4) + tokenCount,
              promptMs: Math.round(promptTime),
              evalMs: Math.round(evalMs),
              tokensPerSecond: Math.round(tps * 10) / 10,
              isEstimated: true,
            };
            this.lastStats = stats;
            onChunk({ token: '', isFinished: true, stats });
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                if (tokenCount === 0) {
                  promptTime = performance.now() - startTime;
                }
                tokenCount++;
                onChunk({ token: delta, isFinished: false });
              }

              // Extract real timings if server provided them
              if (json.timings) {
                const timings = json.timings;
                this.lastStats = {
                  promptTokens: timings.prompt_n || 0,
                  completionTokens: timings.predicted_n || tokenCount,
                  totalTokens: (timings.prompt_n || 0) + (timings.predicted_n || tokenCount),
                  promptMs: Math.round(timings.prompt_ms || promptTime),
                  evalMs: Math.round(timings.predicted_ms || 0),
                  tokensPerSecond: Math.round((timings.predicted_per_second || 0) * 10) / 10,
                  isEstimated: false,
                };
              } else if (json.usage) {
                const totalMs = performance.now() - startTime;
                this.lastStats = {
                  promptTokens: json.usage.prompt_tokens,
                  completionTokens: json.usage.completion_tokens,
                  totalTokens: json.usage.total_tokens,
                  promptMs: Math.round(promptTime),
                  evalMs: Math.round(totalMs - promptTime),
                  tokensPerSecond:
                    tokenCount > 0 && totalMs > 0 ? Math.round(((tokenCount / totalMs) * 1000) * 10) / 10 : 0,
                  isEstimated: false,
                };
              }
            } catch {
              // Parse error / chunk boundary
            }
          }
        }
      }

      onChunk({ token: '', isFinished: true, stats: this.lastStats || undefined });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        onChunk({ token: '', isFinished: true, stats: this.lastStats || undefined });
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
      name: 'llama.cpp Termux Server',
      version: 'GGUF HTTP Server',
      status: this.currentStatus,
    };
  }
}
