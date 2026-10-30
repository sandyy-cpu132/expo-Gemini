/**
 * Inference Engine Abstraction Contract
 * Decouples chat UI and RAG logic from backend engine implementations.
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

export interface GenerationChunk {
  token: string;
  isFinished: boolean;
  stats?: GenerationStats;
}

export interface InferenceEngine {
  readonly engineType: EngineType;
  readonly baseUrl: string;

  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getStatus(): Promise<EngineStatus>;
  getCapabilities(): Promise<EngineCapabilities>;
  getModels(): Promise<ModelInfo[]>;

  generate(
    messages: ChatMessage[],
    settings?: Partial<GenerationSettings>
  ): Promise<{ text: string; stats?: GenerationStats }>;

  streamGenerate(
    messages: ChatMessage[],
    settings: Partial<GenerationSettings> | undefined,
    onChunk: (chunk: GenerationChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;

  stopGeneration(): void;
  getGenerationStats(): GenerationStats | null;
  getEngineInfo(): { name: string; version: string; status: EngineStatus };
}
