/**
 * KnowledgeBaseScreen
 * Manages local RAG documents, collections, document ingestion with real-time progress,
 * chunk inspector, and hybrid retrieval search tester.
 */

import React, { useState } from 'react';
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  Search,
  Layers,
  Database,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  Code2,
  Sparkles,
} from 'lucide-react';
import { DocumentChunk, DocumentMetadata } from '../../types';
import { db } from '../../services/database/SQLiteDatabase';
import { documentIngestion, IngestionProgress } from '../../services/rag/DocumentIngestion';
import { retriever, RetrievalResult } from '../../services/rag/HybridRetriever';

export const KnowledgeBaseScreen: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentMetadata[]>(db.getDocuments());
  const [selectedDocId, setSelectedDocId] = useState<string | null>(documents[0]?.id || null);
  const [chunks, setChunks] = useState<DocumentChunk[]>(
    selectedDocId ? db.getChunksByDocumentId(selectedDocId) : []
  );

  // Ingestion Modal State
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docType, setDocType] = useState<'md' | 'txt' | 'pdf' | 'code'>('md');
  const [ingestionProgress, setIngestionProgress] = useState<IngestionProgress | null>(null);

  // Search Tester State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RetrievalResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSelectDoc = (docId: string) => {
    setSelectedDocId(docId);
    setChunks(db.getChunksByDocumentId(docId));
  };

  const handleDeleteDoc = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this document and all its indexed chunks?')) {
      db.deleteDocument(docId);
      const updated = db.getDocuments();
      setDocuments(updated);
      if (selectedDocId === docId) {
        setSelectedDocId(updated[0]?.id || null);
        setChunks(updated[0] ? db.getChunksByDocumentId(updated[0].id) : []);
      }
    }
  };

  const handleStartIngest = async () => {
    if (!docName.trim() || !docContent.trim()) return;

    try {
      await documentIngestion.ingestDocument(
        docName.trim(),
        docContent,
        docType,
        'coll-default',
        (prog) => setIngestionProgress(prog)
      );

      const updated = db.getDocuments();
      setDocuments(updated);
      setSelectedDocId(updated[0].id);
      setChunks(db.getChunksByDocumentId(updated[0].id));

      setTimeout(() => {
        setShowIngestModal(false);
        setIngestionProgress(null);
        setDocName('');
        setDocContent('');
      }, 1200);
    } catch (err: any) {
      alert(`Ingestion error: ${err.message}`);
      setIngestionProgress(null);
    }
  };

  const handleSampleDoc = (preset: 'termux' | 'offline_rag') => {
    if (preset === 'termux') {
      setDocName('Termux_Kernel_Guide.md');
      setDocType('md');
      setDocContent(`# Termux and Android Kernel Architecture for Offline AI

Termux operates in Android user-space under an isolated UID Sandbox assigned by Android OS.
The root filesystem is positioned at \`/data/data/com.termux/files/usr\`.

## RUN_COMMAND Intent Protocol
Android applications communicate with Termux using the service intent:
- Action: \`com.termux.RUN_COMMAND\`
- Service: \`com.termux.app.RunCommandService\`
- Extra \`com.termux.RUN_COMMAND_PATH\`: Path to executable (/data/data/com.termux/files/usr/bin/bash)
- Extra \`com.termux.RUN_COMMAND_ARGUMENTS\`: String array containing script arguments
- Extra \`com.termux.RUN_COMMAND_BACKGROUND\`: Boolean (true runs without launching interactive terminal)

## Threading & Memory Locking
To achieve minimum latency on mobile ARM64 CPUs (such as Snapdragon 8 Gen 2 / 8 Gen 3):
- Use 4 threads for 4 performance cores.
- Enable mlock to pin GGUF weights in physical RAM to prevent Android LMK (Low Memory Killer) paging.
- Bind the loopback socket to 127.0.0.1:8080.`);
    } else {
      setDocName('Local_RAG_Theory.md');
      setDocType('md');
      setDocContent(`# Hybrid Retrieval Principles in Offline AI Systems

A state-of-the-art offline RAG system integrates both dense vector representation and sparse lexical matching.

## Dense Cosine Similarity
Given a query vector $q \\in \\mathbb{R}^d$ and a chunk vector $c \\in \\mathbb{R}^d$, dense similarity evaluates the semantic angle:
$$\\text{sim}(q, c) = \\frac{\\sum_{i=1}^d q_i c_i}{\\sqrt{\\sum_{i=1}^d q_i^2} \\sqrt{\\sum_{i=1}^d c_i^2}}$$

## BM25 Sparse Ranking
BM25 rewards exact keyword matches while normalizing for document length:
$$\\text{BM25}(q, D) = \\sum_{t \\in q} \\text{IDF}(t) \\cdot \\frac{f(t, D) \\cdot (k_1 + 1)}{f(t, D) + k_1 \\cdot (1 - b + b \\cdot \\frac{|D|}{\\text{avgdl}})}$$

## Reciprocal Rank Fusion
Results from both pipelines are merged using RRF or linear weighting to prevent semantic drift.`);
    }
  };

  const handleRunSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await retriever.retrieve(searchQuery, {
        topK: 4,
        minRelevanceScore: 0.1,
      });
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Knowledge Base & RAG
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fully local document parsing, vector embeddings & BM25 hybrid retrieval
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowIngestModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Ingest Document</span>
        </button>
      </div>

      {/* Interactive Hybrid Search Tester */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Search className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Test Local Hybrid Retrieval</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Dense (Cosine) + BM25</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunSearch()}
            placeholder="Type a query (e.g. 'How does RUN_COMMAND work?' or 'BM25 formula')..."
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            type="button"
            onClick={handleRunSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-medium hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            {isSearching ? 'Searching...' : 'Retrieve'}
          </button>
        </div>

        {/* Search Results Display */}
        {searchResults.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Top Retrieved Chunks ({searchResults.length})
            </div>
            {searchResults.map((res, i) => (
              <div
                key={res.chunkId}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    #{i + 1} {res.documentName} {res.sectionHeader ? `· ${res.sectionHeader}` : ''}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
                    <span>Dense: {(res.denseScore * 100).toFixed(1)}%</span>
                    <span>BM25: {(res.bm25Score * 100).toFixed(1)}%</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Score: {(res.combinedScore * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <p className="text-slate-700 dark:text-slate-300 line-clamp-3 font-mono text-[11px] leading-relaxed">
                  {res.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents & Chunks Split View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        {/* Document List Column */}
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <span>Documents ({documents.length})</span>
            <span className="text-[10px] text-slate-400">Local SQLite</span>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No documents indexed yet. Tap "Ingest Document" above.
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => handleSelectDoc(doc.id)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                  selectedDocId === doc.id
                    ? 'border-emerald-500/80 bg-emerald-50/40 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {doc.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {doc.chunkCount} chunks · {(doc.fileSize / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteDoc(doc.id, e)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Chunks Inspector Column */}
        <div className="md:col-span-2 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <span>Indexed Chunks & Vector Inspect ({chunks.length})</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
              384 dims · normalized
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px]">
            {chunks.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">
                Select a document to inspect indexed chunks.
              </div>
            ) : (
              chunks.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Chunk #{ch.chunkIndex + 1}
                      {ch.sectionHeader ? ` (${ch.sectionHeader})` : ''}
                    </span>
                    <span>~{ch.tokenCount} tokens</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                    {ch.content}
                  </p>
                  {ch.embedding && (
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      Embedding: [{ch.embedding.slice(0, 6).map((v) => v.toFixed(3)).join(', ')}, ...]
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ingest Document Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Ingest Document into Local Knowledge Base
            </h3>

            {/* Quick Sample Autofill Buttons */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Load sample:</span>
              <button
                type="button"
                onClick={() => handleSampleDoc('termux')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 hover:bg-emerald-100 transition-colors"
              >
                Termux Kernel Guide
              </button>
              <button
                type="button"
                onClick={() => handleSampleDoc('offline_rag')}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 hover:bg-indigo-100 transition-colors"
              >
                Local RAG Theory
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. System_Architecture.md"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Content (Markdown, Plaintext, Code, or Extracted PDF)
                </label>
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  rows={8}
                  placeholder="Paste or write the document text here..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[11px]"
                />
              </div>
            </div>

            {/* Ingestion Progress Bar */}
            {ingestionProgress && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span>{ingestionProgress.message}</span>
                  <span className="font-mono">{ingestionProgress.progressPercentage}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${ingestionProgress.progressPercentage}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowIngestModal(false)}
                disabled={!!ingestionProgress}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartIngest}
                disabled={!docName.trim() || !docContent.trim() || !!ingestionProgress}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"
              >
                Chunk & Index Locally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
