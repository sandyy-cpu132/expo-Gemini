/**
 * GroupChatOrchestrator
 * Coordinates multi-character group conversations with turn taking,
 * loop prevention, and shared context.
 */

import { CharacterCard, ChatMessage, GroupChat, Message } from '../../types';
import { getCharacters, getMessages, saveMessage } from '../database/db';
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
  private maxConsecutiveCharacterTurns = 3;

  public stopOrchestration() {
    this.isOrchestrating = false;
    runtimeManager.getActiveEngine().stopGeneration();
  }

  public isBusy(): boolean {
    return this.isOrchestrating;
  }

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

    // Auto-moderated
    const lastSpeakerId = recentMessages[recentMessages.length - 1]?.senderId;
    const candidates = characters.filter((c) => c.id !== lastSpeakerId);
    return candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : characters[0];
  }

  public async executeGroupTurn(
    conversationId: string,
    group: GroupChat,
    onTurnUpdate: (event: GroupTurnEvent) => void,
    specificCharacterId?: string
  ): Promise<Message | null> {
    const allChars = await getCharacters();
    const groupCharacters = group.characterIds
      .map((id) => allChars.find((c) => c.id === id))
      .filter((c): c is CharacterCard => !!c);

    if (groupCharacters.length === 0) return null;

    let targetCharacter: CharacterCard | null = null;
    if (specificCharacterId) {
      targetCharacter = groupCharacters.find((c) => c.id === specificCharacterId) || null;
    }

    const messages = await getMessages(conversationId);
    if (!targetCharacter) {
      targetCharacter = this.selectNextSpeaker(group, messages, groupCharacters);
    }

    if (!targetCharacter) return null;

    if (this.loopGuardCounter >= this.maxConsecutiveCharacterTurns) {
      this.loopGuardCounter = 0;
      return null;
    }

    this.isOrchestrating = true;
    this.loopGuardCounter++;

    onTurnUpdate({
      character: targetCharacter,
      status: 'thinking',
    });

    const recentTurns: ChatMessage[] = messages.slice(-5).map((m) => ({
      role: m.senderType === 'user' ? 'user' : 'assistant',
      content: `${m.senderName}: ${m.content}`,
    }));

    const groupSystemPrompt = `You are ${targetCharacter.name} in a collaborative room called "${group.name}".
Personality: ${targetCharacter.personality}
System Prompt: ${targetCharacter.systemPrompt}
Other personas present: ${groupCharacters.map((c) => c.name).join(', ')}.
Respond as ${targetCharacter.name}. Keep it conversational and concise. Do not speak for others.`;

    const chatInput: ChatMessage[] = [
      { role: 'system', content: groupSystemPrompt },
      ...recentTurns,
      { role: 'user', content: `Please provide your perspective, ${targetCharacter.name}.` },
    ];

    try {
      const engine = runtimeManager.getActiveEngine();
      let responseText = '';

      await engine.streamGenerate(
        chatInput,
        { temperature: 0.8, maxTokens: 400 },
        (chunk) => {
          responseText += chunk.token;
        }
      );

      const msg: Message = {
        id: `msg-grp-${Date.now()}`,
        conversationId,
        senderType: 'assistant',
        senderId: targetCharacter.id,
        senderName: targetCharacter.name,
        senderAvatar: targetCharacter.avatarKey,
        content: responseText.trim(),
        createdAt: Date.now(),
        status: 'complete',
      };

      await saveMessage(msg);

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
