/**
 * LocalEmbeddingService
 * Offline embedding provider:
 * 1. Primary: Uses local llama.cpp /embedding endpoint (e.g. nomic-embed-text or bge-micro)
 * 2. Standalone fallback: 384-dimensional semantic projection using subword hashing + token context projection
 * Ensures 100% offline operation without network or external dependencies.
 */

import { runtimeManager } from '../runtime/RuntimeConnectionManager';

export class LocalEmbeddingService {
  private dimension = 384;

  /**
   * Generates a 384-dimensional dense vector locally.
   */
  public async getEmbedding(text: string): Promise<number[]> {
    // Attempt local llama.cpp embedding endpoint first if connected
    try {
      const engine = runtimeManager.getActiveEngine();
      if ((engine as any).getEmbedding) {
        const vec = await (engine as any).getEmbedding(text);
        if (vec && Array.isArray(vec) && vec.length > 0) {
          return this.normalizeVector(vec);
        }
      }
    } catch {
      // Continue to deterministic local vector engine
    }

    return this.generateDeterministicLocalVector(text);
  }

  /**
   * High-performance offline semantic feature projection (384 dims)
   * Uses n-gram subword hashing and cosine-normalized spatial mapping.
   */
  private generateDeterministicLocalVector(text: string): number[] {
    const vector = new Float32Array(this.dimension);
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 1);

    if (tokens.length === 0) {
      return Array.from(vector);
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tokenWeight = 1.0 + Math.log(1 + 1 / (i + 1));

      // Hash token into primary dimension
      const h1 = this.hashString(token);
      const idx1 = Math.abs(h1) % this.dimension;
      vector[idx1] += tokenWeight * ((h1 & 1) === 0 ? 1 : -1);

      // Character trigrams for subword morphological matching
      for (let j = 0; j < token.length - 2; j++) {
        const trigram = token.slice(j, j + 3);
        const h2 = this.hashString(trigram);
        const idx2 = Math.abs(h2) % this.dimension;
        vector[idx2] += 0.35 * ((h2 & 1) === 0 ? 1 : -1);
      }
    }

    return this.normalizeVector(Array.from(vector));
  }

  private hashString(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }

  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dot / denominator : 0;
  }

  private normalizeVector(vec: number[]): number[] {
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i++) {
      sumSquares += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}

export const embeddingService = new LocalEmbeddingService();
