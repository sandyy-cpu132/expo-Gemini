import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CharacterLibraryScreen } from '../../src/components/characters/CharacterLibraryScreen';
import { CharacterCard, Conversation } from '../../src/types';
import { getConversations, saveConversation } from '../../src/services/database/db';
import { theme } from '../../src/theme/theme';

export default function PersonasTab() {
  const router = useRouter();

  const handleStartChat = async (char: CharacterCard) => {
    const existing = await getConversations();
    let target = existing.find((c) => c.characterId === char.id);

    if (!target) {
      target = {
        id: `conv-${char.id}-${Date.now()}`,
        title: `Chat with ${char.name}`,
        characterId: char.id,
        engine: 'llama.cpp',
        modelId: 'llama-3.2-3b',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveConversation(target);
    }

    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <CharacterLibraryScreen onStartChat={handleStartChat} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
});
