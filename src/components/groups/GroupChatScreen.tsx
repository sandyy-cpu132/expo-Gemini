/**
 * GroupChatScreen - Multi-Character Group Discussions in React Native
 * Coordinates turns safely with GroupChatOrchestrator and anti-loop guards.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Users, Plus, Send, Square, X } from 'lucide-react-native';
import { theme } from '../../theme/theme';
import { CharacterCard, GroupChat, Message } from '../../types';
import {
  getCharacters,
  getGroups,
  getMessages,
  saveGroup,
  saveMessage,
} from '../../services/database/db';
import { groupChatOrchestrator, GroupTurnEvent } from '../../services/group/GroupChatOrchestrator';
import { PersonaAvatar } from '../common/PersonaAvatar';
import { RichResponseRenderer } from '../chat/RichResponseRenderer';

export const GroupChatScreen: React.FC = () => {
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<CharacterCard | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Group State
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(['char-clover', 'char-aegis']);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const chars = await getCharacters();
    setCharacters(chars);
    const grps = await getGroups();
    setGroups(grps);
    if (grps.length > 0 && !activeGroup) {
      setActiveGroup(grps[0]);
    }
  };

  useEffect(() => {
    if (activeGroup) {
      loadGroupMessages(activeGroup.id);
    }
  }, [activeGroup?.id]);

  const loadGroupMessages = async (groupId: string) => {
    const convId = `conv-group-${groupId}`;
    const msgs = await getMessages(convId);
    setMessages(msgs);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !activeGroup || isOrchestrating) return;

    setInputText('');
    const convId = `conv-group-${activeGroup.id}`;

    const userMsg: Message = {
      id: `msg-grp-${Date.now()}-u`,
      conversationId: convId,
      senderType: 'user',
      senderName: 'You',
      content: text,
      createdAt: Date.now(),
      status: 'complete',
    };

    await saveMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);
    groupChatOrchestrator.resetLoopGuard();

    triggerNextTurn(convId);
  };

  const triggerNextTurn = async (convId: string, forcedCharId?: string) => {
    if (!activeGroup || isOrchestrating) return;

    setIsOrchestrating(true);
    try {
      await groupChatOrchestrator.executeGroupTurn(
        convId,
        activeGroup,
        (event: GroupTurnEvent) => {
          if (event.status === 'thinking') {
            setCurrentSpeaker(event.character);
          } else if (event.status === 'completed' && event.message) {
            setMessages((prev) => [...prev, event.message!]);
            setCurrentSpeaker(null);
          } else {
            setCurrentSpeaker(null);
          }
        },
        forcedCharId
      );
    } finally {
      setIsOrchestrating(false);
      setCurrentSpeaker(null);
    }
  };

  const handleStop = () => {
    groupChatOrchestrator.stopOrchestration();
    setIsOrchestrating(false);
    setCurrentSpeaker(null);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedCharIds.length < 2) {
      Alert.alert('Incomplete', 'Enter a name and select at least 2 participants.');
      return;
    }

    const grp: GroupChat = {
      id: `grp-${Date.now()}`,
      name: newGroupName.trim(),
      description: `Discussion with ${selectedCharIds.length} personas`,
      characterIds: selectedCharIds,
      turnMode: 'auto-moderated',
      createdAt: Date.now(),
    };

    await saveGroup(grp);
    await loadData();
    setActiveGroup(grp);
    setShowCreateModal(false);
    setNewGroupName('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? undefined : 'padding'}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Users size={20} color={theme.colors.emeraldText} />
          <View>
            <Text style={styles.headerTitle}>
              {activeGroup ? activeGroup.name : 'Group Discussions'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeGroup ? `${activeGroup.characterIds.length} Personas` : 'Select or create a room'}
            </Text>
          </View>
        </View>

        <Pressable style={styles.createBtn} onPress={() => setShowCreateModal(true)}>
          <Plus size={14} color="#ffffff" />
          <Text style={styles.createBtnText}>New Room</Text>
        </Pressable>
      </View>

      {/* Participants Avatar Bar */}
      {activeGroup && (
        <View style={styles.participantsBar}>
          <Text style={styles.participantsLabel}>Turn:</Text>
          {activeGroup.characterIds.map((cId) => {
            const char = characters.find((c) => c.id === cId);
            if (!char) return null;
            const isSpeaking = currentSpeaker?.id === char.id;

            return (
              <Pressable
                key={char.id}
                style={[styles.charChip, isSpeaking && styles.charChipSpeaking]}
                onPress={() => triggerNextTurn(`conv-group-${activeGroup.id}`, char.id)}
              >
                <PersonaAvatar name={char.name} avatarKey={char.avatarKey} size={22} />
                <Text style={styles.charChipName}>{char.name}</Text>
                {isSpeaking && <View style={styles.speakingDot} />}
              </Pressable>
            );
          })}
          {isOrchestrating && (
            <Pressable style={styles.stopBtn} onPress={handleStop}>
              <Square size={12} color="#ffffff" fill="#ffffff" />
            </Pressable>
          )}
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isUser = item.senderType === 'user';
          return (
            <View style={[styles.msgRow, isUser ? styles.userRow : styles.assistantRow]}>
              {!isUser && (
                <PersonaAvatar name={item.senderName} avatarKey={item.senderAvatar} size={28} />
              )}
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                {!isUser && <Text style={styles.senderLabel}>{item.senderName}</Text>}
                {isUser ? (
                  <Text style={styles.userContent}>{item.content}</Text>
                ) : (
                  <RichResponseRenderer content={item.content} />
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {activeGroup ? 'No messages yet' : 'Create or select a room to begin'}
            </Text>
            <Text style={styles.emptySubtitle}>
              Participants will respond according to their system prompts and personalities.
            </Text>
          </View>
        }
      />

      {/* Input */}
      {activeGroup && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Address the room or mention a persona..."
            placeholderTextColor="#64748b"
          />
          <Pressable
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            disabled={!inputText.trim() || isOrchestrating}
            onPress={handleSend}
          >
            <Send size={16} color="#ffffff" />
          </Pressable>
        </View>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create Discussion Room</Text>
                <Pressable onPress={() => setShowCreateModal(false)}>
                  <X size={20} color="#94a3b8" />
                </Pressable>
              </View>

              <Text style={styles.label}>Room Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="e.g. Systems Architecture Roundtable"
                placeholderTextColor="#64748b"
              />

              <Text style={styles.label}>Select Participants (min 2)</Text>
              <View style={styles.charPicker}>
                {characters.map((c) => {
                  const selected = selectedCharIds.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                      onPress={() => {
                        if (selected) {
                          setSelectedCharIds(selectedCharIds.filter((id) => id !== c.id));
                        } else {
                          setSelectedCharIds([...selectedCharIds, c.id]);
                        }
                      }}
                    >
                      <PersonaAvatar name={c.name} avatarKey={c.avatarKey} size={28} />
                      <Text style={styles.pickerText}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={handleCreateGroup}>
                  <Text style={styles.confirmBtnText}>Create</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  createBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  participantsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0a101f',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  participantsLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  charChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  charChipSpeaking: {
    borderColor: theme.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  charChipName: {
    fontSize: 11.5,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  speakingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.emerald,
  },
  stopBtn: {
    backgroundColor: theme.colors.red,
    padding: 6,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  msgRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    padding: 12,
  },
  userBubble: {
    backgroundColor: theme.colors.emeraldDark,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  senderLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.emeraldText,
    marginBottom: 4,
  },
  userContent: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: theme.colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: theme.colors.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
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
    gap: 10,
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
  modalInput: {
    backgroundColor: theme.colors.bgInput,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  charPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pickerItemSelected: {
    borderColor: theme.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  pickerText: {
    fontSize: 12,
    color: theme.colors.textPrimary,
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
  confirmBtn: {
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
