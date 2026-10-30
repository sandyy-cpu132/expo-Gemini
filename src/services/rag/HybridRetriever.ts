/**
 * HybridRetriever
 * Combines dense cosine similarity with BM25 lexical keyword scoring.
 * Enforces matching embedding_model and embedding_dim to prevent silent dimension mismatch errors.
 * Merges scores using Reciprocal Rank Fusion (RRF).
 */

import { getAllChunks } from '../database/db';
import { embeddingService, EmbeddingResult } from './LocalEmbeddingService';

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

export interface RetrievalResponse {
  results: RetrievalResult[];
  status: 'ok' | 'no-matching-model' | 'empty-knowledge-base' | 'embedding-offline';
  message?: string;
}

export interface RetrievalOptions {
  topK?: number;
  minRelevanceScore?: number;
  collectionIds?: string[];
  allowKeywordFallback?: boolean;
}

export class HybridRetriever {
  private k1 = 1.2;
  private b = 0.75;

  public async retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResponse> {
    const topK = options?.topK ?? 4;
    const minScore = options?.minRelevanceScore ?? 0.15;

    const allRecords = await getAllChunks(options?.collectionIds);
    if (allRecords.length === 0) {
      return { results: [], status: 'empty-knowledge-base', message: 'No documents indexed in this collection.' };
    }

    // 1. Obtain query embedding
    let queryEmbedding: EmbeddingResult;
    try {
      queryEmbedding = await embeddingService.getEmbedding(query, {
        allowKeywordFallback: options?.allowKeywordFallback,
      });
    } catch (err: any) {
      return {
        results: [],
        status: 'embedding-offline',
        message: err.message || 'Embedding server offline on 127.0.0.1:8081',
      };
    }

    // 2. Filter candidates matching model and dimensions
    const validCandidates = allRecords.filter((r) => {
      const chunkModel = r.chunk.embedding_model || 'nomic-embed-text-v1.5';
      const chunkDim = r.chunk.embedding_dim || 384;
      return (
        chunkModel === queryEmbedding.model &&
        chunkDim === queryEmbedding.dim &&
        r.chunk.embedding &&
        r.chunk.embedding.length === queryEmbedding.dim
      );
    });

    if (validCandidates.length === 0) {
      return {
        results: [],
        status: 'no-matching-model',
        message: `Indexed chunks use a different embedding model than the current query model (${queryEmbedding.model}). Please re-index.`,
      };
    }

    // 3. Precompute BM25
    const queryTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const totalDocs = validCandidates.length;
    let totalLength = 0;
    const docTokenFreqs: Map<string, number>[] = [];
    const docLengths: number[] = [];
    const docFreq: Map<string, number> = new Map();

    for (let i = 0; i < totalDocs; i++) {
      const tokens = validCandidates[i].chunk.content
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);
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

    // 4. Compute Dense & Sparse Scores
    const scoredChunks: Array<{ record: (typeof validCandidates)[0]; denseScore: number; bm25Score: number }> = [];

    for (let i = 0; i < totalDocs; i++) {
      const record = validCandidates[i];
      const dense = embeddingService.cosineSimilarity(queryEmbedding.vector, record.chunk.embedding!);

      // BM25
      let bm25 = 0;
      const tf = docTokenFreqs[i];
      const len = docLengths[i];

      for (const term of queryTokens) {
        const count = tf.get(term) || 0;
        if (count > 0) {
          const df = docFreq.get(term) || 0;
          const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
          const num = count * (this.k1 + 1);
          const denom = count + this.k1 * (1 - this.b + this.b * (len / avgDocLength));
          bm25 += idf * (num / denom);
        }
      }

      scoredChunks.push({
        record,
        denseScore: Math.max(0, dense),
        bm25Score: bm25,
      });
    }

    // Rank with Reciprocal Rank Fusion (RRF)
    const denseRanked = [...scoredChunks].sort((a, b) => b.denseScore - a.denseScore);
    const bm25Ranked = [...scoredChunks].sort((a, b) => b.bm25Score - a.bm25Score);

    const rrfScores = new Map<string, number>();
    const kRRF = 60;

    denseRanked.forEach((item, rank) => {
      const id = item.record.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) || 0) + 1 / (kRRF + rank + 1));
    });

    bm25Ranked.forEach((item, rank) => {
      const id = item.record.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) || 0) + 1 / (kRRF + rank + 1));
    });

    const finalResults: RetrievalResult[] = scoredChunks
      .map((item) => {
        const id = item.record.chunk.id;
        const rrf = rrfScores.get(id) || 0;
        const normalizedScore = Math.min(1.0, rrf * 30);
        return {
          chunkId: id,
          documentId: item.record.chunk.documentId,
          documentName: item.record.docName,
          content: item.record.chunk.content,
          sectionHeader: item.record.chunk.sectionHeader,
          pageNumber: item.record.chunk.pageNumber,
          denseScore: Math.round(item.denseScore * 1000) / 1000,
          bm25Score: Math.round(item.bm25Score * 100) / 100,
          combinedScore: Math.round(normalizedScore * 1000) / 1000,
        };
      })
      .filter((r) => r.combinedScore >= minScore)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return {
      results: finalResults,
      status: 'ok',
    };
  }
}

export const retriever = new HybridRetriever();
