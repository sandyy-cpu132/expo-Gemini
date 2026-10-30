/**
 * SettingsScreen
 * Termux connection diagnostics, engine switching, generation parameters with presets,
 * shell script exporter, dark/light theme toggle, and offline database backup.
 */

import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Activity,
  Sliders,
  Cpu,
  Moon,
  Sun,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Play,
  ShieldCheck,
  HardDrive,
  FileCode,
} from 'lucide-react';
import { EngineType, GenerationSettings, RuntimeDiagnostics } from '../../types';
import { runtimeManager } from '../../services/runtime/RuntimeConnectionManager';
import { termuxIntegration } from '../../../modules/termux-integration';
import { db } from '../../services/database/SQLiteDatabase';

interface SettingsScreenProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ isDarkMode, onToggleTheme }) => {
  const [activeEngine, setActiveEngine] = useState<EngineType>(runtimeManager.getActiveEngineType());
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(runtimeManager.getDiagnostics());
  const [isProbing, setIsProbing] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [runCommandOutput, setRunCommandOutput] = useState<string | null>(null);

  // Generation parameters
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [topK, setTopK] = useState(40);
  const [minP, setMinP] = useState(0.05);
  const [repeatPenalty, setRepeatPenalty] = useState(1.1);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [mirostat, setMirostat] = useState<0 | 1 | 2>(0);
  const [activePreset, setActivePreset] = useState<string>('Balanced');

  useEffect(() => {
    handleProbe();
  }, []);

  const handleProbe = async () => {
    setIsProbing(true);
    const diag = await runtimeManager.probeAllEngines();
    setDiagnostics(diag);
    setIsProbing(false);
  };

  const handleSwitchEngine = async (engine: EngineType) => {
    setActiveEngine(engine);
    await runtimeManager.switchEngine(engine);
    handleProbe();
  };

  const handleTriggerTermuxIntent = async () => {
    setRunCommandOutput('Dispatching Android RUN_COMMAND Intent to Termux...');
    const result = await termuxIntegration.startTermuxService(
      '~/.termux/start_ai_service.sh',
      activeEngine,
      activeEngine === 'llama.cpp' ? 8080 : 8000
    );
    setRunCommandOutput(result.message);
    setTimeout(handleProbe, 2000);
  };

  const applyPreset = (preset: 'Balanced' | 'Creative' | 'Precise' | 'Coding' | 'Analytical') => {
    setActivePreset(preset);
    switch (preset) {
      case 'Balanced':
        setTemperature(0.7);
        setTopP(0.9);
        setTopK(40);
        setMinP(0.05);
        setRepeatPenalty(1.1);
        break;
      case 'Creative':
        setTemperature(1.0);
        setTopP(0.95);
        setTopK(60);
        setMinP(0.03);
        setRepeatPenalty(1.05);
        break;
      case 'Precise':
        setTemperature(0.2);
        setTopP(0.85);
        setTopK(20);
        setMinP(0.1);
        setRepeatPenalty(1.15);
        break;
      case 'Coding':
        setTemperature(0.2);
        setTopP(0.9);
        setTopK(30);
        setMinP(0.08);
        setRepeatPenalty(1.1);
        break;
      case 'Analytical':
        setTemperature(0.3);
        setTopP(0.85);
        setTopK(25);
        setMinP(0.05);
        setRepeatPenalty(1.12);
        break;
    }
  };

  const handleCopyScript = () => {
    const script = termuxIntegration.generateTermuxSetupScript();
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleExportBackup = () => {
    const json = db.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloverpal_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const ok = db.importBackupJson(event.target?.result as string);
      if (ok) {
        alert('Database backup restored successfully.');
        window.location.reload();
      } else {
        alert('Failed to parse backup JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-20 space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Settings & Termux
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Termux bridge, engine selection, generation controls, and local backup
          </p>
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Termux Connection Diagnostics Hub */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Termux Runtime Status
            </h3>
          </div>
          <button
            type="button"
            onClick={handleProbe}
            disabled={isProbing}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
            <span>Probe Sockets</span>
          </button>
        </div>

        {/* Socket Probe Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* llama.cpp Card */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              diagnostics.llamaStatus === 'connected'
                ? 'border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                llama.cpp Engine
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800">
                127.0.0.1:8080
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              {diagnostics.llamaStatus === 'connected' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    Online ({diagnostics.llamaLatencyMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-slate-500 dark:text-slate-400">Offline / Standby</span>
                </>
              )}
            </div>
          </div>

          {/* Prism ML Card */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              diagnostics.prismStatus === 'connected'
                ? 'border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                Prism ML Engine
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800">
                127.0.0.1:8000
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              {diagnostics.prismStatus === 'connected' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    Online ({diagnostics.prismLatencyMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-slate-500 dark:text-slate-400">Offline / Standby</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleTriggerTermuxIntent}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Trigger Termux RUN_COMMAND</span>
          </button>

          <button
            type="button"
            onClick={handleCopyScript}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedScript ? 'Script Copied!' : 'Copy start_ai_service.sh'}</span>
          </button>
        </div>

        {runCommandOutput && (
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
            {runCommandOutput}
          </div>
        )}
      </div>

      {/* Engine Switcher */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Select Active Inference Engine
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleSwitchEngine('llama.cpp')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeEngine === 'llama.cpp'
                ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="font-semibold text-xs text-slate-900 dark:text-white">llama.cpp</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Optimized for GGUF models, low RAM & ARM NEON
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchEngine('prism-ml')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeEngine === 'prism-ml'
                ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="font-semibold text-xs text-slate-900 dark:text-white">Prism ML</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Custom mobile runtime adapter with configurable REST endpoints
            </div>
          </button>
        </div>
      </div>

      {/* Generation Parameters & Presets */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Generation Parameters
            </h3>
          </div>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            {activePreset}
          </span>
        </div>

        {/* Presets Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['Balanced', 'Creative', 'Precise', 'Coding', 'Analytical'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activePreset === p
                  ? 'bg-slate-900 text-white dark:bg-emerald-600'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Temperature</span>
              <span className="font-mono text-emerald-600">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Top P (Nucleus)</span>
              <span className="font-mono text-emerald-600">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Top K</span>
              <span className="font-mono text-emerald-600">{topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Repeat Penalty</span>
              <span className="font-mono text-emerald-600">{repeatPenalty.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="1.5"
              step="0.02"
              value={repeatPenalty}
              onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Max Tokens</span>
              <span className="font-mono text-emerald-600">{maxTokens}</span>
            </div>
            <input
              type="range"
              min="256"
              max="4096"
              step="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div>
            <div className="flex justify-between font-medium mb-1">
              <span>Mirostat Mode</span>
              <span className="font-mono text-emerald-600">
                {mirostat === 0 ? 'Disabled' : `v${mirostat}`}
              </span>
            </div>
            <select
              value={mirostat}
              onChange={(e) => setMirostat(parseInt(e.target.value, 10) as any)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="0">0 - Disabled</option>
              <option value="1">1 - Mirostat v1</option>
              <option value="2">2 - Mirostat v2</option>
            </select>
          </div>
        </div>
      </div>

      {/* Offline Database & Backup */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Offline Storage & Backup
          </h3>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          All conversations, custom characters, indexed RAG chunks, and memories are stored purely
          in local SQLite with zero external cloud sync.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Database JSON</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Restore Backup</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
};
