/**
 * KnowledgeBaseScreen - React Native Local RAG & Document Management
 * Ingests files via expo-document-picker, shows indexing progress, and runs hybrid retrieval tests.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, Plus, Upload, Trash2, Search, X } from 'lucide-react-native';
import { theme } from '../../theme/theme';
import { DocumentChunk, DocumentMetadata } from '../../types';
import {
  deleteDocument,
  getAllChunks,
  getDocuments,
} from '../../services/database/db';
import {
  documentIngestion,
  FileTextExtractor,
  IngestionProgress,
} from '../../services/rag/DocumentIngestion';
import { retriever, RetrievalResult } from '../../services/rag/HybridRetriever';

export const KnowledgeBaseScreen: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);

  // Search Tester
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RetrievalResult[]>([]);
  const [searchStatusMsg, setSearchStatusMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Manual Ingest Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [progress, setProgress] = useState<IngestionProgress | null>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    const list = await getDocuments();
    setDocuments(list);
    if (list.length > 0 && !selectedDocId) {
      selectDoc(list[0].id);
    }
  };

  const selectDoc = async (id: string) => {
    setSelectedDocId(id);
    const all = await getAllChunks();
    setChunks(all.filter((c) => c.chunk.documentId === id).map((c) => c.chunk));
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', 'text/csv', 'text/markdown'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const extracted = await FileTextExtractor.extractFromFile(asset.uri, asset.name);

      await documentIngestion.ingestDocument(
        asset.name,
        extracted.text,
        extracted.fileType,
        'coll-default',
        false,
        (p) => setProgress(p)
      );

      await loadDocs();
      Alert.alert('Indexed', `Successfully ingested ${asset.name}`);
      setProgress(null);
    } catch (err: any) {
      Alert.alert('Ingestion Error', err.message);
      setProgress(null);
    }
  };

  const handleManualIngest = async () => {
    if (!docTitle.trim() || !docContent.trim()) return;

    try {
      await documentIngestion.ingestDocument(
        docTitle.trim(),
        docContent,
        'md',
        'coll-default',
        false,
        (p) => setProgress(p)
      );

      await loadDocs();
      setShowManualModal(false);
      setDocTitle('');
      setDocContent('');
      setProgress(null);
      Alert.alert('Indexed', 'Document successfully chunked and stored.');
    } catch (err: any) {
      Alert.alert('Ingestion Error', err.message);
      setProgress(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Document', `Remove ${name} and all its chunks?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDocument(id);
          await loadDocs();
        },
      },
    ]);
  };

  const handleTestSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchStatusMsg(null);

    try {
      const response = await retriever.retrieve(searchQuery, { topK: 3 });
      if (response.status === 'ok') {
        setSearchResults(response.results);
        if (response.results.length === 0) {
          setSearchStatusMsg('No matching chunks exceeded the relevance threshold.');
        }
      } else {
        setSearchResults([]);
        setSearchStatusMsg(response.message || 'Retrieval failed.');
      }
    } catch (err: any) {
      setSearchStatusMsg(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Knowledge Base & RAG</Text>
          <Text style={styles.headerSubtitle}>
            Local vector embeddings (port 8081) + BM25 hybrid search
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.pickBtn} onPress={handlePickFile}>
            <Upload size={14} color="#ffffff" />
            <Text style={styles.pickBtnText}>Pick File</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => setShowManualModal(true)}>
            <Plus size={16} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* Progress banner */}
      {progress && (
        <View style={styles.progressBanner}>
          <Text style={styles.progressText}>
            {progress.message} ({progress.progressPercentage}%)
          </Text>
        </View>
      )}

      {/* Hybrid Search Tester */}
      <View style={styles.searchBox}>
        <View style={styles.searchInputRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Test retrieval (e.g. 'Termux permissions')..."
            placeholderTextColor="#64748b"
          />
          <Pressable
            style={styles.searchBtn}
            disabled={isSearching || !searchQuery.trim()}
            onPress={handleTestSearch}
          >
            <Search size={16} color="#ffffff" />
          </Pressable>
        </View>

        {searchStatusMsg && (
          <Text style={styles.searchStatus}>{searchStatusMsg}</Text>
        )}

        {searchResults.length > 0 && (
          <View style={styles.resultsList}>
            {searchResults.map((r, i) => (
              <View key={r.chunkId} style={styles.resultItem}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultDoc}>
                    #{i + 1} {r.documentName} {r.sectionHeader ? `· § ${r.sectionHeader}` : ''}
                  </Text>
                  <Text style={styles.resultScore}>
                    Score: {(r.combinedScore * 100).toFixed(0)}%
                  </Text>
                </View>
                <Text style={styles.resultContent} numberOfLines={2}>
                  {r.content}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Documents & Chunks List */}
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.docList}
        renderItem={({ item }) => {
          const isSelected = selectedDocId === item.id;
          return (
            <View style={[styles.docCard, isSelected && styles.docCardSelected]}>
              <Pressable
                style={styles.docCardMain}
                onPress={() => selectDoc(item.id)}
              >
                <FileText size={20} color={theme.colors.emeraldText} />
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{item.name}</Text>
                  <Text style={styles.docMeta}>
                    {item.chunkCount} chunks · {(item.fileSize / 1024).toFixed(1)} KB · {item.fileType.toUpperCase()}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => handleDelete(item.id, item.name)}
              >
                <Trash2 size={16} color="#ef4444" />
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No documents in Knowledge Base</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Pick File" to import .txt, .md, .csv, or code files from your phone.
            </Text>
          </View>
        }
      />

      {/* Manual Paste Modal */}
      {showManualModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowManualModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Paste Document Text</Text>
                <Pressable onPress={() => setShowManualModal(false)}>
                  <X size={20} color="#94a3b8" />
                </Pressable>
              </View>

              <Text style={styles.label}>Document Title</Text>
              <TextInput
                style={styles.input}
                value={docTitle}
                onChangeText={setDocTitle}
                placeholder="e.g. Android_Notes.md"
                placeholderTextColor="#64748b"
              />

              <Text style={styles.label}>Content</Text>
              <TextInput
                style={[styles.input, styles.contentInput]}
                value={docContent}
                onChangeText={setDocContent}
                multiline
                placeholder="Paste text or markdown content..."
                placeholderTextColor="#64748b"
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowManualModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, (!docTitle.trim() || !docContent.trim()) && styles.saveBtnDisabled]}
                  disabled={!docTitle.trim() || !docContent.trim()}
                  onPress={handleManualIngest}
                >
                  <Text style={styles.saveBtnText}>Index Locally</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  addBtn: {
    backgroundColor: theme.colors.bgCard,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressBanner: {
    backgroundColor: theme.colors.emeraldDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  searchBox: {
    padding: 14,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  searchInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.colors.bgInput,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  searchBtn: {
    backgroundColor: theme.colors.emerald,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchStatus: {
    fontSize: 12,
    color: theme.colors.amber,
    marginTop: 2,
  },
  resultsList: {
    gap: 6,
    marginTop: 4,
  },
  resultItem: {
    backgroundColor: '#050b14',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultDoc: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.emeraldText,
  },
  resultScore: {
    fontSize: 10,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  resultContent: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 15,
  },
  docList: {
    padding: 16,
    gap: 10,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
  },
  docCardSelected: {
    borderColor: theme.colors.emerald,
  },
  docCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  docMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.bgSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  input: {
    backgroundColor: theme.colors.bgInput,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  contentInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  saveBtn: {
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
