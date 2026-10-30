/**
 * ChatScreen - Primary CloverPal-inspired conversational interface.
 * Features streaming responses, rich markdown/code/math rendering, citation drawers,
 * generation controls, context budget tracker, and real-time Termux status.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Paperclip,
  RotateCw,
  Copy,
  Trash2,
  ChevronDown,
  Cpu,
  Layers,
  Settings2,
  FileText,
  X,
  Volume2,
} from 'lucide-react';
import {
  CharacterCard,
  Citation,
  Conversation,
  EngineType,
  GenerationSettings,
  Message,
  ResponseFormattingMode,
} from '../../types';
import { db } from '../../services/database/SQLiteDatabase';
import { runtimeManager } from '../../services/runtime/RuntimeConnectionManager';
import { retriever } from '../../services/rag/HybridRetriever';
import { contextAssembler } from '../../services/rag/ContextAssembler';
import { conversationMemoryService } from '../../services/memory/ConversationMemoryService';
import { RichResponseRenderer } from './RichResponseRenderer';

interface ChatScreenProps {
  conversation: Conversation;
  onUpdateConversation?: (conv: Conversation) => void;
  onOpenSettings?: () => void;
  onSelectCharacter?: (char: CharacterCard) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  conversation,
  onUpdateConversation,
  onOpenSettings,
  onSelectCharacter,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTokensPerSec, setCurrentTokensPerSec] = useState<number | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [responseMode, setResponseMode] = useState<ResponseFormattingMode>('automatic');
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [activeModel, setActiveModel] = useState(conversation.modelId);
  const [activeEngine, setActiveEngine] = useState<EngineType>(conversation.engine);
  const [contextTokens, setContextTokens] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const character = db.getCharacterById(conversation.characterId || 'char-clover');

  // Generation parameters state
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    minP: 0.05,
    repeatPenalty: 1.1,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    maxTokens: 2048,
    contextLength: 4096,
    seed: 42,
    stopSequences: ['<|eot_id|>', '<|end_of_text|>', 'User:', 'Human:'],
    mirostat: 0,
    streaming: true,
    responseMode: 'automatic',
  });

  // Load messages from DB
  useEffect(() => {
    const loaded = db.getMessages(conversation.id);
    setMessages(loaded);
    calculateContextTokens(loaded);
  }, [conversation.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const calculateContextTokens = (msgs: Message[]) => {
    const totalChars = msgs.reduce((acc, m) => acc + m.content.length, 0);
    setContextTokens(Math.ceil(totalChars / 4));
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText('');

    // 1. Create and store user message
    const userMsg: Message = {
      id: `msg-${Date.now()}-u`,
      conversationId: conversation.id,
      senderType: 'user',
      senderName: 'You',
      content: text,
      createdAt: Date.now(),
      status: 'complete',
    };
    db.saveMessage(userMsg);
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // 2. Local RAG Retrieval
    let retrievedCitations: Citation[] = [];
    let systemPromptToUse = character?.systemPrompt || 'You are a helpful local offline assistant.';

    try {
      const chunks = await retriever.retrieve(text, {
        topK: 3,
        minRelevanceScore: 0.2,
        collectionIds: conversation.activeCollectionIds,
      });

      if (chunks.length > 0) {
        const memories = db.getMemories();
        const assembled = contextAssembler.assembleContext(systemPromptToUse, chunks, memories);
        systemPromptToUse = assembled.augmentedSystemPrompt;
        retrievedCitations = assembled.citations;
      }
    } catch {
      // Continue without RAG if retrieval encounters no documents
    }

    // Apply response formatting instructions if chosen
    if (responseMode !== 'automatic') {
      systemPromptToUse += `\n\n[RESPONSE FORMAT CONSTRAINT]: Please format your answer in "${responseMode}" style.`;
    }

    // 3. Prepare assistant placeholder
    const assistantMsgId = `msg-${Date.now()}-a`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      conversationId: conversation.id,
      senderType: 'assistant',
      senderId: character?.id,
      senderName: character?.name || 'Assistant',
      senderAvatar: character?.avatarUrl,
      content: '',
      citations: retrievedCitations,
      formatMode: responseMode,
      createdAt: Date.now(),
      status: 'streaming',
    };

    setMessages([...updatedMessages, initialAssistantMsg]);
    setIsGenerating(true);
    setCurrentTokensPerSec(null);

    // 4. Stream response from selected offline engine
    const engine = runtimeManager.getActiveEngine();
    let accumulatedContent = '';

    try {
      await engine.streamGenerate(
        text,
        systemPromptToUse,
        generationSettings,
        (chunk) => {
          accumulatedContent += chunk.token;
          if (chunk.stats?.tokensPerSecond) {
            setCurrentTokensPerSec(chunk.stats.tokensPerSecond);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: accumulatedContent,
                    stats: chunk.stats || m.stats,
                    status: chunk.isFinished ? 'complete' : 'streaming',
                  }
                : m
            )
          );
        }
      );

      const finalMsg: Message = {
        ...initialAssistantMsg,
        content: accumulatedContent,
        status: 'complete',
      };
      db.saveMessage(finalMsg);
      calculateContextTokens([...updatedMessages, finalMsg]);
    } catch (err: any) {
      // Check if server offline - provide graceful actionable notification
      const isConnectionErr =
        err?.message?.includes('fetch') || err?.message?.includes('network') || err?.name === 'TypeError';

      let fallbackText = '';
      if (isConnectionErr) {
        fallbackText = `⚠️ **Termux Loopback Offline (${activeEngine})**\n\nThe local AI server on port **${
          activeEngine === 'llama.cpp' ? 8080 : 8000
        }** is not currently responding.\n\n### Quick Recovery:\n1. Open the **Settings & Termux** tab at the bottom.\n2. Tap **"Trigger Termux RUN_COMMAND"** or run \`bash ~/.termux/start_ai_service.sh\`.\n3. Verify your \`.gguf\` model exists in \`~/models/\`.\n\n*All chat history and local documents remain safely stored on this device.*`;
      } else {
        fallbackText = `⚠️ Generation halted: ${err?.message || 'Local execution stopped'}`;
      }

      const errMessage: Message = {
        ...initialAssistantMsg,
        content: fallbackText,
        status: 'error',
      };
      db.saveMessage(errMessage);
      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? errMessage : m)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGeneration = () => {
    runtimeManager.getActiveEngine().stopGeneration();
    setIsGenerating(false);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleDeleteMessage = (id: string) => {
    db.deleteMessage(id);
    const updated = messages.filter((m) => m.id !== id);
    setMessages(updated);
    calculateContextTokens(updated);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {character && (
            <img
              src={character.avatarUrl}
              alt={character.name}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30 shrink-0"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {character?.name || conversation.title}
              </span>
              <span className="text-[11px] px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 font-mono border border-emerald-200/50 dark:border-emerald-800/50">
                {activeEngine}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {character?.tagline || activeModel}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Context Token Indicator */}
          <div
            className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800"
            title="Estimated context tokens used"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>{contextTokens} / 4096</span>
          </div>

          {/* Quick Settings Action */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Engine & Generation Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 dark:text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3 shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Start Conversation with {character?.name || 'Local AI'}
            </h3>
            <p className="text-xs max-w-sm mt-1 text-slate-500 dark:text-slate-400">
              Running 100% offline via {activeEngine}. Documents added in the Knowledge Base will be
              automatically referenced.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.senderType === 'user';

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} group`}
              >
                {!isUser && (
                  <img
                    src={msg.senderAvatar || character?.avatarUrl}
                    alt={msg.senderName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-slate-200 dark:ring-slate-800"
                    referrerPolicy="no-referrer"
                  />
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-xs transition-all ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-bl-xs'
                  }`}
                >
                  {!isUser && (
                    <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-slate-100 dark:border-slate-800/60 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {msg.senderName}
                      </span>
                      {msg.stats?.tokensPerSecond ? (
                        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                          {msg.stats.tokensPerSecond} t/s
                        </span>
                      ) : null}
                    </div>
                  )}

                  {isUser ? (
                    <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <RichResponseRenderer
                      content={msg.content}
                      citations={msg.citations}
                      onCitationClick={(c) => setActiveCitation(c)}
                      isStreaming={msg.status === 'streaming'}
                    />
                  )}

                  {/* Message Action Tray */}
                  <div
                    className={`flex items-center gap-2 mt-2 pt-1.5 text-[11px] ${
                      isUser
                        ? 'text-emerald-100 border-t border-emerald-500/40 justify-end'
                        : 'text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/40'
                    }`}
                  >
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.content)}
                      className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors ml-1"
                      title="Copy content"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="hover:text-red-500 transition-colors"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Citation Detail Bottom Drawer */}
      {activeCitation && (
        <div className="absolute inset-x-0 bottom-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shadow-xl animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-semibold">
                [{activeCitation.id}]
              </span>
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                {activeCitation.documentName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveCitation(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {activeCitation.sectionHeader && (
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Section: {activeCitation.sectionHeader}
            </div>
          )}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed max-h-36 overflow-y-auto">
            {activeCitation.excerpt}
          </div>
        </div>
      )}

      {/* Input Composer Tray */}
      <div className="p-3 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shrink-0">
        {/* Quick Format Mode & Engine Bar */}
        <div className="flex items-center justify-between mb-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs transition-colors"
              >
                <span>Mode: {responseMode}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showModeDropdown && (
                <div className="absolute bottom-8 left-0 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 z-40 max-h-48 overflow-y-auto">
                  {(
                    [
                      'automatic',
                      'concise',
                      'detailed',
                      'coding',
                      'analytical',
                      'step-by-step',
                      'tables',
                      'markdown',
                    ] as ResponseFormattingMode[]
                  ).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setResponseMode(m);
                        setShowModeDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        responseMode === m
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {currentTokensPerSec !== null && (
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                ⚡ {currentTokensPerSec} t/s
              </span>
            )}
          </div>
        </div>

        {/* Text Input Row */}
        <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1.5 border border-slate-200 dark:border-slate-700/60 focus-within:ring-2 focus-within:ring-emerald-500/40 transition-all">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={`Message ${character?.name || 'Local AI'}...`}
            rows={1}
            className="flex-1 bg-transparent border-0 resize-none px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none max-h-32"
          />

          {isGenerating ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shrink-0 shadow-sm"
              title="Stop generation"
            >
              <Square className="w-4 h-4 fill-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputText.trim()}
              className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors shrink-0 shadow-sm"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
