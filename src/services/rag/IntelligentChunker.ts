/**
 * IntelligentChunker
 * Character-based chunking with CHUNK_CHARS = 1200, CHUNK_OVERLAP_CHARS = 200.
 * Splits preferentially on Markdown headings and blank lines.
 */

import { DocumentChunk } from '../../types';

export const CHUNK_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 200;

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export class IntelligentChunker {
  public chunkDocument(
    documentId: string,
    rawText: string,
    options?: ChunkingOptions
  ): DocumentChunk[] {
    const size = options?.chunkSize ?? CHUNK_CHARS;
    const overlap = options?.chunkOverlap ?? CHUNK_OVERLAP_CHARS;

    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');

    // Group text by heading sections first
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

      if (sectionText.length <= size) {
        resultChunks.push({
          id: `${documentId}-chk-${chunkIndex}`,
          documentId,
          chunkIndex,
          content: sectionText,
          tokenCount: Math.ceil(sectionText.length / 4),
          sectionHeader: section.header,
        });
        chunkIndex++;
      } else {
        // Split section on blank lines or sentences with overlap
        let start = 0;
        while (start < sectionText.length) {
          let end = Math.min(start + size, sectionText.length);

          if (end < sectionText.length) {
            // Find preferred break: double newline, then newline, then sentence period
            const doubleNl = sectionText.lastIndexOf('\n\n', end);
            if (doubleNl > start + size * 0.5) {
              end = doubleNl + 2;
            } else {
              const singleNl = sectionText.lastIndexOf('\n', end);
              if (singleNl > start + size * 0.5) {
                end = singleNl + 1;
              } else {
                const period = sectionText.lastIndexOf('. ', end);
                if (period > start + size * 0.5) {
                  end = period + 2;
                }
              }
            }
          }

          const chunkText = sectionText.slice(start, end).trim();
          if (chunkText.length > 20) {
            resultChunks.push({
              id: `${documentId}-chk-${chunkIndex}`,
              documentId,
              chunkIndex,
              content: chunkText,
              tokenCount: Math.ceil(chunkText.length / 4),
              sectionHeader: section.header,
            });
            chunkIndex++;
          }

          if (end >= sectionText.length) break;
          start = Math.max(start + 1, end - overlap);
        }
      }
    }

    return resultChunks;
  }
}

export const chunker = new IntelligentChunker();
