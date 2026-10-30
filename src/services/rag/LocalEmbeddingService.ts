/**
 * LocalEmbeddingService
 * Dedicated offline embedding client connecting to local embedding server on 127.0.0.1:8081.
 * Throws or returns an error when the embedding server is unavailable unless keyword-hash is explicitly enabled.
 */

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dim: number;
}

export class LocalEmbeddingService {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8081') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Fetches real dense embedding vector from local llama-server on port 8081.
   * If allowKeywordFallback is true and server is offline, computes a deterministic keyword-hash-384 vector.
   */
  public async getEmbedding(
    text: string,
    options?: { allowKeywordFallback?: boolean }
  ): Promise<EmbeddingResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${this.baseUrl}/embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const rawVec: number[] = data.embedding || data.data?.[0]?.embedding;
        if (Array.isArray(rawVec) && rawVec.length > 0) {
          const norm = this.normalizeVector(rawVec);
          return {
            vector: norm,
            model: 'nomic-embed-text-v1.5',
            dim: norm.length,
          };
        }
      }
    } catch {
      // Embedding server unavailable
    }

    if (options?.allowKeywordFallback) {
      const hashVec = this.generateKeywordHashVector(text);
      return {
        vector: hashVec,
        model: 'keyword-hash-384',
        dim: 384,
      };
    }

    throw new Error(
      'Embedding server on 127.0.0.1:8081 is unreachable. Start the embedding instance or enable keyword-hash fallback in Settings.'
    );
  }

  /**
   * Deterministic 384-dimensional keyword and subword feature hash (fallback mode only).
   */
  public generateKeywordHashVector(text: string): number[] {
    const dim = 384;
    const vector = new Float32Array(dim);
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 1);

    if (tokens.length === 0) return Array.from(vector);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const weight = 1.0 + Math.log(1 + 1 / (i + 1));
      let h1 = 0x811c9dc5;
      for (let c = 0; c < token.length; c++) {
        h1 ^= token.charCodeAt(c);
        h1 = Math.imul(h1, 0x01000193);
      }
      const idx1 = Math.abs(h1) % dim;
      vector[idx1] += weight * ((h1 & 1) === 0 ? 1 : -1);
    }

    return this.normalizeVector(Array.from(vector));
  }

  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      if (__DEV__) {
        throw new Error(
          `Dimension mismatch in cosineSimilarity: vector A has ${vecA.length} dims, vector B has ${vecB.length} dims.`
        );
      } else {
        console.warn(`Dimension mismatch: ${vecA.length} vs ${vecB.length}`);
        return 0;
      }
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  private normalizeVector(vec: number[]): number[] {
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) {
      sumSq += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}

export const embeddingService = new LocalEmbeddingService();
