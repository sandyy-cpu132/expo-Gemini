import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { ChatScreen } from '../../src/components/chat/ChatScreen';
import { Conversation } from '../../src/types';
import { getConversations, saveConversation } from '../../src/services/database/db';
import { theme } from '../../src/theme/theme';

export default function IndexTab() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    loadActiveConversation();
  }, []);

  const loadActiveConversation = async () => {
    const convs = await getConversations();
    if (convs.length > 0) {
      setActiveConversation(convs[0]);
    } else {
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
      setActiveConversation(defaultConv);
    }
  };

  if (!activeConversation) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChatScreen conversation={activeConversation} />
    </View>
  );
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
