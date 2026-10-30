import React from 'react';
import { View, StyleSheet } from 'react-native';
import { KnowledgeBaseScreen } from '../../src/components/knowledge/KnowledgeBaseScreen';
import { theme } from '../../src/theme/theme';

export default function KnowledgeTab() {
  return (
    <View style={styles.container}>
      <KnowledgeBaseScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
});
