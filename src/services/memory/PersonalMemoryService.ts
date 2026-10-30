/**
 * PersonalMemoryService
 * Manages explicit and recorded user facts and preferences via async SQLite repository.
 */

import { PersonalMemory } from '../../types';
import { deleteMemory, getMemories, saveMemory } from '../database/db';

export class PersonalMemoryService {
  public async getMemories(): Promise<PersonalMemory[]> {
    return getMemories();
  }

  public async saveMemory(
    memory: Omit<PersonalMemory, 'id' | 'createdAt' | 'updatedAt'>,
    id?: string
  ): Promise<PersonalMemory> {
    const mem: PersonalMemory = {
      id: id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: memory.category,
      content: memory.content.trim(),
      importance: memory.importance,
      sourceConversationId: memory.sourceConversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveMemory(mem);
    return mem;
  }

  public async deleteMemory(id: string): Promise<void> {
    await deleteMemory(id);
  }

  public async searchMemories(query: string): Promise<PersonalMemory[]> {
    const all = await this.getMemories();
    const lower = query.toLowerCase().trim();
    if (!lower) return all;
    return all.filter(
      (m) => m.content.toLowerCase().includes(lower) || m.category.toLowerCase().includes(lower)
    );
  }
}

export const personalMemoryService = new PersonalMemoryService();
