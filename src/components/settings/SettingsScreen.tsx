/**
 * SettingsScreen - React Native Termux Connection Hub & Engine Settings
 * Exposes live socket diagnostics, Termux setup checklist, generation parameters,
 * and JSON database backup/restore.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  Terminal,
  RefreshCw,
  Play,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  HardDrive,
  Cpu,
} from 'lucide-react-native';
import { theme } from '../../theme/theme';
import { RuntimeDiagnostics } from '../../types';
import { runtimeManager } from '../../services/runtime/RuntimeConnectionManager';
import {
  dispatchTermuxScript,
  generateTermuxSetupScript,
} from '../../../modules/termux-integration';
import { exportDatabaseBackup, importDatabaseBackup } from '../../services/database/db';

export const SettingsScreen: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(
    runtimeManager.getDiagnostics()
  );
  const [isProbing, setIsProbing] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Generation Controls
  const [temperature, setTemperature] = useState('0.7');
  const [topP, setTopP] = useState('0.9');
  const [maxTokens, setMaxTokens] = useState('2048');

  // Experimental Flags
  const [enablePrism, setEnablePrism] = useState(false);
  const [keywordOnlyRAG, setKeywordOnlyRAG] = useState(false);

  useEffect(() => {
    handleProbe();
  }, []);

  const handleProbe = async () => {
    setIsProbing(true);
    setStatusNote(null);
    const diag = await runtimeManager.probeAllDiagnostics();
    setDiagnostics(diag);
    setIsProbing(false);
  };

  const handleTriggerIntent = async () => {
    setStatusNote('Dispatching com.termux.RUN_COMMAND intent...');
    const result = await dispatchTermuxScript('~/.termux/start_ai_service.sh', 'llama.cpp', 8080);
    setStatusNote(result.message);
    setTimeout(handleProbe, 1500);
  };

  const handleExportBackup = async () => {
    try {
      const path = await exportDatabaseBackup();
      Alert.alert('Backup Exported', `Saved to ${path}`);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
    }
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileUri = result.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const ok = await importDatabaseBackup(text);
      if (ok) {
        Alert.alert('Restore Complete', 'Database restored successfully.');
      } else {
        Alert.alert('Restore Failed', 'Invalid backup format or corrupt schema.');
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Termux & Offline Settings</Text>
        <Text style={styles.headerSubtitle}>
          Local loopback bridge, background service controls, and engine parameters
        </Text>
      </View>

      {/* Diagnostics Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Terminal size={18} color={theme.colors.emeraldText} />
            <Text style={styles.cardTitle}>Runtime Connectivity</Text>
          </View>
          <Pressable style={styles.probeBtn} onPress={handleProbe} disabled={isProbing}>
            <RefreshCw size={13} color={theme.colors.emeraldText} />
            <Text style={styles.probeBtnText}>Probe</Text>
          </Pressable>
        </View>

        {/* Status Rows */}
        <View style={styles.statusRows}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Termux App (com.termux):</Text>
            <Text style={[styles.statusVal, diagnostics.termuxAppInstalled ? styles.valOk : styles.valErr]}>
              {diagnostics.termuxAppInstalled ? 'Installed' : 'Not Found'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>RUN_COMMAND Permission:</Text>
            <Text style={[styles.statusVal, diagnostics.termuxRunCommandPermission ? styles.valOk : styles.valErr]}>
              {diagnostics.termuxRunCommandPermission ? 'Granted' : 'Missing'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Chat Engine (127.0.0.1:8080):</Text>
            <Text style={[styles.statusVal, diagnostics.llamaStatus === 'connected' ? styles.valOk : styles.valErr]}>
              {diagnostics.llamaStatus === 'connected'
                ? `Online (${diagnostics.llamaLatencyMs}ms)`
                : 'Offline'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Embedding Engine (127.0.0.1:8081):</Text>
            <Text style={[styles.statusVal, diagnostics.embeddingServerStatus === 'connected' ? styles.valOk : styles.valErr]}>
              {diagnostics.embeddingServerStatus === 'connected'
                ? `Online (${diagnostics.embeddingLatencyMs}ms)`
                : 'Offline'}
            </Text>
          </View>
        </View>

        {statusNote && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{statusNote}</Text>
          </View>
        )}

        {/* Intent trigger */}
        <Pressable style={styles.startBtn} onPress={handleTriggerIntent}>
          <Play size={14} color="#ffffff" fill="#ffffff" />
          <Text style={styles.startBtnText}>Dispatch Termux RUN_COMMAND</Text>
        </Pressable>
      </View>

      {/* Setup Checklist */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Termux Setup Requirements</Text>
        <Text style={styles.checklistIntro}>
          Before automatic startup works, ensure these 3 Android setup steps are completed:
        </Text>

        <View style={styles.checkItem}>
          <Text style={styles.checkNum}>1.</Text>
          <Text style={styles.checkBody}>
            Grant "Run commands in Termux" in Android App Info → CloverPal → Permissions.
          </Text>
        </View>

        <View style={styles.checkItem}>
          <Text style={styles.checkNum}>2.</Text>
          <Text style={styles.checkBody}>
            In Termux, add <Text style={styles.monoText}>allow-external-apps=true</Text> to <Text style={styles.monoText}>~/.termux/termux.properties</Text>.
          </Text>
        </View>

        <View style={styles.checkItem}>
          <Text style={styles.checkNum}>3.</Text>
          <Text style={styles.checkBody}>
            Place your launcher at <Text style={styles.monoText}>~/.termux/start_ai_service.sh</Text> and run <Text style={styles.monoText}>chmod +x</Text>.
          </Text>
        </View>
      </View>

      {/* Generation Parameters */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Sliders size={18} color={theme.colors.emeraldText} />
          <Text style={styles.cardTitle}>Generation Controls</Text>
        </View>

        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Temperature (0.1 - 1.5):</Text>
          <TextInput
            style={styles.paramInput}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Top P Nucleus (0.1 - 1.0):</Text>
          <TextInput
            style={styles.paramInput}
            value={topP}
            onChangeText={setTopP}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.paramRow}>
          <Text style={styles.paramLabel}>Max Tokens:</Text>
          <TextInput
            style={styles.paramInput}
            value={maxTokens}
            onChangeText={setMaxTokens}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Experimental Features */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Cpu size={18} color={theme.colors.amber} />
          <Text style={styles.cardTitle}>Experimental Engine Modes</Text>
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Enable Prism ML (Port 8000)</Text>
            <Text style={styles.switchDesc}>
              Experimental, not verified on hardware.
            </Text>
          </View>
          <Switch
            value={enablePrism}
            onValueChange={setEnablePrism}
            trackColor={{ false: '#1e293b', true: theme.colors.emeraldDark }}
            thumbColor={enablePrism ? theme.colors.emerald : '#94a3b8'}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Keyword-Only RAG Fallback</Text>
            <Text style={styles.switchDesc}>
              Uses 384-dim keyword hashing when embedding server on 8081 is stopped.
            </Text>
          </View>
          <Switch
            value={keywordOnlyRAG}
            onValueChange={setKeywordOnlyRAG}
            trackColor={{ false: '#1e293b', true: theme.colors.emeraldDark }}
            thumbColor={keywordOnlyRAG ? theme.colors.emerald : '#94a3b8'}
          />
        </View>
      </View>

      {/* Database Backup */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <HardDrive size={18} color={theme.colors.emeraldText} />
          <Text style={styles.cardTitle}>SQLite Backup & Restore</Text>
        </View>
        <Text style={styles.checklistIntro}>
          Export conversations, custom personas, and indexed document chunks to a JSON file.
        </Text>

        <View style={styles.backupBtns}>
          <Pressable style={styles.backupBtn} onPress={handleExportBackup}>
            <Download size={14} color="#ffffff" />
            <Text style={styles.backupBtnText}>Export JSON</Text>
          </Pressable>

          <Pressable style={[styles.backupBtn, styles.restoreBtn]} onPress={handleImportBackup}>
            <Upload size={14} color="#ffffff" />
            <Text style={styles.backupBtnText}>Restore Backup</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  probeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.bgCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  probeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.emeraldText,
  },
  statusRows: {
    backgroundColor: '#050b14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusVal: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  valOk: {
    color: theme.colors.emeraldText,
  },
  valErr: {
    color: '#ef4444',
  },
  noteBox: {
    backgroundColor: '#0a101f',
    padding: 8,
    borderRadius: 6,
  },
  noteText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#94a3b8',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.emeraldDark,
    paddingVertical: 10,
    borderRadius: 10,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  checklistIntro: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },
  checkItem: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  checkNum: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.emeraldText,
  },
  checkBody: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 17,
    flex: 1,
  },
  monoText: {
    fontFamily: 'monospace',
    color: '#34d399',
    backgroundColor: '#0f172a',
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paramLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  paramInput: {
    backgroundColor: theme.colors.bgInput,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontFamily: 'monospace',
    color: theme.colors.textPrimary,
    width: 80,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchInfo: {
    flex: 1,
    paddingRight: 10,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  switchDesc: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  backupBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  backupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
  },
  restoreBtn: {
    backgroundColor: '#1e1b4b',
    borderColor: '#4338ca',
  },
  backupBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
