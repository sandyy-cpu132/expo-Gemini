/**
 * CharacterLibraryScreen - React Native persona gallery and editor
 * Supports Character Card V2 JSON export/import via expo-document-picker and expo-sharing.
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Plus, Upload, Download, Edit2, Trash2, X, Sparkles } from 'lucide-react-native';
import { theme } from '../../theme/theme';
import { CharacterCard } from '../../types';
import {
  deleteCharacter,
  getCharacters,
  saveCharacter,
} from '../../services/database/db';
import { PersonaAvatar } from '../common/PersonaAvatar';

interface CharacterLibraryScreenProps {
  onStartChat: (char: CharacterCard) => void;
}

export const CharacterLibraryScreen: React.FC<CharacterLibraryScreenProps> = ({
  onStartChat,
}) => {
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCard, setEditingCard] = useState<CharacterCard | null>(null);
  const [isNew, setIsNew] = useState(false);

  const categories = ['All', 'Companion', 'Technical', 'Academic', 'Creative'];

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    const list = await getCharacters();
    setCharacters(list);
  };

  const filtered = characters.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.personality.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Character', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCharacter(id);
          await loadCharacters();
        },
      },
    ]);
  };

  const handleExport = async (char: CharacterCard) => {
    try {
      const exportData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: char.name,
          description: char.tagline,
          personality: char.personality,
          system_prompt: char.systemPrompt,
          first_mes: char.greetingMessage,
          mes_example: char.exampleDialogue,
          creator_notes: 'CloverPal Offline AI',
          category: char.category,
        },
      };

      const path = `${FileSystem.cacheDirectory}${char.name.toLowerCase().replace(/\s+/g, '_')}_card.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(exportData, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json' });
      } else {
        Alert.alert('Exported', `Saved to ${path}`);
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileUri = result.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const json = JSON.parse(text);
      const data = json.data || json;

      const newChar: CharacterCard = {
        id: `char-${Date.now()}`,
        name: data.name || 'Imported Persona',
        tagline: data.description || 'Custom character',
        description: data.description || '',
        avatarKey: 'default',
        personality: data.personality || '',
        systemPrompt: data.system_prompt || 'You are an offline assistant.',
        greetingMessage: data.first_mes || 'Hello!',
        exampleDialogue: data.mes_example || '',
        category: data.category || 'Companion',
        responseMode: 'detailed',
        memoryScope: 'private',
        createdAt: Date.now(),
      };

      await saveCharacter(newChar);
      await loadCharacters();
      Alert.alert('Imported', `Imported ${newChar.name} successfully.`);
    } catch (err: any) {
      Alert.alert('Import Error', err.message || 'Invalid JSON file');
    }
  };

  const handleSaveModal = async () => {
    if (!editingCard || !editingCard.name.trim()) return;
    await saveCharacter(editingCard);
    setEditingCard(null);
    await loadCharacters();
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Character Library</Text>
          <Text style={styles.headerSubtitle}>
            Offline personas with private system prompts
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={handleImport}>
            <Upload size={16} color={theme.colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.newButton}
            onPress={() => {
              setIsNew(true);
              setEditingCard({
                id: `char-${Date.now()}`,
                name: '',
                tagline: '',
                description: '',
                avatarKey: 'clover',
                personality: '',
                systemPrompt: '',
                greetingMessage: '',
                exampleDialogue: '',
                category: 'Companion',
                responseMode: 'detailed',
                memoryScope: 'private',
                createdAt: Date.now(),
              });
            }}
          >
            <Plus size={16} color="#ffffff" />
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by persona name or traits..."
          placeholderTextColor="#64748b"
        />
      </View>

      {/* Categories Bar */}
      <View style={styles.categoryScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContainer}>
          {categories.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryTab, selectedCategory === cat && styles.categoryTabActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat && styles.categoryTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Character Cards List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => onStartChat(item)}
          >
            <View style={styles.cardTop}>
              <PersonaAvatar name={item.name} avatarKey={item.avatarKey} size={48} />
              <View style={styles.cardInfo}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardCategory}>{item.category}</Text>
                </View>
                <Text style={styles.cardTagline} numberOfLines={1}>
                  {item.tagline}
                </Text>
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Text style={styles.cardModeText}>Mode: {item.responseMode}</Text>
              <View style={styles.cardActionIcons}>
                <Pressable
                  hitSlop={8}
                  style={styles.actionIcon}
                  onPress={() => handleExport(item)}
                >
                  <Download size={14} color="#94a3b8" />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={styles.actionIcon}
                  onPress={() => {
                    setIsNew(false);
                    setEditingCard(item);
                  }}
                >
                  <Edit2 size={14} color="#94a3b8" />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={styles.actionIcon}
                  onPress={() => handleDelete(item.id, item.name)}
                >
                  <Trash2 size={14} color="#ef4444" />
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Edit / Create Modal */}
      {editingCard && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setEditingCard(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalSheetTitle}>
                  {isNew ? 'Create Persona' : `Edit ${editingCard.name}`}
                </Text>
                <Pressable onPress={() => setEditingCard(null)}>
                  <X size={20} color="#94a3b8" />
                </Pressable>
              </View>

              <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editingCard.name}
                  onChangeText={(v) => setEditingCard({ ...editingCard, name: v })}
                  placeholder="e.g. Athena"
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>Tagline</Text>
                <TextInput
                  style={styles.input}
                  value={editingCard.tagline}
                  onChangeText={(v) => setEditingCard({ ...editingCard, tagline: v })}
                  placeholder="e.g. Polymath Research Scholar"
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>Category</Text>
                <TextInput
                  style={styles.input}
                  value={editingCard.category}
                  onChangeText={(v) => setEditingCard({ ...editingCard, category: v })}
                  placeholder="Companion / Technical / Academic / Creative"
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>Personality</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={editingCard.personality}
                  onChangeText={(v) => setEditingCard({ ...editingCard, personality: v })}
                  multiline
                  placeholder="e.g. Erudite, analytical, structured..."
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>System Prompt</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={editingCard.systemPrompt}
                  onChangeText={(v) => setEditingCard({ ...editingCard, systemPrompt: v })}
                  multiline
                  placeholder="Directives for the local model..."
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>Greeting Message</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={editingCard.greetingMessage}
                  onChangeText={(v) => setEditingCard({ ...editingCard, greetingMessage: v })}
                  multiline
                  placeholder="Greeting sent when opening chat..."
                  placeholderTextColor="#64748b"
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setEditingCard(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleSaveModal}>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
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
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: theme.colors.emerald,
  },
  newButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchBox: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  categoryScroll: {
    marginBottom: 6,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    gap: 6,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryTabActive: {
    backgroundColor: theme.colors.emeraldDark,
    borderColor: theme.colors.emerald,
  },
  categoryText: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  cardCategory: {
    fontSize: 11,
    color: theme.colors.emeraldText,
    fontWeight: '600',
  },
  cardTagline: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  cardDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 17,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  cardModeText: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  cardActionIcons: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  actionIcon: {
    padding: 4,
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalForm: {
    maxHeight: 400,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 8,
    marginBottom: 4,
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
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.emerald,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
