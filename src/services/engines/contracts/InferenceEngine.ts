/**
 * Inference Engine Abstraction Contract
 * Decouples chat UI and RAG logic from backend engine implementations (llama.cpp / Prism ML).
 */

import {
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
  loadModel(modelId: string): Promise<boolean>;
  unloadModel(modelId: string): Promise<boolean>;
  
  generate(
    prompt: string,
    systemPrompt?: string,
    settings?: Partial<GenerationSettings>
  ): Promise<{ text: string; stats?: GenerationStats }>;

  streamGenerate(
    prompt: string,
    systemPrompt: string | undefined,
    settings: Partial<GenerationSettings> | undefined,
    onChunk: (chunk: GenerationChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;

  stopGeneration(): Promise<void>;
  getGenerationStats(): GenerationStats | null;
  getEngineInfo(): { name: string; version: string; status: EngineStatus };
}
