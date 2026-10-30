/**
 * GroupChatScreen
 * Manages multi-character collaborative discussions with safe turn orchestration,
 * manual intervention, and loop prevention.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Plus,
  Play,
  Square,
  Sparkles,
  Send,
  Trash2,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { CharacterCard, GroupChat, Message } from '../../types';
import { db } from '../../services/database/SQLiteDatabase';
import { groupChatOrchestrator, GroupTurnEvent } from '../../services/group/GroupChatOrchestrator';
import { RichResponseRenderer } from '../chat/RichResponseRenderer';

export const GroupChatScreen: React.FC = () => {
  const [groups, setGroups] = useState<GroupChat[]>(db.getGroups());
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(groups[0] || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<CharacterCard | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(['char-clover', 'char-aegis']);
  const [turnMode, setTurnMode] = useState<'auto-moderated' | 'round-robin' | 'manual-mention'>('auto-moderated');

  const allCharacters = db.getCharacters();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation for group
  useEffect(() => {
    if (activeGroup) {
      const convId = `conv-group-${activeGroup.id}`;
      let conv = db.getConversationById(convId);
      if (!conv) {
        conv = {
          id: convId,
          title: activeGroup.name,
          groupId: activeGroup.id,
          engine: 'llama.cpp',
          modelId: 'llama-3.2-3b-instruct-q4_k_m.gguf',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        db.saveConversation(conv);
      }
      setMessages(db.getMessages(convId));
    }
  }, [activeGroup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentSpeaker]);

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedCharIds.length < 2) return;

    const newGroup: GroupChat = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      description: `Collaborative dialogue between ${selectedCharIds.length} personas.`,
      characterIds: selectedCharIds,
      turnMode,
      createdAt: Date.now(),
    };

    db.saveGroup(newGroup);
    const updated = db.getGroups();
    setGroups(updated);
    setActiveGroup(newGroup);
    setShowCreateModal(false);
    setNewGroupName('');
  };

  const handleSendUserMessage = async () => {
    if (!inputText.trim() || !activeGroup || isOrchestrating) return;

    const convId = `conv-group-${activeGroup.id}`;
    const userMsg: Message = {
      id: `msg-${Date.now()}-u`,
      conversationId: convId,
      senderType: 'user',
      senderName: 'You',
      content: inputText.trim(),
      createdAt: Date.now(),
      status: 'complete',
    };

    db.saveMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    groupChatOrchestrator.resetLoopGuard();

    // Trigger next turn
    handleNextTurn(convId);
  };

  const handleNextTurn = async (convId?: string, forcedCharId?: string) => {
    if (!activeGroup || isOrchestrating) return;
    const targetConvId = convId || `conv-group-${activeGroup.id}`;

    setIsOrchestrating(true);
    try {
      await groupChatOrchestrator.executeGroupTurn(
        targetConvId,
        activeGroup,
        (event: GroupTurnEvent) => {
          if (event.status === 'thinking') {
            setCurrentSpeaker(event.character);
          } else if (event.status === 'completed' && event.message) {
            setMessages((prev) => [...prev, event.message!]);
            setCurrentSpeaker(null);
          } else if (event.status === 'skipped') {
            setCurrentSpeaker(null);
          }
        },
        forcedCharId
      );
    } finally {
      setIsOrchestrating(false);
      setCurrentSpeaker(null);
    }
  };

  const handleStop = () => {
    groupChatOrchestrator.stopOrchestration();
    setIsOrchestrating(false);
    setCurrentSpeaker(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
              {activeGroup ? activeGroup.name : 'Group Discussions'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {activeGroup
                ? `${activeGroup.characterIds.length} Participants · Mode: ${activeGroup.turnMode}`
                : 'Multi-character orchestration'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Group</span>
        </button>
      </header>

      {/* Main Group Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Groups Sidebar (Desktop/Tablet) */}
        <div className="w-48 border-r border-slate-200 dark:border-slate-800 p-2 hidden sm:flex flex-col gap-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            Rooms ({groups.length})
          </span>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={`text-left px-3 py-2 rounded-xl text-xs font-medium truncate transition-colors ${
                activeGroup?.id === g.id
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Conversation Area */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {!activeGroup ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-medium">No Group Selected</p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                Create Room
              </button>
            </div>
          ) : (
            <>
              {/* Member Avatars Strip */}
              <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium shrink-0">
                    Participants:
                  </span>
                  {activeGroup.characterIds.map((cId) => {
                    const c = db.getCharacterById(cId);
                    if (!c) return null;
                    const isSpeakingNow = currentSpeaker?.id === c.id;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleNextTurn(undefined, c.id)}
                        disabled={isOrchestrating}
                        title={`Click to prompt ${c.name} to speak`}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all ${
                          isSpeakingNow
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/80 ring-2 ring-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/50'
                        }`}
                      >
                        <img
                          src={c.avatarUrl}
                          alt={c.name}
                          className="w-4 h-4 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="font-medium text-[11px]">{c.name}</span>
                        {isSpeakingNow && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {isOrchestrating && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                  >
                    <Square className="w-3 h-3 fill-white" />
                    <span>Stop</span>
                  </button>
                )}
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  const isUser = msg.senderType === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <img
                          src={
                            msg.senderAvatar ||
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80'
                          }
                          alt={msg.senderName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-slate-200 dark:ring-slate-800"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-xs ${
                          isUser
                            ? 'bg-emerald-600 text-white rounded-br-xs'
                            : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-bl-xs'
                        }`}
                      >
                        {!isUser && (
                          <div className="font-semibold text-xs text-slate-900 dark:text-white mb-1">
                            {msg.senderName}
                          </div>
                        )}
                        <RichResponseRenderer content={msg.content} />
                      </div>
                    </div>
                  );
                })}

                {currentSpeaker && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 animate-pulse pl-2">
                    <img
                      src={currentSpeaker.avatarUrl}
                      alt={currentSpeaker.name}
                      className="w-5 h-5 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span>{currentSpeaker.name} is responding to the room...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Group Chat Input */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1.5 border border-slate-200 dark:border-slate-700">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendUserMessage()}
                    placeholder="Speak to the group or mention @Name..."
                    className="flex-1 bg-transparent border-0 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendUserMessage}
                    disabled={!inputText.trim() || isOrchestrating}
                    className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Create Multi-Character Discussion
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Room Topic / Name
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Systems Architecture Roundtable"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Participating Personas (min 2)
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {allCharacters.map((c) => {
                    const isChecked = selectedCharIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                          isChecked
                            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCharIds([...selectedCharIds, c.id]);
                            } else {
                              setSelectedCharIds(selectedCharIds.filter((id) => id !== c.id));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <img
                          src={c.avatarUrl}
                          alt={c.name}
                          className="w-5 h-5 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-[10px] text-slate-400 truncate">({c.tagline})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Turn-Taking Mode
                </label>
                <select
                  value={turnMode}
                  onChange={(e) => setTurnMode(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="auto-moderated">Auto-Moderated (Based on topic context)</option>
                  <option value="round-robin">Round-Robin (Fixed rotation)</option>
                  <option value="manual-mention">Manual Mention (Triggered via @Name)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedCharIds.length < 2}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
