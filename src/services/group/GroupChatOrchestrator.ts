/**
 * GroupChatOrchestrator
 * Coordinates multi-character conversations with safe turn-taking, loop-prevention,
 * manual interrupts, and shared conversation context.
 */

import { CharacterCard, GroupChat, Message } from '../../types';
import { db } from '../database/SQLiteDatabase';
import { runtimeManager } from '../runtime/RuntimeConnectionManager';

export interface GroupTurnEvent {
  character: CharacterCard;
  status: 'thinking' | 'speaking' | 'completed' | 'skipped';
  message?: Message;
}

export class GroupChatOrchestrator {
  private isOrchestrating = false;
  private currentTurnIndex = 0;
  private loopGuardCounter = 0;
  private maxConsecutiveCharacterTurns = 3; // Prevent infinite AI-to-AI loops

  public stopOrchestration() {
    this.isOrchestrating = false;
    runtimeManager.getActiveEngine().stopGeneration();
  }

  public isBusy(): boolean {
    return this.isOrchestrating;
  }

  /**
   * Evaluates the next character to speak in a multi-character group conversation.
   */
  public selectNextSpeaker(
    group: GroupChat,
    recentMessages: Message[],
    characters: CharacterCard[]
  ): CharacterCard | null {
    if (characters.length === 0) return null;

    if (group.turnMode === 'round-robin') {
      const char = characters[this.currentTurnIndex % characters.length];
      this.currentTurnIndex++;
      return char;
    }

    if (group.turnMode === 'manual-mention') {
      // Look for @Name in the last user message
      const lastUserMsg = [...recentMessages].reverse().find((m) => m.senderType === 'user');
      if (lastUserMsg) {
        for (const c of characters) {
          if (lastUserMsg.content.toLowerCase().includes(`@${c.name.toLowerCase()}`)) {
            return c;
          }
        }
      }
      return characters[0];
    }

    // Auto-moderated: pick character whose expertise best aligns or who hasn't spoken recently
    const lastSpeakerId = recentMessages[recentMessages.length - 1]?.senderId;
    const candidates = characters.filter((c) => c.id !== lastSpeakerId);
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : characters[0];
  }

  /**
   * Executes a controlled group response turn.
   */
  public async executeGroupTurn(
    conversationId: string,
    group: GroupChat,
    onTurnUpdate: (event: GroupTurnEvent) => void,
    specificCharacterId?: string
  ): Promise<Message | null> {
    const groupCharacters = group.characterIds
      .map((id) => db.getCharacterById(id))
      .filter((c): c is CharacterCard => !!c);

    if (groupCharacters.length === 0) return null;

    let targetCharacter: CharacterCard | null = null;
    if (specificCharacterId) {
      targetCharacter = groupCharacters.find((c) => c.id === specificCharacterId) || null;
    }

    if (!targetCharacter) {
      const messages = db.getMessages(conversationId);
      targetCharacter = this.selectNextSpeaker(group, messages, groupCharacters);
    }

    if (!targetCharacter) return null;

    if (this.loopGuardCounter >= this.maxConsecutiveCharacterTurns) {
      this.loopGuardCounter = 0;
      return null; // Force pause for user turn
    }

    this.isOrchestrating = true;
    this.loopGuardCounter++;

    onTurnUpdate({
      character: targetCharacter,
      status: 'thinking',
    });

    const messages = db.getMessages(conversationId);
    const recentDialogue = messages
      .slice(-6)
      .map((m) => `${m.senderName}: ${m.content}`)
      .join('\n\n');

    const groupSystemPrompt = `You are ${targetCharacter.name} participating in a group discussion called "${group.name}".
Personality: ${targetCharacter.personality}
System Prompt: ${targetCharacter.systemPrompt}

Other participants in this room: ${groupCharacters.map((c) => c.name).join(', ')}.
Maintain your distinct character voice. React naturally to what the others have said. Keep your response conversational and do not speak on behalf of other participants.`;

    const prompt = `Current room dialogue:\n${recentDialogue}\n\nRespond as ${targetCharacter.name}:`;

    try {
      const engine = runtimeManager.getActiveEngine();
      let responseText = '';

      await engine.streamGenerate(
        prompt,
        groupSystemPrompt,
        { temperature: 0.8, maxTokens: 400 },
        (chunk) => {
          responseText += chunk.token;
        }
      );

      const msg: Message = {
        id: `msg-group-${Date.now()}`,
        conversationId,
        senderType: 'assistant',
        senderId: targetCharacter.id,
        senderName: targetCharacter.name,
        senderAvatar: targetCharacter.avatarUrl,
        content: responseText.trim(),
        createdAt: Date.now(),
        status: 'complete',
      };

      db.saveMessage(msg);

      onTurnUpdate({
        character: targetCharacter,
        status: 'completed',
        message: msg,
      });

      return msg;
    } catch {
      onTurnUpdate({
        character: targetCharacter,
        status: 'skipped',
      });
      return null;
    } finally {
      this.isOrchestrating = false;
    }
  }

  public resetLoopGuard() {
    this.loopGuardCounter = 0;
  }
}

export const groupChatOrchestrator = new GroupChatOrchestrator();
