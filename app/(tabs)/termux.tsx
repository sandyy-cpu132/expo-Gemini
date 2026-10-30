import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SettingsScreen } from '../../src/components/settings/SettingsScreen';
import { theme } from '../../src/theme/theme';

export default function TermuxTab() {
  return (
    <View style={styles.container}>
      <SettingsScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
});
