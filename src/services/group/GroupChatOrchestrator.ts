/**
 * GroupChatOrchestrator
 * Runs one persona turn at a time in a group room. The inference engine is a single
 * shared stream, so a second turn is refused while one is running. A stopped turn is
 * saved with status "interrupted" instead of being saved as if it completed.
 */

import { CharacterCard, ChatMessage, GroupChat, Message } from '../../types';
import { getCharacters, getMessages, saveMessage } from '../database/db';
import { runtimeManager } from '../runtime/RuntimeConnectionManager';

export interface GroupTurnEvent {
  character: CharacterCard;
  status: 'thinking' | 'completed' | 'interrupted' | 'error';
  message?: Message;
  error?: string;
}

const HISTORY_TURNS = 8;
const MAX_AUTO_TURNS_IN_A_ROW = 3;

export class GroupChatOrchestrator {
  private busy = false;
  private stopRequested = false;
  private roundRobinIndex = 0;
  private autoTurnsInARow = 0;

  public isBusy(): boolean {
    return this.busy;
  }

  public stopOrchestration(): void {
    if (!this.busy) return;
    this.stopRequested = true;
    runtimeManager.getActiveEngine().stopGeneration();
  }

  /** Call when the user sends a message so automatic turns can run again. */
  public resetLoopGuard(): void {
    this.autoTurnsInARow = 0;
  }

  public selectNextSpeaker(
    group: GroupChat,
    recentMessages: Message[],
    characters: CharacterCard[]
  ): CharacterCard | null {
    if (characters.length === 0) return null;

    if (group.turnMode === 'round-robin') {
      const next = characters[this.roundRobinIndex % characters.length];
      this.roundRobinIndex++;
      return next;
    }

    if (group.turnMode === 'manual-mention') {
      const lastUser = [...recentMessages].reverse().find((m) => m.senderType === 'user');
      if (lastUser) {
        const lower = lastUser.content.toLowerCase();
        const mentioned = characters.find((c) => lower.includes(`@${c.name.toLowerCase()}`));
        if (mentioned) return mentioned;
      }
      return characters[0];
    }

    // auto-moderated: avoid repeating the most recent persona when possible
    const lastAssistant = [...recentMessages].reverse().find((m) => m.senderType === 'assistant');
    const candidates = characters.filter((c) => c.id !== lastAssistant?.senderId);
    const pool = candidates.length > 0 ? candidates : characters;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Runs one turn. Pass forcedCharacterId when the user taps a persona chip.
   * Returns the saved message, or null if nothing was saved.
   */
  public async executeGroupTurn(
    conversationId: string,
    group: GroupChat,
    onTurnUpdate: (event: GroupTurnEvent) => void,
    forcedCharacterId?: string
  ): Promise<Message | null> {
    if (this.busy) return null;

    const allCharacters = await getCharacters();
    const members = group.characterIds
      .map((id) => allCharacters.find((c) => c.id === id))
      .filter((c): c is CharacterCard => !!c);

    if (members.length === 0) return null;

    const history = await getMessages(conversationId);

    let target: CharacterCard | null = null;
    if (forcedCharacterId) {
      target = members.find((c) => c.id === forcedCharacterId) ?? null;
    }

    if (!target) {
      if (this.autoTurnsInARow >= MAX_AUTO_TURNS_IN_A_ROW) {
        // Loop guard: stop automatic turns until the user speaks or taps a persona.
        return null;
      }
      target = this.selectNextSpeaker(group, history, members);
      this.autoTurnsInARow++;
    }

    if (!target) return null;

    this.busy = true;
    this.stopRequested = false;
    onTurnUpdate({ character: target, status: 'thinking' });

    const recentTurns: ChatMessage[] = history.slice(-HISTORY_TURNS).map((m) => ({
      role: m.senderType === 'user' ? 'user' : 'assistant',
      content: `${m.senderName}: ${m.content}`,
    }));

    const systemPrompt = `You are ${target.name} in a collaborative room called "${group.name}".
Personality: ${target.personality}
System Prompt: ${target.systemPrompt}
Other personas present: ${members.map((c) => c.name).join(', ')}.
Respond as ${target.name}. Keep it conversational and concise. Do not speak for others.`;

    const chatInput: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recentTurns,
      { role: 'user', content: `Please provide your perspective, ${target.name}.` },
    ];

    let responseText = '';

    try {
      await runtimeManager.getActiveEngine().streamGenerate(
        chatInput,
        undefined,
        (chunk) => {
          responseText += chunk.token;
        }
      );

      const interrupted = this.stopRequested;
      const content = responseText.trim();

      if (interrupted && !content) {
        onTurnUpdate({ character: target, status: 'interrupted' });
        return null;
      }

      const message: Message = {
        id: `msg-grp-${Date.now()}-${target.id}`,
        conversationId,
        senderType: 'assistant',
        senderId: target.id,
        senderName: target.name,
        senderAvatar: target.avatarKey,
        content,
        status: interrupted ? 'interrupted' : 'complete',
        createdAt: Date.now(),
      };

      await saveMessage(message);
      onTurnUpdate({
        character: target,
        status: interrupted ? 'interrupted' : 'completed',
        message,
      });
      return message;
    } catch (err: any) {
      onTurnUpdate({
        character: target,
        status: 'error',
        error: err?.message || 'Generation failed',
      });
      return null;
    } finally {
      this.busy = false;
      this.stopRequested = false;
    }
  }
}

export const groupChatOrchestrator = new GroupChatOrchestrator();
