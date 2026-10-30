/**
 * MemoryManagerScreen - React Native Personal Memory Manager
 * Stores user preferences, bio facts, and explicit instructions.
 * Injected into prompt context without cross-character leakage.
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
} from 'react-native';
import { Brain, Plus, Trash2, Star, X } from 'lucide-react-native';
import { theme } from '../../theme/theme';
import { PersonalMemory } from '../../types';
import { personalMemoryService } from '../../services/memory/PersonalMemoryService';

export const MemoryManagerScreen: React.FC = () => {
  const [memories, setMemories] = useState<PersonalMemory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Memory State
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PersonalMemory['category']>('preference');
  const [importance, setImportance] = useState<PersonalMemory['importance']>(4);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    const list = await personalMemoryService.getMemories();
    setMemories(list);
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    const results = await personalMemoryService.searchMemories(text);
    setMemories(results);
  };

  const handleAdd = async () => {
    if (!content.trim()) return;

    await personalMemoryService.saveMemory({
      category,
      content,
      importance,
    });

    setContent('');
    setShowAddModal(false);
    await loadMemories();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Memory', 'Remove this saved fact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await personalMemoryService.deleteMemory(id);
          await loadMemories();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Personal Memory</Text>
          <Text style={styles.headerSubtitle}>
            Explicit preferences and facts injected into prompts
          </Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Plus size={16} color="#ffffff" />
          <Text style={styles.addBtnText}>Add Fact</Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search saved memories..."
          placeholderTextColor="#64748b"
        />
      </View>

      {/* Memories FlatList */}
      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.catBadge}>
                <Text style={styles.catText}>{item.category.toUpperCase()}</Text>
              </View>
              <View style={styles.stars}>
                {Array.from({ length: item.importance }).map((_, i) => (
                  <Star key={i} size={11} color={theme.colors.amber} fill={theme.colors.amber} />
                ))}
              </View>
            </View>

            <Text style={styles.cardContent}>{item.content}</Text>

            <View style={styles.cardFooter}>
              <Text style={styles.dateText}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
              <Pressable hitSlop={8} onPress={() => handleDelete(item.id)}>
                <Trash2 size={14} color="#ef4444" />
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Brain size={32} color="#64748b" />
            <Text style={styles.emptyTitle}>No personal memories recorded</Text>
            <Text style={styles.emptySubtitle}>
              Add explicit preferences or instructions here to tailor model behavior.
            </Text>
          </View>
        }
      />

      {/* Add Memory Modal */}
      {showAddModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Memory Fact</Text>
                <Pressable onPress={() => setShowAddModal(false)}>
                  <X size={20} color="#94a3b8" />
                </Pressable>
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryRow}>
                {(['preference', 'project', 'instruction', 'fact'] as const).map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.catOption, category === cat && styles.catOptionActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.catOptionText,
                        category === cat && styles.catOptionTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Fact / Statement</Text>
              <TextInput
                style={[styles.input, styles.contentInput]}
                value={content}
                onChangeText={setContent}
                multiline
                placeholder="e.g. Always generate code snippets in strict TypeScript."
                placeholderTextColor="#64748b"
              />

              <Text style={styles.label}>Importance (1 to 5 Stars)</Text>
              <View style={styles.starsSelector}>
                {([1, 2, 3, 4, 5] as const).map((num) => (
                  <Pressable
                    key={num}
                    style={[styles.starBtn, importance === num && styles.starBtnActive]}
                    onPress={() => setImportance(num)}
                  >
                    <Text
                      style={[
                        styles.starBtnText,
                        importance === num && styles.starBtnTextActive,
                      ]}
                    >
                      {num} ★
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, !content.trim() && styles.saveBtnDisabled]}
                  disabled={!content.trim()}
                  onPress={handleAdd}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchBox: {
    padding: 12,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchInput: {
    backgroundColor: theme.colors.bgInput,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  catText: {
    fontSize: 9.5,
    fontFamily: 'monospace',
    color: theme.colors.emeraldText,
    fontWeight: '700',
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  cardContent: {
    fontSize: 13.5,
    color: '#e2e8f0',
    lineHeight: 19,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  dateText: {
    fontSize: 10,
    color: '#64748b',
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
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 16,
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
  categoryRow: {
    flexDirection: 'row',
    gap: 6,
  },
  catOption: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
  },
  catOptionActive: {
    backgroundColor: theme.colors.emeraldDark,
    borderColor: theme.colors.emerald,
  },
  catOptionText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  catOptionTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
  starsSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  starBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
  },
  starBtnActive: {
    backgroundColor: theme.colors.emerald,
    borderColor: theme.colors.emerald,
  },
  starBtnText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  starBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
