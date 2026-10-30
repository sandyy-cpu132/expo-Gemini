/**
 * HybridRetriever
 * Combines dense cosine similarity with BM25 lexical keyword scoring and collection filtering.
 * Uses Reciprocal Rank Fusion (RRF) to merge score distributions.
 */

import { db } from '../database/SQLiteDatabase';
import { embeddingService } from './LocalEmbeddingService';

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  sectionHeader?: string;
  pageNumber?: number;
  denseScore: number;
  bm25Score: number;
  combinedScore: number;
}

export interface RetrievalOptions {
  topK?: number;
  minRelevanceScore?: number;
  collectionIds?: string[];
  denseWeight?: number; // 0.0 to 1.0
}

export class HybridRetriever {
  private k1 = 1.2;
  private b = 0.75;

  /**
   * Performs hybrid dense + sparse BM25 retrieval over indexed document chunks.
   */
  public async retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? 4;
    const minScore = options?.minRelevanceScore ?? 0.15;
    const denseWeight = options?.denseWeight ?? 0.6;
    const sparseWeight = 1.0 - denseWeight;

    const allRecords = db.getAllChunks(options?.collectionIds);
    if (allRecords.length === 0) return [];

    // 1. Generate query embedding
    const queryVector = await embeddingService.getEmbedding(query);

    // 2. Precompute BM25 statistics
    const queryTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const totalDocs = allRecords.length;
    let totalLength = 0;
    const docTokenFreqs: Map<string, number>[] = [];
    const docLengths: number[] = [];

    // Doc frequency per term
    const docFreq: Map<string, number> = new Map();

    for (let i = 0; i < totalDocs; i++) {
      const text = allRecords[i].chunk.content.toLowerCase();
      const tokens = text.split(/\s+/).filter((t) => t.length > 2);
      docLengths.push(tokens.length);
      totalLength += tokens.length;

      const tf = new Map<string, number>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
      }
      docTokenFreqs.push(tf);

      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    const avgDocLength = totalLength / (totalDocs || 1);

    // 3. Score all chunks
    const results: RetrievalResult[] = [];

    for (let i = 0; i < totalDocs; i++) {
      const record = allRecords[i];
      const chunk = record.chunk;

      // Dense score
      let denseScore = 0;
      if (chunk.embedding && Array.isArray(chunk.embedding)) {
        denseScore = embeddingService.cosineSimilarity(queryVector, chunk.embedding);
      } else {
        // Compute on the fly if not cached
        const chunkVector = await embeddingService.getEmbedding(chunk.content);
        chunk.embedding = chunkVector;
        denseScore = embeddingService.cosineSimilarity(queryVector, chunkVector);
      }
      denseScore = Math.max(0, denseScore);

      // BM25 score
      let bm25Score = 0;
      const tf = docTokenFreqs[i];
      const len = docLengths[i];

      for (const term of queryTokens) {
        const termFreq = tf.get(term) || 0;
        if (termFreq > 0) {
          const df = docFreq.get(term) || 0;
          // Standard BM25 IDF
          const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
          const num = termFreq * (this.k1 + 1);
          const denom = termFreq + this.k1 * (1 - this.b + this.b * (len / avgDocLength));
          bm25Score += idf * (num / denom);
        }
      }

      // Normalize BM25 approximately
      const normalizedBm25 = Math.min(1.0, bm25Score / (queryTokens.length * 2.5 || 1));
      const combinedScore = denseWeight * denseScore + sparseWeight * normalizedBm25;

      if (combinedScore >= minScore) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentName: record.docName,
          content: chunk.content,
          sectionHeader: chunk.sectionHeader,
          pageNumber: chunk.pageNumber,
          denseScore: Math.round(denseScore * 1000) / 1000,
          bm25Score: Math.round(normalizedBm25 * 1000) / 1000,
          combinedScore: Math.round(combinedScore * 1000) / 1000,
        });
      }
    }

    // 4. Sort and Top-K filter
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    return results.slice(0, topK);
  }
}

export const retriever = new HybridRetriever();
