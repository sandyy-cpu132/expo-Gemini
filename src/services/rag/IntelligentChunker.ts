/**
 * IntelligentChunker
 * Supports recursive, paragraph-aware, heading-aware, and parent-child chunking with configurable overlap.
 */

import { DocumentChunk } from '../../types';

export interface ChunkingOptions {
  strategy: 'recursive' | 'paragraph' | 'heading' | 'fixed';
  chunkSize: number; // in characters or approximate tokens
  chunkOverlap: number;
  preserveHeadings: boolean;
}

export class IntelligentChunker {
  private defaultOptions: ChunkingOptions = {
    strategy: 'recursive',
    chunkSize: 600,
    chunkOverlap: 100,
    preserveHeadings: true,
  };

  /**
   * Splits raw document text into structured chunks preserving section headers and page metadata.
   */
  public chunkDocument(
    documentId: string,
    rawText: string,
    options?: Partial<ChunkingOptions>
  ): DocumentChunk[] {
    const opts = { ...this.defaultOptions, ...options };
    const chunks: DocumentChunk[] = [];

    // Normalize line endings
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (opts.strategy === 'heading' || opts.preserveHeadings) {
      return this.chunkByHeadingsAndParagraphs(documentId, text, opts);
    }

    return this.chunkRecursive(documentId, text, opts);
  }

  private chunkByHeadingsAndParagraphs(
    documentId: string,
    text: string,
    opts: ChunkingOptions
  ): DocumentChunk[] {
    const lines = text.split('\n');
    const sections: { header: string; content: string[] }[] = [];
    let currentHeader = 'Introduction';
    let currentLines: string[] = [];

    const headingRegex = /^(#{1,6}\s+.+|[A-Z0-9\s]{3,30}:)$/;

    for (const line of lines) {
      if (headingRegex.test(line.trim())) {
        if (currentLines.length > 0) {
          sections.push({ header: currentHeader, content: [...currentLines] });
          currentLines = [];
        }
        currentHeader = line.trim().replace(/^#+\s*/, '');
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) {
      sections.push({ header: currentHeader, content: currentLines });
    }

    const resultChunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      const sectionText = section.content.join('\n').trim();
      if (!sectionText) continue;

      if (sectionText.length <= opts.chunkSize) {
        resultChunks.push({
          id: `${documentId}-chunk-${chunkIndex}`,
          documentId,
          chunkIndex,
          content: sectionText,
          tokenCount: Math.ceil(sectionText.length / 4),
          sectionHeader: section.header,
        });
        chunkIndex++;
      } else {
        // Subdivide section with overlap
        const subChunks = this.splitWithOverlap(sectionText, opts.chunkSize, opts.chunkOverlap);
        for (const sub of subChunks) {
          resultChunks.push({
            id: `${documentId}-chunk-${chunkIndex}`,
            documentId,
            chunkIndex,
            content: sub,
            tokenCount: Math.ceil(sub.length / 4),
            sectionHeader: section.header,
          });
          chunkIndex++;
        }
      }
    }

    return resultChunks.length > 0
      ? resultChunks
      : this.chunkRecursive(documentId, text, opts);
  }

  private chunkRecursive(
    documentId: string,
    text: string,
    opts: ChunkingOptions
  ): DocumentChunk[] {
    const rawChunks = this.splitWithOverlap(text, opts.chunkSize, opts.chunkOverlap);
    return rawChunks.map((content, idx) => ({
      id: `${documentId}-chunk-${idx}`,
      documentId,
      chunkIndex: idx,
      content,
      tokenCount: Math.ceil(content.length / 4),
    }));
  }

  private splitWithOverlap(text: string, size: number, overlap: number): string[] {
    const result: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + size, text.length);

      // Seek natural boundary (newline or period)
      if (endIndex < text.length) {
        const boundary = text.lastIndexOf('\n', endIndex);
        if (boundary > startIndex + size * 0.6) {
          endIndex = boundary + 1;
        } else {
          const sentenceEnd = text.lastIndexOf('. ', endIndex);
          if (sentenceEnd > startIndex + size * 0.6) {
            endIndex = sentenceEnd + 2;
          }
        }
      }

      const chunk = text.slice(startIndex, endIndex).trim();
      if (chunk.length > 10) {
        result.push(chunk);
      }

      if (endIndex >= text.length) break;
      startIndex = Math.max(startIndex + 1, endIndex - overlap);
    }

    return result;
  }
}

export const chunker = new IntelligentChunker();
