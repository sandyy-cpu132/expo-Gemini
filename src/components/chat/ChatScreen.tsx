/**
 * ChatScreen - Primary React Native conversational interface
 * Uses FlatList, KeyboardAvoidingView, multi-turn history builder,
 * incremental SQLite persistence, and abort cancellation.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { Send, Square, Sparkles, X, Trash2 } from 'lucide-react-native';
import { theme } from '../../theme/theme';
import {
  CharacterCard,
  Citation,
  Conversation,
  Message,
  ResponseFormattingMode,
} from '../../types';
import {
  deleteMessage,
  getCharacters,
  getMemories,
  getMessages,
  saveMessage,
  updateMessageContent,
} from '../../services/database/db';
import { runtimeManager } from '../../services/runtime/RuntimeConnectionManager';
import { retriever } from '../../services/rag/HybridRetriever';
import { contextAssembler } from '../../services/rag/ContextAssembler';
import { conversationMemoryService } from '../../services/memory/ConversationMemoryService';
import { RichResponseRenderer } from './RichResponseRenderer';
import { PersonaAvatar } from '../common/PersonaAvatar';

interface ChatScreenProps {
  conversation: Conversation;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ conversation }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<CharacterCard | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [tps, setTps] = useState<number | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStreamingText = useRef('');
  const currentMsgId = useRef('');

  useEffect(() => {
    loadConversation();
  }, [conversation.id]);

  const loadConversation = async () => {
    const chars = await getCharacters();
    const char = chars.find((c) => c.id === conversation.characterId) || chars[0] || null;
    setCurrentCharacter(char);

    const msgs = await getMessages(conversation.id);
    setMessages(msgs);
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText('');

    // 1. Save user message to SQLite
    const userMsg: Message = {
      id: `msg-${Date.now()}-u`,
      conversationId: conversation.id,
      senderType: 'user',
      senderName: 'You',
      content: text,
      status: 'complete',
      createdAt: Date.now(),
    };
    await saveMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    // 2. Local RAG Retrieval (Port 8081)
    let baseSystemPrompt =
      currentCharacter?.systemPrompt || 'You are an offline assistant running locally.';
    let citations: Citation[] = [];

    try {
      const ragResponse = await retriever.retrieve(text, {
        topK: 3,
        collectionIds: conversation.activeCollectionIds,
      });

      if (ragResponse.status === 'ok' && ragResponse.results.length > 0) {
        const memories = await getMemories();
        const assembled = contextAssembler.assembleContext(
          baseSystemPrompt,
          ragResponse.results,
          memories
        );
        baseSystemPrompt = assembled.augmentedSystemPrompt;
        citations = assembled.citations;
      }
    } catch {
      // Offline RAG retrieval gracefully skipped if no documents
    }

    // 3. Build multi-turn ChatMessage[] history with budget
    const chatHistory = await conversationMemoryService.buildChatHistory(
      conversation.id,
      baseSystemPrompt,
      text,
      3000
    );

    // 4. Create assistant placeholder message
    const assistantMsgId = `msg-${Date.now()}-a`;
    currentMsgId.current = assistantMsgId;
    currentStreamingText.current = '';

    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      conversationId: conversation.id,
      senderType: 'assistant',
      senderId: currentCharacter?.id,
      senderName: currentCharacter?.name || 'Clover',
      senderAvatar: currentCharacter?.avatarKey || 'clover',
      content: '',
      citations,
      status: 'streaming',
      createdAt: Date.now(),
    };

    await saveMessage(initialAssistantMsg);
    setMessages((prev) => [...prev, initialAssistantMsg]);
    setIsGenerating(true);
    setTps(null);

    const engine = runtimeManager.getActiveEngine();

    try {
      await engine.streamGenerate(
        chatHistory,
        { temperature: 0.7, maxTokens: 2048 },
        (chunk) => {
          currentStreamingText.current += chunk.token;
          if (chunk.stats?.tokensPerSecond) {
            setTps(chunk.stats.tokensPerSecond);
          }

          // Throttle SQLite update every 500ms
          if (!throttleTimer.current) {
            throttleTimer.current = setTimeout(async () => {
              await updateMessageContent(
                assistantMsgId,
                currentStreamingText.current,
                'streaming',
                chunk.stats
              );
              throttleTimer.current = null;
            }, 500);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: currentStreamingText.current,
                    stats: chunk.stats || m.stats,
                    status: chunk.isFinished ? 'complete' : 'streaming',
                  }
                : m
            )
          );
        }
      );

      // Final persistence
      await updateMessageContent(assistantMsgId, currentStreamingText.current, 'complete');
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      const status = isAbort ? 'interrupted' : 'error';
      const content = currentStreamingText.current || `Generation ${status}. ${err?.message || ''}`;

      await updateMessageContent(assistantMsgId, content, status);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content, status } : m
        )
      );
    } finally {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
        throttleTimer.current = null;
      }
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    runtimeManager.getActiveEngine().stopGeneration();
    setIsGenerating(false);
  };

  const handleDeleteMsg = (id: string) => {
    Alert.alert('Delete Message', 'Remove this message from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMessage(id);
          setMessages((prev) => prev.filter((m) => m.id !== id));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? undefined : 'padding'}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PersonaAvatar
            name={currentCharacter?.name || 'Clover'}
            avatarKey={currentCharacter?.avatarKey}
            size={36}
          />
          <View style={styles.headerTextCol}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>{currentCharacter?.name || conversation.title}</Text>
              <View style={styles.engineBadge}>
                <Text style={styles.engineBadgeText}>{conversation.engine}</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {currentCharacter?.tagline || 'Offline AI'}
            </Text>
          </View>
        </View>

        {tps ? (
          <View style={styles.tpsBadge}>
            <Text style={styles.tpsText}>⚡ {tps} t/s</Text>
          </View>
        ) : null}
      </View>

      {/* Messages FlatList */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isUser = item.senderType === 'user';
          return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
              {!isUser && (
                <PersonaAvatar
                  name={item.senderName}
                  avatarKey={item.senderAvatar}
                  size={28}
                />
              )}
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                {!isUser && (
                  <View style={styles.bubbleHeader}>
                    <Text style={styles.senderName}>{item.senderName}</Text>
                    {item.status === 'interrupted' && (
                      <Text style={styles.statusInterrupted}>[interrupted]</Text>
                    )}
                  </View>
                )}
                {isUser ? (
                  <Text style={styles.userText}>{item.content}</Text>
                ) : (
                  <RichResponseRenderer
                    content={item.content}
                    citations={item.citations}
                    onCitationPress={(c) => setActiveCitation(c)}
                    isStreaming={item.status === 'streaming'}
                  />
                )}
                <View style={styles.bubbleFooter}>
                  <Text style={styles.timeText}>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => handleDeleteMsg(item.id)}
                  >
                    <Trash2 size={12} color="#64748b" />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Sparkles size={32} color={theme.colors.emerald} />
            <Text style={styles.emptyTitle}>Start talking with {currentCharacter?.name}</Text>
            <Text style={styles.emptySubtitle}>
              100% offline via loopback 127.0.0.1. No network data ever leaves your device.
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Message ${currentCharacter?.name || 'Local AI'}...`}
          placeholderTextColor="#64748b"
          multiline
          maxLength={4000}
        />
        {isGenerating ? (
          <Pressable style={styles.stopButton} onPress={handleStop}>
            <Square size={16} color="#ffffff" fill="#ffffff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim()}
            onPress={handleSendMessage}
          >
            <Send size={16} color="#ffffff" />
          </Pressable>
        )}
      </View>

      {/* Citation Detail Modal */}
      <Modal
        visible={!!activeCitation}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveCitation(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                [{activeCitation?.id}] {activeCitation?.documentName}
              </Text>
              <Pressable onPress={() => setActiveCitation(null)}>
                <X size={20} color="#94a3b8" />
              </Pressable>
            </View>
            {activeCitation?.sectionHeader && (
              <Text style={styles.modalSection}>§ {activeCitation.sectionHeader}</Text>
            )}
            <View style={styles.modalContentBox}>
              <Text style={styles.modalContentText}>{activeCitation?.excerpt}</Text>
            </View>
          </View>
        </View>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  engineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  engineBadgeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: theme.colors.emeraldText,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  tpsBadge: {
    backgroundColor: '#050b14',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tpsText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: theme.colors.emeraldText,
  },
  messagesList: {
    padding: 16,
    gap: 14,
  },
  messageRow: {
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  statusInterrupted: {
    fontSize: 10,
    color: theme.colors.amber,
    fontFamily: 'monospace',
  },
  userText: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#ffffff',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  timeText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.bgInput,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
    maxHeight: 110,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  stopButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.bgSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 8,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.emeraldText,
    flex: 1,
  },
  modalSection: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  modalContentBox: {
    backgroundColor: '#050b14',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 6,
  },
  modalContentText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: theme.colors.textPrimary,
    lineHeight: 18,
  },
});
