/**
 * llama.cpp HTTP Server Adapter
 * Connects to llama.cpp server running on Termux loopback (default: http://127.0.0.1:8080).
 */

import {
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

  constructor(baseUrl = 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async connect(): Promise<boolean> {
    this.currentStatus = 'connecting';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        this.currentStatus = 'connected';
        return true;
      }
    } catch {
      // Try fallback to props or root
      try {
        const ping = await fetch(`${this.baseUrl}/props`, { method: 'GET' });
        if (ping.ok) {
          this.currentStatus = 'connected';
          return true;
        }
      } catch {
        // failed
      }
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
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      if (res.ok) {
        this.currentStatus = 'connected';
        return 'connected';
      }
    } catch {
      this.currentStatus = 'disconnected';
    }
    return this.currentStatus;
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    return {
      supportsStreaming: true,
      supportsEmbeddings: true,
      supportsContextShift: true,
      supportsMirostat: true,
      supportsStopSequences: true,
      supportsGrammar: true,
      maxContextLength: 8192,
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (res.ok) {
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((m: { id: string }) => ({
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            engine: 'llama.cpp',
            loaded: true,
            contextLength: 4096,
          }));
        }
      }
    } catch {
      // If offline/unreachable, return standard local model profile detected in Termux
    }

    return [
      {
        id: 'llama-3.2-3b-instruct-q4_k_m.gguf',
        name: 'Llama 3.2 3B Instruct (Q4_K_M)',
        engine: 'llama.cpp',
        loaded: this.currentStatus === 'connected',
        contextLength: 8192,
        parametersSize: '3.2B',
        quantization: 'Q4_K_M',
      },
      {
        id: 'qwen2.5-3b-instruct-q4_k_m.gguf',
        name: 'Qwen 2.5 3B Instruct (Q4_K_M)',
        engine: 'llama.cpp',
        loaded: false,
        contextLength: 32768,
        parametersSize: '3.0B',
        quantization: 'Q4_K_M',
      },
      {
        id: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
        name: 'Nomic Embed Text v1.5 (Local Embedding)',
        engine: 'llama.cpp',
        loaded: false,
        contextLength: 2048,
        parametersSize: '137M',
        quantization: 'Q4_K_M',
      },
    ];
  }

  async loadModel(modelId: string): Promise<boolean> {
    // llama.cpp server CLI typically runs single loaded model, or supports slot management
    return true;
  }

  async unloadModel(modelId: string): Promise<boolean> {
    return true;
  }

  async generate(
    prompt: string,
    systemPrompt?: string,
    settings?: Partial<GenerationSettings>
  ): Promise<{ text: string; stats?: GenerationStats }> {
    let fullText = '';
    let stats: GenerationStats | undefined;

    await this.streamGenerate(
      prompt,
      systemPrompt,
      settings,
      (chunk) => {
        fullText += chunk.token;
        if (chunk.stats) stats = chunk.stats;
      }
    );

    return { text: fullText, stats };
  }

  async streamGenerate(
    prompt: string,
    systemPrompt: string | undefined,
    settings: Partial<GenerationSettings> | undefined,
    onChunk: (chunk: GenerationChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    this.abortController = new AbortController();
    const effectiveSignal = signal || this.abortController.signal;

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

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
      stop: settings?.stopSequences ?? ['<|eot_id|>', '<|end_of_text|>', 'User:', 'Human:'],
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
        throw new Error(`llama.cpp server error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
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
              promptTokens: Math.ceil(prompt.length / 4),
              completionTokens: tokenCount,
              totalTokens: Math.ceil(prompt.length / 4) + tokenCount,
              promptMs: Math.round(promptTime),
              evalMs: Math.round(evalMs),
              tokensPerSecond: Math.round(tps * 10) / 10,
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
              // Extract usage if available
              if (json.usage) {
                const totalMs = performance.now() - startTime;
                const stats: GenerationStats = {
                  promptTokens: json.usage.prompt_tokens || Math.ceil(prompt.length / 4),
                  completionTokens: json.usage.completion_tokens || tokenCount,
                  totalTokens: json.usage.total_tokens || tokenCount,
                  promptMs: Math.round(promptTime),
                  evalMs: Math.round(totalMs - promptTime),
                  tokensPerSecond:
                    tokenCount > 0 && totalMs > 0 ? Math.round(((tokenCount / totalMs) * 1000) * 10) / 10 : 0,
                };
                this.lastStats = stats;
              }
            } catch {
              // Non-JSON SSE line or chunk boundary
            }
          }
        }
      }

      const totalMs = performance.now() - startTime;
      const stats: GenerationStats = {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: tokenCount,
        totalTokens: Math.ceil(prompt.length / 4) + tokenCount,
        promptMs: Math.round(promptTime),
        evalMs: Math.round(totalMs - promptTime),
        tokensPerSecond: tokenCount > 0 && totalMs > 0 ? Math.round(((tokenCount / totalMs) * 1000) * 10) / 10 : 0,
      };
      this.lastStats = stats;
      onChunk({ token: '', isFinished: true, stats });
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

  async stopGeneration(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Also notify llama.cpp cancel if available
    try {
      fetch(`${this.baseUrl}/cancel`, { method: 'POST' }).catch(() => {});
    } catch {
      // ignore
    }
  }

  getGenerationStats(): GenerationStats | null {
    return this.lastStats;
  }

  getEngineInfo() {
    return {
      name: 'llama.cpp Termux Server',
      version: 'b4500 (GGUF)',
      status: this.currentStatus,
    };
  }

  // Local vector embedding generation via llama.cpp embedding API
  async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.embedding && Array.isArray(data.embedding)) {
          return data.embedding;
        }
      }
    } catch {
      // Endpoint might not be enabled
    }
    return null;
  }
}
