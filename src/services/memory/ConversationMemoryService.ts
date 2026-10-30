/**
 * ConversationMemoryService
 * Manages rolling message context windows, token budgeting, and automatic conversation summarization.
 */

import { Message } from '../../types';
import { db } from '../database/SQLiteDatabase';

export class ConversationMemoryService {
  /**
   * Retrieves messages for a conversation trimmed to fit the model's active context window budget.
   */
  public getBudgetedHistory(
    conversationId: string,
    maxTokenBudget = 2500
  ): { messages: Message[]; estimatedTokens: number; wasTruncated: boolean } {
    const fullHistory = db.getMessages(conversationId);
    if (fullHistory.length === 0) {
      return { messages: [], estimatedTokens: 0, wasTruncated: false };
    }

    const budgeted: Message[] = [];
    let currentTokens = 0;
    let wasTruncated = false;

    // Traverse from latest to earliest to preserve most recent turns
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      const msg = fullHistory[i];
      const msgTokens = Math.ceil(msg.content.length / 4);

      if (currentTokens + msgTokens > maxTokenBudget && budgeted.length > 0) {
        wasTruncated = true;
        break;
      }

      budgeted.unshift(msg);
      currentTokens += msgTokens;
    }

    return {
      messages: budgeted,
      estimatedTokens: currentTokens,
      wasTruncated,
    };
  }

  /**
   * Generates a brief algorithmic summary of conversation turns.
   */
  public generateHeuristicSummary(conversationId: string): string {
    const messages = db.getMessages(conversationId);
    if (messages.length === 0) return 'Empty conversation';

    const userQueries = messages
      .filter((m) => m.senderType === 'user')
      .map((m) => m.content.slice(0, 40))
      .slice(-3);

    return `Conversation focused on: ${userQueries.join('; ')}...`;
  }
}

export const conversationMemoryService = new ConversationMemoryService();
