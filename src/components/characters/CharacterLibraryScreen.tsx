/**
 * CharacterLibraryScreen
 * Displays character cards with CloverPal visual aesthetics, categories, search,
 * character editor modal, and Character Card V2 JSON import/export.
 */

import React, { useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Edit2,
  Trash2,
  Download,
  Upload,
  Sparkles,
  BookOpen,
  Code,
  Heart,
  X,
  Check,
} from 'lucide-react';
import { CharacterCard, ResponseFormattingMode } from '../../types';
import { db } from '../../services/database/SQLiteDatabase';

interface CharacterLibraryScreenProps {
  onStartChatWithCharacter: (character: CharacterCard) => void;
}

export const CharacterLibraryScreen: React.FC<CharacterLibraryScreenProps> = ({
  onStartChatWithCharacter,
}) => {
  const [characters, setCharacters] = useState<CharacterCard[]>(db.getCharacters());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [editingCard, setEditingCard] = useState<CharacterCard | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const categories = ['All', 'Companion', 'Technical', 'Academic', 'Creative'];

  const filteredCharacters = characters.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.personality.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleSaveCharacter = (card: CharacterCard) => {
    db.saveCharacter(card);
    setCharacters(db.getCharacters());
    setEditingCard(null);
    setIsCreatingNew(false);
  };

  const handleDeleteCharacter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this character card?')) {
      db.deleteCharacter(id);
      setCharacters(db.getCharacters());
    }
  };

  const handleExportCard = (card: CharacterCard, e: React.MouseEvent) => {
    e.stopPropagation();
    // Character Card V2 export format
    const exportData = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: card.name,
        description: card.tagline,
        personality: card.personality,
        system_prompt: card.systemPrompt,
        first_mes: card.greetingMessage,
        mes_example: card.exampleDialogue,
        creator_notes: 'Created in CloverPal Offline AI Client',
        category: card.category,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${card.name.toLowerCase().replace(/\s+/g, '_')}_card.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const data = json.data || json;
        const newCard: CharacterCard = {
          id: `char-${Date.now()}`,
          name: data.name || 'Imported Persona',
          tagline: data.description || 'Custom character',
          description: data.description || '',
          avatarUrl:
            data.avatar ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
          personality: data.personality || '',
          systemPrompt: data.system_prompt || 'You are an offline assistant.',
          greetingMessage: data.first_mes || 'Greetings!',
          exampleDialogue: data.mes_example || '',
          category: data.category || 'Companion',
          responseMode: 'detailed',
          memoryScope: 'private',
          createdAt: Date.now(),
        };
        db.saveCharacter(newCard);
        setCharacters(db.getCharacters());
      } catch {
        alert('Invalid Character Card JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Character Library
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distinct offline personas with private memory scopes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs">
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
            <input type="file" accept=".json" onChange={handleImportCard} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => {
              setIsCreatingNew(true);
              setEditingCard({
                id: `char-${Date.now()}`,
                name: '',
                tagline: '',
                description: '',
                avatarUrl:
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&h=256&q=80',
                personality: '',
                systemPrompt: '',
                greetingMessage: '',
                exampleDialogue: '',
                category: 'Companion',
                responseMode: 'detailed',
                memoryScope: 'private',
                createdAt: Date.now(),
              });
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Persona</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Categories */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search characters by name, traits, or domain..."
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs"
          />
        </div>

        {/* Categories Tab Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Character Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredCharacters.map((card) => (
          <div
            key={card.id}
            onClick={() => onStartChatWithCharacter(card)}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between group relative"
          >
            <div>
              <div className="flex items-start gap-3.5">
                <img
                  src={card.avatarUrl}
                  alt={card.name}
                  className="w-14 h-14 rounded-2xl object-cover ring-2 ring-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {card.name}
                    </h3>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {card.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {card.tagline}
                  </p>
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-2 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Mode: {card.responseMode}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => handleExportCard(card, e)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Export Character Card V2 JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCard(card);
                    setIsCreatingNew(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Edit character"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteCharacter(card.id, e)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Delete character"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Character Modal */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isCreatingNew ? 'Create New Persona' : `Edit ${editingCard.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editingCard.name}
                  onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })}
                  placeholder="e.g. Athena"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={editingCard.tagline}
                  onChange={(e) => setEditingCard({ ...editingCard, tagline: e.target.value })}
                  placeholder="e.g. Polymath Research Scholar"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Avatar Image URL
                </label>
                <input
                  type="text"
                  value={editingCard.avatarUrl}
                  onChange={(e) => setEditingCard({ ...editingCard, avatarUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Category
                  </label>
                  <select
                    value={editingCard.category}
                    onChange={(e) => setEditingCard({ ...editingCard, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {categories.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Response Style
                  </label>
                  <select
                    value={editingCard.responseMode}
                    onChange={(e) =>
                      setEditingCard({
                        ...editingCard,
                        responseMode: e.target.value as ResponseFormattingMode,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="automatic">Automatic</option>
                    <option value="detailed">Detailed</option>
                    <option value="concise">Concise</option>
                    <option value="coding">Coding</option>
                    <option value="analytical">Analytical</option>
                    <option value="markdown">Markdown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Personality & Tone
                </label>
                <textarea
                  value={editingCard.personality}
                  onChange={(e) =>
                    setEditingCard({ ...editingCard, personality: e.target.value })
                  }
                  rows={2}
                  placeholder="e.g. Analytical, erudite, concise..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  System Prompt
                </label>
                <textarea
                  value={editingCard.systemPrompt}
                  onChange={(e) =>
                    setEditingCard({ ...editingCard, systemPrompt: e.target.value })
                  }
                  rows={3}
                  placeholder="Instructions for the local LLM when roleplaying this character..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Greeting Message
                </label>
                <textarea
                  value={editingCard.greetingMessage}
                  onChange={(e) =>
                    setEditingCard({ ...editingCard, greetingMessage: e.target.value })
                  }
                  rows={2}
                  placeholder="The first greeting sent when opening a new chat..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveCharacter(editingCard)}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                Save Character
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
