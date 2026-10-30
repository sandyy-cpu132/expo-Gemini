import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../src/components/chat/ChatScreen';
import { Conversation } from '../../src/types';
import {
  getConversation,
  getConversations,
  saveConversation,
} from '../../src/services/database/db';
import { theme } from '../../src/theme/theme';

/**
 * Opens the conversation passed as ?conversationId=... (from the Personas tab).
 * With no parameter, it opens the most recently updated conversation.
 */
export default function IndexTab() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const requestedId =
    typeof params.conversationId === 'string' ? params.conversationId : undefined;

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveConversation(requestedId).then((conv) => {
      if (!cancelled) setActiveConversation(conv);
    });
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  if (!activeConversation) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChatScreen key={activeConversation.id} conversation={activeConversation} />
    </View>
  );
}

async function resolveConversation(requestedId?: string): Promise<Conversation> {
  if (requestedId) {
    const requested = await getConversation(requestedId);
    if (requested) return requested;
  }

  const convs = await getConversations();
  if (convs.length > 0) return convs[0];

  const defaultConv: Conversation = {
    id: `conv-clover-${Date.now()}`,
    title: 'Chat with Clover',
    characterId: 'char-clover',
    engine: 'llama.cpp',
    modelId: 'llama-3.2-3b',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveConversation(defaultConv);
  return defaultConv;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
  loading: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
