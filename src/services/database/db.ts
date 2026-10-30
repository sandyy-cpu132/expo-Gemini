/**
 * Asynchronous SQLite Repository for CloverPal Offline AI
 * Uses expo-sqlite with PRAGMA foreign_keys, migrations, transactions, and parameterized SQL.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  CharacterCard,
  Conversation,
  DocumentChunk,
  DocumentCollection,
  DocumentMetadata,
  GroupChat,
  Message,
  PersonalMemory,
} from '../../types';
import { MIGRATION_1_STATEMENTS, MIGRATION_2_STATEMENTS } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

const SEED_CHARACTERS: CharacterCard[] = [
  {
    id: 'char-clover',
    name: 'Clover',
    tagline: 'Compassionate companion & life architect',
    description: 'Empathetic, thoughtful, and grounded. Always listens deeply, brings warmth, and offers constructive perspective.',
    avatarKey: 'clover',
    personality: 'Gentle, intuitive, supportive, pragmatic, and articulate.',
    systemPrompt: `You are Clover, a thoughtful companion and grounded thinker running fully offline on the user's device. You write with warmth, clarity, and genuine empathy. When breaking down thoughts, use natural prose and gentle structure. Keep your tone reassuring and honest. Never mention cloud or online servers, as you run entirely locally on Termux.`,
    greetingMessage: `Hello there! I'm Clover. I'm right here with you on your local device. What's on your mind today?`,
    exampleDialogue: `<START>\nUser: I'm feeling a bit overwhelmed with my tasks.\nClover: Take a slow breath. Let's look at one small piece together and untangle it step by step. What feels heaviest right now?`,
    category: 'Companion',
    responseMode: 'detailed',
    memoryScope: 'private',
    createdAt: 1700000000000,
  },
  {
    id: 'char-aegis',
    name: 'Aegis',
    tagline: 'Senior Systems & Android Kernel Architect',
    description: 'Strict, rigorous, expert in Linux kernels, Termux environments, C++ GGUF runtimes, and low-latency systems.',
    avatarKey: 'aegis',
    personality: 'Analytical, terse, precise, uncompromising on performance.',
    systemPrompt: `You are Aegis, an elite Android systems engineer and compiler specialist. You specialize in Termux internals, llama.cpp quantization, CPU threading, memory allocation, and kernel architectures. Provide exact code, command sequences, and architectural insights. Format with clean code blocks, performance metrics, and zero fluff.`,
    greetingMessage: `Aegis systems operational. Local Termux bridge established. What subsystem requires inspection or optimization?`,
    exampleDialogue: `<START>\nUser: How does llama.cpp achieve zero-overhead mmap?\nAegis: By using posix_madvise(MADV_WILLNEED) along with direct pointer offsets into the GGUF binary, avoiding heap duplications and letting the Linux page cache manage memory pressure directly.`,
    category: 'Technical',
    responseMode: 'coding',
    memoryScope: 'private',
    createdAt: 1700000001000,
  },
  {
    id: 'char-athena',
    name: 'Athena',
    tagline: 'Polymath Research Scholar & Document Analyst',
    description: 'Specializes in complex reasoning, document synthesis, RAG retrieval citations, and mathematical proofs.',
    avatarKey: 'athena',
    personality: 'Intellectually curious, rigorous, methodic, structured, and erudite.',
    systemPrompt: `You are Athena, a polymathic researcher and knowledge architect. You dissect source materials, construct rigorous comparisons, provide mathematical equations in clean notation, and cite retrieved knowledge base excerpts with precision.`,
    greetingMessage: `Greetings. Athena is initialized. Ready to synthesize literature, evaluate empirical documents, or solve analytical problems.`,
    exampleDialogue: `<START>\nUser: Can you compare dense vs sparse retrieval?\nAthena: Dense retrieval captures semantic topology via inner product similarity, whereas BM25 matches lexical occurrence frequencies with term saturation.`,
    category: 'Academic',
    responseMode: 'analytical',
    memoryScope: 'shared',
    createdAt: 1700000002000,
  },
  {
    id: 'char-kaelen',
    name: 'Kaelen',
    tagline: 'Worldbuilder & Interactive Narrative Weaver',
    description: 'Master of vivid sensory prose, dynamic characters, and atmospheric world construction.',
    avatarKey: 'kaelen',
    personality: 'Creative, imaginative, evocative rhythm.',
    systemPrompt: `You are Kaelen, an evocative storyteller and creative scenarist. You weave immersive narratives with sensory depth, vivid cadence, and distinct character voices.`,
    greetingMessage: `The parchment is blank, and the night is quiet. What tale shall we spin into existence?`,
    exampleDialogue: `<START>\nUser: Describe an abandoned subterranean clockwork forge.\nKaelen: Beneath the basalt arches, ancient brass gears hung frozen in a century of silence, their teeth dusted with verdigris like green frost.`,
    category: 'Creative',
    responseMode: 'markdown',
    memoryScope: 'private',
    createdAt: 1700000003000,
  },
];

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync('cloverpal.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Check version and run migrations
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    for (const stmt of MIGRATION_1_STATEMENTS) {
      await db.execAsync(stmt);
    }
    await db.execAsync('PRAGMA user_version = 1;');
  }

  if (currentVersion < 2) {
    for (const stmt of MIGRATION_2_STATEMENTS) {
      try {
        await db.execAsync(stmt);
      } catch {
        // Column may already exist if partially applied
      }
    }
    await db.execAsync('PRAGMA user_version = 2;');
  }

  // Seed default characters if empty
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM characters;');
  if ((countRow?.count ?? 0) === 0) {
    for (const c of SEED_CHARACTERS) {
      await db.runAsync(
        `INSERT INTO characters (id, name, tagline, description, avatar_key, personality, system_prompt, greeting_message, example_dialogue, category, response_mode, memory_scope, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          c.id,
          c.name,
          c.tagline,
          c.description,
          c.avatarKey,
          c.personality,
          c.systemPrompt,
          c.greetingMessage,
          c.exampleDialogue,
          c.category,
          c.responseMode,
          c.memoryScope,
          c.createdAt,
        ]
      );
    }

    // Default collection
    await db.runAsync(
      `INSERT OR IGNORE INTO document_collections (id, name, description, color, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      ['coll-default', 'General Knowledge', 'Core local reference documents', '#10b981', Date.now()]
    );

    // Initial conversation with Clover
    const convId = 'conv-welcome';
    await db.runAsync(
      `INSERT OR IGNORE INTO conversations (id, title, character_id, engine, model_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [convId, 'Welcome to CloverPal', 'char-clover', 'llama.cpp', 'llama-3.2-3b', Date.now(), Date.now()]
    );

    await db.runAsync(
      `INSERT OR IGNORE INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        'msg-welcome',
        convId,
        'assistant',
        'char-clover',
        'Clover',
        `Hello! Welcome to CloverPal Offline AI.\n\nI run completely inside your phone through Termux, talking only to 127.0.0.1 with zero cloud dependencies.\n\nHow may I help you today?`,
        'complete',
        Date.now(),
      ]
    );
  }

  dbInstance = db;
  return db;
}

// ==========================================
// Repository Methods
// ==========================================

export async function getConversations(): Promise<Conversation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM conversations ORDER BY updated_at DESC;'
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    characterId: r.character_id,
    groupId: r.group_id,
    engine: r.engine,
    modelId: r.model_id,
    systemPromptOverride: r.system_prompt_override,
    summary: r.summary,
    activeCollectionIds: r.active_collection_ids ? JSON.parse(r.active_collection_ids) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDatabase();
  const r = await db.getFirstAsync<any>('SELECT * FROM conversations WHERE id = ?;', [id]);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    characterId: r.character_id,
    groupId: r.group_id,
    engine: r.engine,
    modelId: r.model_id,
    systemPromptOverride: r.system_prompt_override,
    summary: r.summary,
    activeCollectionIds: r.active_collection_ids ? JSON.parse(r.active_collection_ids) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO conversations (id, title, character_id, group_id, engine, model_id, system_prompt_override, summary, active_collection_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      conv.id,
      conv.title,
      conv.characterId ?? null,
      conv.groupId ?? null,
      conv.engine,
      conv.modelId,
      conv.systemPromptOverride ?? null,
      conv.summary ?? null,
      conv.activeCollectionIds ? JSON.stringify(conv.activeCollectionIds) : null,
      conv.createdAt,
      conv.updatedAt,
    ]
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM conversations WHERE id = ?;', [id]);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC;',
    [conversationId]
  );
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderType: r.sender_type,
    senderId: r.sender_id,
    senderName: r.sender_name,
    senderAvatar: r.sender_avatar,
    content: r.content,
    formatMode: r.format_mode,
    citations: r.citations_json ? JSON.parse(r.citations_json) : undefined,
    stats:
      r.tokens_per_second || r.prompt_tokens
        ? {
            promptTokens: r.prompt_tokens,
            completionTokens: r.completion_tokens,
            totalTokens: r.prompt_tokens + r.completion_tokens,
            promptMs: 0,
            evalMs: r.eval_ms,
            tokensPerSecond: r.tokens_per_second,
          }
        : undefined,
    status: r.status || 'complete',
    createdAt: r.created_at,
  }));
}

export async function saveMessage(msg: Message): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, format_mode, citations_json, prompt_tokens, completion_tokens, tokens_per_second, eval_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      msg.id,
      msg.conversationId,
      msg.senderType,
      msg.senderId ?? null,
      msg.senderName,
      msg.senderAvatar ?? null,
      msg.content,
      msg.formatMode ?? 'automatic',
      msg.citations ? JSON.stringify(msg.citations) : null,
      msg.stats?.promptTokens ?? 0,
      msg.stats?.completionTokens ?? 0,
      msg.stats?.tokensPerSecond ?? 0,
      msg.stats?.evalMs ?? 0,
      msg.status ?? 'complete',
      msg.createdAt,
    ]
  );

  // Update conversation timestamp
  await db.runAsync(
    'UPDATE conversations SET updated_at = ? WHERE id = ?;',
    [Date.now(), msg.conversationId]
  );
}

export async function updateMessageContent(
  id: string,
  content: string,
  status: 'streaming' | 'complete' | 'interrupted' | 'error' = 'complete',
  stats?: any
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE messages SET content = ?, status = ?, tokens_per_second = ?, eval_ms = ? WHERE id = ?;`,
    [content, status, stats?.tokensPerSecond ?? 0, stats?.evalMs ?? 0, id]
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM messages WHERE id = ?;', [id]);
}

export async function getCharacters(): Promise<CharacterCard[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM characters ORDER BY created_at ASC;');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    avatarKey: r.avatar_key || 'clover',
    personality: r.personality,
    systemPrompt: r.system_prompt,
    greetingMessage: r.greeting_message,
    exampleDialogue: r.example_dialogue,
    category: r.category,
    responseMode: r.response_mode,
    memoryScope: r.memory_scope,
    createdAt: r.created_at,
  }));
}

export async function saveCharacter(char: CharacterCard): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO characters (id, name, tagline, description, avatar_key, personality, system_prompt, greeting_message, example_dialogue, category, response_mode, memory_scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      char.id,
      char.name,
      char.tagline,
      char.description,
      char.avatarKey,
      char.personality,
      char.systemPrompt,
      char.greetingMessage,
      char.exampleDialogue,
      char.category,
      char.responseMode,
      char.memoryScope,
      char.createdAt,
    ]
  );
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM characters WHERE id = ?;', [id]);
}

export async function getGroups(): Promise<GroupChat[]> {
  const db = await getDatabase();
  const groups = await db.getAllAsync<any>('SELECT * FROM groups ORDER BY created_at DESC;');
  const result: GroupChat[] = [];

  for (const g of groups) {
    const memberRows = await db.getAllAsync<any>(
      'SELECT character_id FROM group_members WHERE group_id = ? ORDER BY order_index ASC;',
      [g.id]
    );
    result.push({
      id: g.id,
      name: g.name,
      description: g.description,
      characterIds: memberRows.map((m) => m.character_id),
      turnMode: g.turn_mode,
      createdAt: g.created_at,
    });
  }

  return result;
}

export async function saveGroup(group: GroupChat): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO groups (id, name, description, turn_mode, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      [group.id, group.name, group.description, group.turnMode, group.createdAt]
    );
    await db.runAsync('DELETE FROM group_members WHERE group_id = ?;', [group.id]);

    for (let i = 0; i < group.characterIds.length; i++) {
      await db.runAsync(
        `INSERT INTO group_members (group_id, character_id, order_index) VALUES (?, ?, ?);`,
        [group.id, group.characterIds[i], i]
      );
    }
  });
}

export async function deleteGroup(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM groups WHERE id = ?;', [id]);
}

export async function getMemories(): Promise<PersonalMemory[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM personal_memories ORDER BY importance DESC, created_at DESC;');
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    importance: r.importance,
    sourceConversationId: r.source_conversation_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function saveMemory(m: PersonalMemory): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO personal_memories (id, category, content, importance, source_conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [m.id, m.category, m.content, m.importance, m.sourceConversationId ?? null, m.createdAt, m.updatedAt]
  );
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM personal_memories WHERE id = ?;', [id]);
}

export async function getCollections(): Promise<DocumentCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM document_collections ORDER BY created_at ASC;');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    createdAt: r.created_at,
  }));
}

export async function saveCollection(c: DocumentCollection): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO document_collections (id, name, description, color, created_at)
     VALUES (?, ?, ?, ?, ?);`,
    [c.id, c.name, c.description, c.color, c.createdAt]
  );
}

export async function getDocuments(collectionId?: string): Promise<DocumentMetadata[]> {
  const db = await getDatabase();
  const rows = collectionId
    ? await db.getAllAsync<any>('SELECT * FROM documents WHERE collection_id = ? ORDER BY indexed_at DESC;', [collectionId])
    : await db.getAllAsync<any>('SELECT * FROM documents ORDER BY indexed_at DESC;');
  return rows.map((r) => ({
    id: r.id,
    collectionId: r.collection_id,
    name: r.name,
    fileType: r.file_type,
    fileSize: r.file_size,
    pageCount: r.page_count,
    chunkCount: r.chunk_count,
    indexedAt: r.indexed_at,
  }));
}

export async function saveDocument(doc: DocumentMetadata, chunks: DocumentChunk[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO documents (id, collection_id, name, file_type, file_size, page_count, chunk_count, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [doc.id, doc.collectionId, doc.name, doc.fileType, doc.fileSize, doc.pageCount ?? 1, chunks.length, doc.indexedAt]
    );

    await db.runAsync('DELETE FROM document_chunks WHERE document_id = ?;', [doc.id]);

    for (const ch of chunks) {
      await db.runAsync(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding_json, embedding_model, embedding_dim, token_count, page_number, section_header)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          ch.id,
          ch.documentId,
          ch.chunkIndex,
          ch.content,
          ch.embedding ? JSON.stringify(ch.embedding) : null,
          ch.embedding_model ?? null,
          ch.embedding_dim ?? null,
          ch.tokenCount,
          ch.pageNumber ?? null,
          ch.sectionHeader ?? null,
        ]
      );
    }
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM documents WHERE id = ?;', [id]);
}

export async function getAllChunks(
  collectionIds?: string[]
): Promise<{ chunk: DocumentChunk; docName: string }[]> {
  const db = await getDatabase();
  let sql = `
    SELECT c.*, d.name as doc_name 
    FROM document_chunks c 
    JOIN documents d ON c.document_id = d.id
  `;
  const params: any[] = [];
  if (collectionIds && collectionIds.length > 0) {
    const placeholders = collectionIds.map(() => '?').join(',');
    sql += ` WHERE d.collection_id IN (${placeholders})`;
    params.push(...collectionIds);
  }
  sql += ' ORDER BY c.document_id, c.chunk_index;';

  const rows = await db.getAllAsync<any>(sql, params);
  return rows.map((r) => ({
    chunk: {
      id: r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      embedding: r.embedding_json ? JSON.parse(r.embedding_json) : undefined,
      embedding_model: r.embedding_model,
      embedding_dim: r.embedding_dim,
      tokenCount: r.token_count,
      pageNumber: r.page_number,
      sectionHeader: r.section_header,
    },
    docName: r.doc_name,
  }));
}

// Backup Export & Import
export async function exportDatabaseBackup(): Promise<string> {
  const [conversations, characters, groups, memories, documents, chunks, collections] =
    await Promise.all([
      getConversations(),
      getCharacters(),
      getGroups(),
      getMemories(),
      getDocuments(),
      getAllChunks(),
      getCollections(),
    ]);

  const backupData = {
    schemaVersion: 2,
    exportedAt: Date.now(),
    conversations,
    characters,
    groups,
    memories,
    documents,
    chunks: chunks.map((c) => c.chunk),
    collections,
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const path = `${FileSystem.cacheDirectory}cloverpal_backup_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export CloverPal Backup' });
  }

  return path;
}

export async function importDatabaseBackup(jsonString: string): Promise<boolean> {
  try {
    if (jsonString.length > 50 * 1024 * 1024) {
      throw new Error('Backup file exceeds 50 MB limit.');
    }

    const data = JSON.parse(jsonString);
    if (!data.schemaVersion || !Array.isArray(data.characters)) {
      throw new Error('Invalid backup schema.');
    }

    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const c of data.characters) {
        await saveCharacter(c);
      }
      if (Array.isArray(data.groups)) {
        for (const g of data.groups) {
          await saveGroup(g);
        }
      }
      if (Array.isArray(data.conversations)) {
        for (const conv of data.conversations) {
          await saveConversation(conv);
        }
      }
      if (Array.isArray(data.memories)) {
        for (const m of data.memories) {
          await saveMemory(m);
        }
      }
    });

    return true;
  } catch {
    return false;
  }
}

// React Provider
interface DatabaseContextValue {
  isReady: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({ isReady: false, error: null });

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    getDatabase()
      .then(() => setIsReady(true))
      .catch((err) => {
        setError(err);
      });
  }, []);

  return React.createElement(
    DatabaseContext.Provider,
    { value: { isReady, error } },
    children
  );
};

export const useDatabase = () => useContext(DatabaseContext);
