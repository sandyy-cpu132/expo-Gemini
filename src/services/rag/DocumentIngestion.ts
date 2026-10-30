/**
 * DocumentIngestion & FileTextExtractor
 * Reads .txt, .md, .csv, .json, and code files via expo-file-system, chunks with IntelligentChunker,
 * computes offline embeddings on port 8081, and stores in SQLite.
 */

import * as FileSystem from 'expo-file-system';
import { DocumentMetadata } from '../../types';
import { saveDocument } from '../database/db';
import { chunker } from './IntelligentChunker';
import { embeddingService } from './LocalEmbeddingService';

export interface IngestionProgress {
  stage: 'extracting' | 'chunking' | 'embedding' | 'saving' | 'completed' | 'error';
  progressPercentage: number;
  currentChunkIndex?: number;
  totalChunks?: number;
  message: string;
}

export class FileTextExtractor {
  public static async extractFromFile(
    uri: string,
    filename: string
  ): Promise<{ text: string; fileType: 'txt' | 'md' | 'csv' | 'json' | 'code' }> {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    if (['pdf', 'docx', 'doc', 'zip', 'tar', 'bin', 'exe', 'png', 'jpg'].includes(ext)) {
      throw new Error(`Binary file type .${ext} is not supported. Use text, markdown, CSV, JSON, or code files.`);
    }

    let fileType: 'txt' | 'md' | 'csv' | 'json' | 'code' = 'txt';
    if (ext === 'md') fileType = 'md';
    else if (ext === 'csv') fileType = 'csv';
    else if (ext === 'json') fileType = 'json';
    else if (['js', 'ts', 'tsx', 'jsx', 'py', 'c', 'cpp', 'rs', 'go', 'java', 'kt', 'sh', 'html', 'css'].includes(ext)) {
      fileType = 'code';
    }

    const text = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (!text || text.trim().length === 0) {
      throw new Error('File is empty or contains no readable text.');
    }

    return { text, fileType };
  }
}

export class DocumentIngestion {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  public async ingestDocument(
    name: string,
    rawText: string,
    fileType: 'txt' | 'md' | 'csv' | 'json' | 'code' = 'md',
    collectionId = 'coll-default',
    allowKeywordFallback = false,
    onProgress?: (p: IngestionProgress) => void
  ): Promise<DocumentMetadata> {
    this.isCancelled = false;

    // Stage 1: Normalize
    onProgress?.({
      stage: 'extracting',
      progressPercentage: 10,
      message: `Processing ${name}...`,
    });

    const normalizedText = rawText.trim();
    if (!normalizedText) {
      throw new Error('Document contains no extractable text');
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Stage 2: Chunking (character based 1200 / 200)
    onProgress?.({
      stage: 'chunking',
      progressPercentage: 30,
      message: 'Generating chunks...',
    });

    const chunks = chunker.chunkDocument(docId, normalizedText);
    const totalChunks = chunks.length;

    // Stage 3: Offline Embedding Generation
    onProgress?.({
      stage: 'embedding',
      progressPercentage: 40,
      totalChunks,
      currentChunkIndex: 0,
      message: `Embedding ${totalChunks} chunks on local server...`,
    });

    for (let i = 0; i < totalChunks; i++) {
      if (this.isCancelled) {
        throw new Error('Ingestion cancelled by user');
      }

      const chunk = chunks[i];
      const embResult = await embeddingService.getEmbedding(chunk.content, {
        allowKeywordFallback,
      });

      chunk.embedding = embResult.vector;
      chunk.embedding_model = embResult.model;
      chunk.embedding_dim = embResult.dim;

      const progressPct = 40 + Math.round(((i + 1) / totalChunks) * 50);
      onProgress?.({
        stage: 'embedding',
        progressPercentage: progressPct,
        currentChunkIndex: i + 1,
        totalChunks,
        message: `Embedded chunk ${i + 1} of ${totalChunks} (${embResult.model})`,
      });
    }

    // Stage 4: SQLite Transaction Save
    onProgress?.({
      stage: 'saving',
      progressPercentage: 95,
      message: 'Saving to SQLite database...',
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

    await saveDocument(docMetadata, chunks);

    onProgress?.({
      stage: 'completed',
      progressPercentage: 100,
      message: `Successfully indexed ${name} (${totalChunks} chunks)`,
    });

    return docMetadata;
  }
}

export const documentIngestion = new DocumentIngestion();
