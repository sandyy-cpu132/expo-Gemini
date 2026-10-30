import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider, useDatabase } from '../src/services/database/db';
import { theme } from '../src/theme/theme';

function RootLayoutContent() {
  const { isReady, error } = useDatabase();

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Database Initialization Failed</Text>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.emerald} />
        <Text style={styles.loadingText}>Initializing CloverPal Offline AI...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={theme.colors.bgCanvas} />
      <Slot />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <RootLayoutContent />
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
