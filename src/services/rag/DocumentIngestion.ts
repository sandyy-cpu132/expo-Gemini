/**
 * DocumentIngestion
 * Handles file ingestion, text normalization, chunking, local vector embedding,
 * and indexing progress tracking.
 */

import { DocumentMetadata } from '../../types';
import { db } from '../database/SQLiteDatabase';
import { chunker } from './IntelligentChunker';
import { embeddingService } from './LocalEmbeddingService';

export interface IngestionProgress {
  stage: 'extracting' | 'chunking' | 'embedding' | 'saving' | 'completed' | 'error';
  progressPercentage: number;
  currentChunkIndex?: number;
  totalChunks?: number;
  message: string;
}

export class DocumentIngestion {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  /**
   * Ingests a text or uploaded document file into the local knowledge base.
   */
  public async ingestDocument(
    name: string,
    rawText: string,
    fileType: 'pdf' | 'txt' | 'md' | 'docx' | 'csv' | 'json' | 'code' = 'md',
    collectionId = 'coll-default',
    onProgress?: (p: IngestionProgress) => void
  ): Promise<DocumentMetadata> {
    this.isCancelled = false;

    // Stage 1: Extract & Normalize
    onProgress?.({
      stage: 'extracting',
      progressPercentage: 15,
      message: `Normalizing ${name}...`,
    });

    const normalizedText = rawText.trim();
    if (!normalizedText) {
      throw new Error('Document contains no extractable text');
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Stage 2: Chunking
    onProgress?.({
      stage: 'chunking',
      progressPercentage: 35,
      message: 'Generating semantic chunks...',
    });

    const chunks = chunker.chunkDocument(docId, normalizedText, {
      strategy: 'heading',
      chunkSize: 500,
      chunkOverlap: 80,
      preserveHeadings: true,
    });

    const totalChunks = chunks.length;

    // Stage 3: Embedding generation
    onProgress?.({
      stage: 'embedding',
      progressPercentage: 45,
      totalChunks,
      currentChunkIndex: 0,
      message: `Computing offline vector embeddings for ${totalChunks} chunks...`,
    });

    for (let i = 0; i < totalChunks; i++) {
      if (this.isCancelled) {
        throw new Error('Ingestion cancelled by user');
      }

      const chunk = chunks[i];
      const vector = await embeddingService.getEmbedding(chunk.content);
      chunk.embedding = vector;

      const progressPct = 45 + Math.round(((i + 1) / totalChunks) * 45);
      onProgress?.({
        stage: 'embedding',
        progressPercentage: progressPct,
        currentChunkIndex: i + 1,
        totalChunks,
        message: `Embedded chunk ${i + 1} of ${totalChunks}`,
      });
    }

    // Stage 4: Persist in SQLite
    onProgress?.({
      stage: 'saving',
      progressPercentage: 95,
      message: 'Saving document index to local database...',
    });

    const docMetadata: DocumentMetadata = {
      id: docId,
      collectionId,
      name,
      fileType,
      fileSize: new Blob([normalizedText]).size,
      pageCount: Math.ceil(normalizedText.length / 2500) || 1,
      chunkCount: totalChunks,
      indexedAt: Date.now(),
    };

    db.saveDocument(docMetadata, chunks);

    onProgress?.({
      stage: 'completed',
      progressPercentage: 100,
      message: `Successfully indexed ${name} (${totalChunks} chunks)`,
    });

    return docMetadata;
  }
}

export const documentIngestion = new DocumentIngestion();
