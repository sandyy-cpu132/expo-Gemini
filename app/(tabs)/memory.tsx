import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MemoryManagerScreen } from '../../src/components/memory/MemoryManagerScreen';
import { theme } from '../../src/theme/theme';

export default function MemoryTab() {
  return (
    <View style={styles.container}>
      <MemoryManagerScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
});
