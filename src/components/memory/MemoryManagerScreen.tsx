/**
 * MemoryManagerScreen
 * Manages personal memories, user preferences, and important facts.
 * Injected selectively into system prompts without cross-character contamination.
 */

import React, { useState } from 'react';
import {
  Brain,
  Plus,
  Search,
  Trash2,
  Tag,
  Star,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { PersonalMemory } from '../../types';
import { db } from '../../services/database/SQLiteDatabase';
import { personalMemoryService } from '../../services/memory/PersonalMemoryService';

export const MemoryManagerScreen: React.FC = () => {
  const [memories, setMemories] = useState<PersonalMemory[]>(db.getMemories());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Memory Form
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PersonalMemory['category']>('preference');
  const [importance, setImportance] = useState<PersonalMemory['importance']>(4);

  const filtered = personalMemoryService.searchMemories(searchQuery);

  const handleAddMemory = () => {
    if (!content.trim()) return;

    personalMemoryService.saveMemory({
      category,
      content,
      importance,
    });

    setMemories(db.getMemories());
    setShowAddModal(false);
    setContent('');
  };

  const handleDelete = (id: string) => {
    personalMemoryService.deleteMemory(id);
    setMemories(db.getMemories());
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Personal Memory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            User preferences and explicit facts injected into offline prompts
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Fact</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search personal memories..."
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-xs"
        />
      </div>

      {/* Memory Items List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            No memories found matching your search.
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-start justify-between gap-3 group"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50">
                    {m.category}
                  </span>
                  <div className="flex items-center text-amber-500 text-xs">
                    {Array.from({ length: m.importance }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                  {m.content}
                </p>
                <div className="text-[10px] text-slate-400">
                  Updated {new Date(m.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Delete memory item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Memory Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Add Personal Memory Fact
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Memory Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="preference">User Preference</option>
                  <option value="project">Project / Task Context</option>
                  <option value="bio">Personal Biography / Identity</option>
                  <option value="instruction">Special Formatting / Persona Rule</option>
                  <option value="fact">Empirical Fact</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Fact / Preference Statement
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  placeholder="e.g. Always generate code snippets in TypeScript with strict null checks."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Importance Rank (1 to 5)
                </label>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setImportance(r)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                        importance === r
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r} ★
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddMemory}
                disabled={!content.trim()}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"
              >
                Save Fact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
