import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GroupChatScreen } from '../../src/components/groups/GroupChatScreen';
import { theme } from '../../src/theme/theme';

export default function GroupsTab() {
  return (
    <View style={styles.container}>
      <GroupChatScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
});
