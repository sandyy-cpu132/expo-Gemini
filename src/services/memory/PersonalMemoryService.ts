/**
 * PersonalMemoryService
 * Manages explicit and extracted long-term user facts and preferences with relevance search.
 */

import { PersonalMemory } from '../../types';
import { db } from '../database/SQLiteDatabase';

export class PersonalMemoryService {
  public getMemories(): PersonalMemory[] {
    return db.getMemories();
  }

  public saveMemory(memory: Omit<PersonalMemory, 'id' | 'createdAt' | 'updatedAt'>, id?: string): PersonalMemory {
    const mem: PersonalMemory = {
      id: id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: memory.category,
      content: memory.content.trim(),
      importance: memory.importance,
      sourceConversationId: memory.sourceConversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.saveMemory(mem);
    return mem;
  }

  public deleteMemory(id: string): void {
    db.deleteMemory(id);
  }

  public searchMemories(query: string): PersonalMemory[] {
    const lower = query.toLowerCase().trim();
    if (!lower) return this.getMemories();
    return this.getMemories().filter(
      (m) =>
        m.content.toLowerCase().includes(lower) ||
        m.category.toLowerCase().includes(lower)
    );
  }
}

export const personalMemoryService = new PersonalMemoryService();
