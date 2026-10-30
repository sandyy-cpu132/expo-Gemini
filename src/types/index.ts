/**
 * Domain Types for CloverPal Offline AI Client
 * Strictly offline, zero cloud API dependencies.
 */

export type EngineType = 'llama.cpp' | 'prism-ml';

export type EngineStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface EngineCapabilities {
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  supportsContextShift: boolean;
  supportsMirostat: boolean;
  supportsStopSequences: boolean;
  supportsGrammar: boolean;
  maxContextLength?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  engine: EngineType;
  loaded: boolean;
  contextLength?: number;
  parametersSize?: string;
  quantization?: string;
}

export interface GenerationSettings {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  contextLength: number;
  seed: number;
  stopSequences: string[];
  mirostat: 0 | 1 | 2;
  streaming: boolean;
  responseMode: ResponseFormattingMode;
}

export type ResponseFormattingMode =
  | 'automatic'
  | 'concise'
  | 'detailed'
  | 'markdown'
  | 'tables'
  | 'step-by-step'
  | 'technical'
  | 'coding'
  | 'analytical'
  | 'academic'
  | 'report'
  | 'comparison'
  | 'structured-json'
  | 'mathematical';

export interface GenerationStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptMs: number;
  evalMs: number;
  tokensPerSecond: number;
  isEstimated?: boolean;
}

export interface Citation {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  sectionHeader?: string;
  excerpt: string;
  relevanceScore: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'user' | 'assistant' | 'system';
  senderId?: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  citations?: Citation[];
  formatMode?: ResponseFormattingMode;
  stats?: GenerationStats;
  createdAt: number;
  status?: 'sending' | 'streaming' | 'complete' | 'interrupted' | 'error';
}

export interface CharacterCard {
  id: string;
  name: string;
  tagline: string;
  description: string;
  avatarKey: string;
  personality: string;
  systemPrompt: string;
  greetingMessage: string;
  exampleDialogue: string;
  category: string;
  responseMode: ResponseFormattingMode;
  memoryScope: 'private' | 'shared';
  createdAt: number;
}

export interface GroupChat {
  id: string;
  name: string;
  description: string;
  characterIds: string[];
  turnMode: 'round-robin' | 'auto-moderated' | 'manual-mention';
  activeCharacterId?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  characterId?: string;
  groupId?: string;
  engine: EngineType;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  systemPromptOverride?: string;
  summary?: string;
  activeCollectionIds?: string[];
}

export interface DocumentCollection {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface DocumentMetadata {
  id: string;
  collectionId: string;
  name: string;
  fileType: 'txt' | 'md' | 'csv' | 'json' | 'code';
  fileSize: number;
  pageCount?: number;
  chunkCount: number;
  indexedAt: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  embedding_model?: string;
  embedding_dim?: number;
  tokenCount: number;
  pageNumber?: number;
  sectionHeader?: string;
}

export interface PersonalMemory {
  id: string;
  category: 'preference' | 'bio' | 'project' | 'fact' | 'instruction';
  content: string;
  importance: 1 | 2 | 3 | 4 | 5;
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TermuxRuntimeConfig {
  llamaBaseUrl: string;
  embeddingBaseUrl: string;
  prismBaseUrl: string;
  selectedEngine: EngineType;
  autoConnectOnLaunch: boolean;
  runCommandPath: string;
  termuxServiceScript: string;
  healthCheckIntervalMs: number;
  maxRetries: number;
}

export interface RuntimeDiagnostics {
  termuxAppInstalled: boolean;
  termuxRunCommandPermission: boolean;
  llamaStatus: EngineStatus;
  llamaLatencyMs: number | null;
  embeddingServerStatus: EngineStatus;
  embeddingLatencyMs: number | null;
  prismStatus: EngineStatus;
  prismLatencyMs: number | null;
  activePort: number;
  lastCheckedAt: number;
  errorDetails?: string;
}
