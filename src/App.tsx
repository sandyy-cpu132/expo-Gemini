/**
 * CloverPal Offline AI Client
 * Main Application Shell inspired by CloverPal & ChatterUI
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users2,
  BookOpen,
  Brain,
  Settings,
  Sparkles,
  Smartphone,
  Maximize2,
  Terminal,
  Activity,
  Plus,
  ChevronRight,
  WifiOff,
} from 'lucide-react';
import { CharacterCard, Conversation, EngineStatus, EngineType } from './types';
import { db } from './services/database/SQLiteDatabase';
import { runtimeManager, ConnectionEvent } from './services/runtime/RuntimeConnectionManager';
import { ChatScreen } from './components/chat/ChatScreen';
import { CharacterLibraryScreen } from './components/characters/CharacterLibraryScreen';
import { GroupChatScreen } from './components/groups/GroupChatScreen';
import { KnowledgeBaseScreen } from './components/knowledge/KnowledgeBaseScreen';
import { MemoryManagerScreen } from './components/memory/MemoryManagerScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';

type Tab = 'chat' | 'characters' | 'groups' | 'knowledge' | 'memory' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [conversations, setConversations] = useState<Conversation[]>(db.getConversations());
  const [activeConversation, setActiveConversation] = useState<Conversation>(
    conversations[0] || {
      id: 'conv-default',
      title: 'Chat with Clover',
      characterId: 'char-clover',
      engine: 'llama.cpp',
      modelId: 'llama-3.2-3b-instruct-q4_k_m.gguf',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  );

  const [engineStatus, setEngineStatus] = useState<EngineStatus>('disconnected');
  const [connectionEvent, setConnectionEvent] = useState<ConnectionEvent>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Initializing local runtime...');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(false);

  // Initialize Dark Mode on documentElement
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Subscribe to Runtime Connection Manager
  useEffect(() => {
    const unsubscribe = runtimeManager.subscribe({
      onStatusChange: (status, event, details) => {
        setEngineStatus(status);
        setConnectionEvent(event);
        if (details) setStatusMessage(details);
      },
    });

    // Auto-connect on launch
    runtimeManager.initializeConnection();

    return () => unsubscribe();
  }, []);

  const handleStartChatWithCharacter = (character: CharacterCard) => {
    // Find or create conversation with this character
    let conv = conversations.find((c) => c.characterId === character.id);
    if (!conv) {
      conv = {
        id: `conv-${character.id}-${Date.now()}`,
        title: `Chat with ${character.name}`,
        characterId: character.id,
        engine: runtimeManager.getActiveEngineType(),
        modelId: 'llama-3.2-3b-instruct-q4_k_m.gguf',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      db.saveConversation(conv);
      setConversations(db.getConversations());

      // Seed greeting message if not present
      if (character.greetingMessage) {
        db.saveMessage({
          id: `msg-${Date.now()}-greet`,
          conversationId: conv.id,
          senderType: 'assistant',
          senderId: character.id,
          senderName: character.name,
          senderAvatar: character.avatarUrl,
          content: character.greetingMessage,
          createdAt: Date.now(),
          status: 'complete',
        });
      }
    }
    setActiveConversation(conv);
    setActiveTab('chat');
  };

  const handleCreateNewChat = () => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Discussion',
      characterId: 'char-clover',
      engine: runtimeManager.getActiveEngineType(),
      modelId: 'llama-3.2-3b-instruct-q4_k_m.gguf',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.saveConversation(newConv);
    setConversations(db.getConversations());
    setActiveConversation(newConv);
    setActiveTab('chat');
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 items-center justify-center overflow-hidden font-sans">
      {/* Container: Smartphone frame or Full Viewport */}
      <div
        className={`flex flex-col overflow-hidden transition-all duration-300 ${
          isMobileFrame
            ? 'w-[410px] h-[870px] max-h-[96vh] rounded-[48px] shadow-2xl border-[10px] border-slate-900 dark:border-slate-800 ring-1 ring-white/10 relative'
            : 'w-full h-full'
        }`}
      >
        {/* Android Status Bar (Shown in mobile frame or top strip) */}
        <div className="h-8 bg-slate-900 text-slate-300 text-[11px] font-mono px-5 flex items-center justify-between shrink-0 select-none z-50">
          <div className="flex items-center gap-1.5">
            <span>12:42</span>
            <span className="w-1 h-1 rounded-full bg-slate-500" />
            <span className="text-[10px] text-emerald-400 font-sans font-semibold">CloverPal</span>
          </div>

          {/* Engine & Runtime Pill */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 cursor-pointer hover:bg-slate-700/80 transition-colors"
            onClick={() => setActiveTab('settings')}
            title={statusMessage}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                engineStatus === 'connected'
                  ? 'bg-emerald-500'
                  : engineStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              }`}
            />
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
              {runtimeManager.getActiveEngineType() === 'llama.cpp' ? 'llama :8080' : 'prism :8000'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span title="Fully local offline client">
              <WifiOff className="w-3 h-3 text-slate-400" />
            </span>
            <button
              type="button"
              onClick={() => setIsMobileFrame(!isMobileFrame)}
              className="text-slate-400 hover:text-white transition-colors"
              title={isMobileFrame ? 'Expand to Fullscreen' : 'Simulate Android Frame'}
            >
              {isMobileFrame ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Smartphone className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Content Screens */}
        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'chat' && (
            <ChatScreen
              conversation={activeConversation}
              onUpdateConversation={(c) => setActiveConversation(c)}
              onOpenSettings={() => setActiveTab('settings')}
              onSelectCharacter={(c) => handleStartChatWithCharacter(c)}
            />
          )}

          {activeTab === 'characters' && (
            <CharacterLibraryScreen
              onStartChatWithCharacter={(char) => handleStartChatWithCharacter(char)}
            />
          )}

          {activeTab === 'groups' && <GroupChatScreen />}

          {activeTab === 'knowledge' && <KnowledgeBaseScreen />}

          {activeTab === 'memory' && <MemoryManagerScreen />}

          {activeTab === 'settings' && (
            <SettingsScreen
              isDarkMode={isDarkMode}
              onToggleTheme={() => setIsDarkMode(!isDarkMode)}
            />
          )}
        </main>

        {/* Bottom Navigation Bar (CloverPal 5-Tab Ergonomic Strip) */}
        <nav className="h-16 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md flex items-center justify-around px-2 z-40 shrink-0 select-none">
          {/* 1. Chats */}
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'chat'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare
              className={`w-5 h-5 ${activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">Chats</span>
          </button>

          {/* 2. Personas */}
          <button
            type="button"
            onClick={() => setActiveTab('characters')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'characters'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles
              className={`w-5 h-5 ${activeTab === 'characters' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">Personas</span>
          </button>

          {/* 3. Groups */}
          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'groups'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users2
              className={`w-5 h-5 ${activeTab === 'groups' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">Groups</span>
          </button>

          {/* 4. Knowledge (RAG) */}
          <button
            type="button"
            onClick={() => setActiveTab('knowledge')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'knowledge'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen
              className={`w-5 h-5 ${activeTab === 'knowledge' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">RAG</span>
          </button>

          {/* 5. Memory */}
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'memory'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Brain
              className={`w-5 h-5 ${activeTab === 'memory' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">Memory</span>
          </button>

          {/* 6. Settings & Termux */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-colors ${
              activeTab === 'settings'
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Settings
              className={`w-5 h-5 ${activeTab === 'settings' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">Termux</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
