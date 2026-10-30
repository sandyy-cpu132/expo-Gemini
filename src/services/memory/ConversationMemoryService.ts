/**
 * ConversationMemoryService
 * Builds multi-turn ChatMessage[] history arrays budgeted by token limits (estimate: ~4 chars per token).
 * Always preserves the system prompt and the most recent turns, discarding the oldest turns when needed.
 */

import { ChatMessage, Message } from '../../types';
import { getMessages } from '../database/db';

export class ConversationMemoryService {
  /**
   * Builds an array of ChatMessage items fitting within maxTokenBudget.
   */
  public async buildChatHistory(
    conversationId: string,
    systemPrompt: string,
    newUserMessage: string,
    maxTokenBudget = 3000
  ): Promise<ChatMessage[]> {
    const storedMessages: Message[] = await getMessages(conversationId);

    const systemTokens = Math.ceil(systemPrompt.length / 4);
    const userTokens = Math.ceil(newUserMessage.length / 4);
    let remainingBudget = maxTokenBudget - systemTokens - userTokens;

    const budgetedTurns: ChatMessage[] = [];

    // Traverse stored messages from newest to oldest
    for (let i = storedMessages.length - 1; i >= 0; i--) {
      const msg = storedMessages[i];
      if (!msg.content || msg.status === 'error') continue;

      const role: 'user' | 'assistant' = msg.senderType === 'user' ? 'user' : 'assistant';
      const turnTokens = Math.ceil(msg.content.length / 4);

      if (remainingBudget - turnTokens < 0) {
        break; // Stop adding older history
      }

      budgetedTurns.unshift({ role, content: msg.content });
      remainingBudget -= turnTokens;
    }

    const finalMessages: ChatMessage[] = [];
    if (systemPrompt.trim()) {
      finalMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    finalMessages.push(...budgetedTurns);
    finalMessages.push({ role: 'user', content: newUserMessage });

    return finalMessages;
  }
}

export const conversationMemoryService = new ConversationMemoryService();
