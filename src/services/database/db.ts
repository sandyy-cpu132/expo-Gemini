/**
 * Asynchronous SQLite Repository for CloverPal Offline AI
 * expo-sqlite with PRAGMA foreign_keys, versioned migrations, and parameterized SQL.
 *
 * Writes use INSERT ... ON CONFLICT DO UPDATE (upsert), not INSERT OR REPLACE.
 * REPLACE deletes the old row first, which fires ON DELETE CASCADE / SET NULL on child
 * rows. Without this, editing a persona would remove it from every group room.
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

type Db = SQLite.SQLiteDatabase;

const BACKUP_SCHEMA_VERSION = 2;
const MAX_BACKUP_CHARS = 50 * 1024 * 1024;
const GROUP_MODEL_PLACEHOLDER = 'active-engine';

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

// ==========================================
// Open, migrate, seed
// ==========================================

async function openAndMigrate(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync('cloverpal.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const version = versionRow?.user_version ?? 0;

  if (version < 1) {
    for (const stmt of MIGRATION_1_STATEMENTS) {
      await db.execAsync(stmt);
    }
    await db.execAsync('PRAGMA user_version = 1;');
  }

  if (version < 2) {
    for (const stmt of MIGRATION_2_STATEMENTS) {
      try {
        await db.execAsync(stmt);
      } catch {
        // Column already exists from a partially applied migration
      }
    }
    await db.execAsync('PRAGMA user_version = 2;');
  }

  if (version < 3) {
    // Rooms saved before this version had no conversation row, so message saves
    // failed the foreign key check. Create the missing rows once.
    await db.runAsync(
      `INSERT OR IGNORE INTO conversations (id, title, character_id, group_id, engine, model_id, created_at, updated_at)
       SELECT 'conv-group-' || id, name, NULL, id, 'llama.cpp', ?, created_at, created_at FROM "groups";`,
      [GROUP_MODEL_PLACEHOLDER]
    );
    await db.execAsync('PRAGMA user_version = 3;');
  }

  const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM characters;');
  if ((countRow?.count ?? 0) === 0) {
    for (const c of SEED_CHARACTERS) {
      await upsertCharacter(db, c);
    }

    await db.runAsync(
      `INSERT OR IGNORE INTO document_collections (id, name, description, color, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      ['coll-default', 'General Knowledge', 'Core local reference documents', '#10b981', Date.now()]
    );

    await db.runAsync(
      `INSERT OR IGNORE INTO conversations (id, title, character_id, engine, model_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['conv-welcome', 'Welcome to CloverPal', 'char-clover', 'llama.cpp', 'llama-3.2-3b', Date.now(), Date.now()]
    );

    await db.runAsync(
      `INSERT OR IGNORE INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        'msg-welcome',
        'conv-welcome',
        'assistant',
        'char-clover',
        'Clover',
        `Hello! Welcome to CloverPal Offline AI.\n\nI run completely inside your phone through Termux, talking only to 127.0.0.1 with zero cloud dependencies.\n\nHow may I help you today?`,
        'complete',
        Date.now(),
      ]
    );
  }

  return db;
}

let dbPromise: Promise<Db> | null = null;

/** Opens the database once. Concurrent callers share the same promise. */
export function getDatabase(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err) => {
      dbPromise = null; // allow a retry after a failed open
      throw err;
    });
  }
  return dbPromise;
}

// ==========================================
// Row writers (take the db handle so they can run inside transactions)
// ==========================================

async function upsertCharacter(db: Db, c: CharacterCard): Promise<void> {
  await db.runAsync(
    `INSERT INTO characters (id, name, tagline, description, avatar_key, personality, system_prompt, greeting_message, example_dialogue, category, response_mode, memory_scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       tagline = excluded.tagline,
       description = excluded.description,
       avatar_key = excluded.avatar_key,
       personality = excluded.personality,
       system_prompt = excluded.system_prompt,
       greeting_message = excluded.greeting_message,
       example_dialogue = excluded.example_dialogue,
       category = excluded.category,
       response_mode = excluded.response_mode,
       memory_scope = excluded.memory_scope;`,
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

async function upsertConversation(db: Db, conv: Conversation): Promise<void> {
  await db.runAsync(
    `INSERT INTO conversations (id, title, character_id, group_id, engine, model_id, system_prompt_override, summary, active_collection_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       character_id = excluded.character_id,
       group_id = excluded.group_id,
       engine = excluded.engine,
       model_id = excluded.model_id,
       system_prompt_override = excluded.system_prompt_override,
       summary = excluded.summary,
       active_collection_ids = excluded.active_collection_ids,
       updated_at = excluded.updated_at;`,
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

async function upsertGroupRow(db: Db, group: GroupChat): Promise<void> {
  await db.runAsync(
    `INSERT INTO "groups" (id, name, description, turn_mode, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       turn_mode = excluded.turn_mode;`,
    [group.id, group.name, group.description, group.turnMode, group.createdAt]
  );
}

/** Every room needs a conversation row so its messages have a valid parent. */
async function upsertRoomConversation(db: Db, group: GroupChat): Promise<void> {
  await upsertConversation(db, {
    id: `conv-group-${group.id}`,
    title: group.name,
    characterId: undefined,
    groupId: group.id,
    engine: 'llama.cpp',
    modelId: GROUP_MODEL_PLACEHOLDER,
    createdAt: group.createdAt,
    updatedAt: Date.now(),
  });
}

async function upsertMessage(db: Db, msg: Message): Promise<void> {
  await db.runAsync(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, format_mode, citations_json, prompt_tokens, completion_tokens, tokens_per_second, eval_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       status = excluded.status,
       citations_json = excluded.citations_json,
       format_mode = excluded.format_mode,
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens,
       tokens_per_second = excluded.tokens_per_second,
       eval_ms = excluded.eval_ms;`,
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
}

async function upsertMemory(db: Db, m: PersonalMemory): Promise<void> {
  await db.runAsync(
    `INSERT INTO personal_memories (id, category, content, importance, source_conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       category = excluded.category,
       content = excluded.content,
       importance = excluded.importance,
       source_conversation_id = excluded.source_conversation_id,
       updated_at = excluded.updated_at;`,
    [m.id, m.category, m.content, m.importance, m.sourceConversationId ?? null, m.createdAt, m.updatedAt]
  );
}

async function upsertCollection(db: Db, c: DocumentCollection): Promise<void> {
  await db.runAsync(
    `INSERT INTO document_collections (id, name, description, color, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       color = excluded.color;`,
    [c.id, c.name, c.description, c.color, c.createdAt]
  );
}

async function writeDocument(db: Db, doc: DocumentMetadata, chunks: DocumentChunk[]): Promise<void> {
  await db.runAsync(
    `INSERT INTO documents (id, collection_id, name, file_type, file_size, page_count, chunk_count, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       collection_id = excluded.collection_id,
       name = excluded.name,
       file_type = excluded.file_type,
       file_size = excluded.file_size,
       page_count = excluded.page_count,
       chunk_count = excluded.chunk_count,
       indexed_at = excluded.indexed_at;`,
    [doc.id, doc.collectionId, doc.name, doc.fileType, doc.fileSize, doc.pageCount ?? 1, chunks.length, doc.indexedAt]
  );

  await db.runAsync('DELETE FROM document_chunks WHERE document_id = ?;', [doc.id]);

  for (const ch of chunks) {
    await db.runAsync(
      `INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding_json, embedding_model, embedding_dim, token_count, page_number, section_header)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        ch.id,
        doc.id,
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
}

// ==========================================
// Mappers
// ==========================================

function mapConversation(r: any): Conversation {
  return {
    id: r.id,
    title: r.title,
    characterId: r.character_id ?? undefined,
    groupId: r.group_id ?? undefined,
    engine: r.engine,
    modelId: r.model_id,
    systemPromptOverride: r.system_prompt_override ?? undefined,
    summary: r.summary ?? undefined,
    activeCollectionIds: r.active_collection_ids ? JSON.parse(r.active_collection_ids) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMessage(r: any): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderType: r.sender_type,
    senderId: r.sender_id ?? undefined,
    senderName: r.sender_name,
    senderAvatar: r.sender_avatar ?? undefined,
    content: r.content,
    formatMode: r.format_mode,
    citations: r.citations_json ? JSON.parse(r.citations_json) : undefined,
    stats:
      r.tokens_per_second || r.prompt_tokens
        ? {
            promptTokens: r.prompt_tokens,
            completionTokens: r.completion_tokens,
            totalTokens: (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
            promptMs: 0,
            evalMs: r.eval_ms,
            tokensPerSecond: r.tokens_per_second,
          }
        : undefined,
    status: r.status || 'complete',
    createdAt: r.created_at,
  };
}

function mapCharacter(r: any): CharacterCard {
  return {
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
  };
}

// ==========================================
// Conversations & messages
// ==========================================

export async function getConversations(): Promise<Conversation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM conversations ORDER BY updated_at DESC;');
  return rows.map(mapConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM conversations WHERE id = ?;', [id]);
  return row ? mapConversation(row) : null;
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await getDatabase();
  await upsertConversation(db, conv);
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
  return rows.map(mapMessage);
}

export async function saveMessage(msg: Message): Promise<void> {
  const db = await getDatabase();
  await upsertMessage(db, msg);
  await db.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?;', [Date.now(), msg.conversationId]);
}

export async function updateMessageContent(
  id: string,
  content: string,
  status: 'streaming' | 'complete' | 'interrupted' | 'error' = 'complete',
  stats?: any
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE messages SET content = ?, status = ?, tokens_per_second = ?, eval_ms = ? WHERE id = ?;',
    [content, status, stats?.tokensPerSecond ?? 0, stats?.evalMs ?? 0, id]
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM messages WHERE id = ?;', [id]);
}

// ==========================================
// Personas
// ==========================================

export async function getCharacters(): Promise<CharacterCard[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM characters ORDER BY created_at ASC;');
  return rows.map(mapCharacter);
}

export async function saveCharacter(char: CharacterCard): Promise<void> {
  const db = await getDatabase();
  await upsertCharacter(db, char);
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM characters WHERE id = ?;', [id]);
}

// ==========================================
// Group rooms
// ==========================================

export async function getGroups(): Promise<GroupChat[]> {
  const db = await getDatabase();
  const groups = await db.getAllAsync<any>('SELECT * FROM "groups" ORDER BY created_at DESC;');
  const memberRows = await db.getAllAsync<any>(
    'SELECT group_id, character_id FROM group_members ORDER BY order_index ASC;'
  );

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? '',
    characterIds: memberRows.filter((m) => m.group_id === g.id).map((m) => m.character_id),
    turnMode: g.turn_mode,
    createdAt: g.created_at,
  }));
}

export async function saveGroup(group: GroupChat): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await upsertGroupRow(db, group);
    await upsertRoomConversation(db, group);
    await db.runAsync('DELETE FROM group_members WHERE group_id = ?;', [group.id]);
    for (let i = 0; i < group.characterIds.length; i++) {
      await db.runAsync(
        'INSERT INTO group_members (group_id, character_id, order_index) VALUES (?, ?, ?);',
        [group.id, group.characterIds[i], i]
      );
    }
  });
}

export async function deleteGroup(id: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM conversations WHERE id = ?;', [`conv-group-${id}`]);
    await db.runAsync('DELETE FROM "groups" WHERE id = ?;', [id]);
  });
}

// ==========================================
// Personal memory
// ==========================================

export async function getMemories(): Promise<PersonalMemory[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM personal_memories ORDER BY importance DESC, created_at DESC;'
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    importance: r.importance,
    sourceConversationId: r.source_conversation_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function saveMemory(m: PersonalMemory): Promise<void> {
  const db = await getDatabase();
  await upsertMemory(db, m);
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM personal_memories WHERE id = ?;', [id]);
}

// ==========================================
// Knowledge base
// ==========================================

export async function getCollections(): Promise<DocumentCollection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM document_collections ORDER BY created_at ASC;');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    color: r.color,
    createdAt: r.created_at,
  }));
}

export async function saveCollection(c: DocumentCollection): Promise<void> {
  const db = await getDatabase();
  await upsertCollection(db, c);
}

export async function getDocuments(collectionId?: string): Promise<DocumentMetadata[]> {
  const db = await getDatabase();
  const rows = collectionId
    ? await db.getAllAsync<any>(
        'SELECT * FROM documents WHERE collection_id = ? ORDER BY indexed_at DESC;',
        [collectionId]
      )
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
    await writeDocument(db, doc, chunks);
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
    SELECT c.*, d.name AS doc_name
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
      embedding_model: r.embedding_model ?? undefined,
      embedding_dim: r.embedding_dim ?? undefined,
      tokenCount: r.token_count,
      pageNumber: r.page_number ?? undefined,
      sectionHeader: r.section_header ?? undefined,
    },
    docName: r.doc_name,
  }));
}

// ==========================================
// Backup export & import
// ==========================================

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

  // Messages are stored per conversation, so collect them after listing conversations.
  const messages: Message[] = [];
  for (const conv of conversations) {
    messages.push(...(await getMessages(conv.id)));
  }

  const backup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    collections,
    characters,
    groups,
    conversations,
    messages,
    memories,
    documents,
    chunks: chunks.map((c) => c.chunk),
  };

  const path = `${FileSystem.cacheDirectory}cloverpal_backup_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(backup), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: 'Export CloverPal Backup',
    });
  }

  return path;
}

/**
 * Restores a backup in dependency order: parents before children.
 * Each write uses its own transaction. No transaction wraps the whole import,
 * because saveGroup/saveDocument open their own and SQLite rejects nested transactions.
 */
export async function importDatabaseBackup(jsonString: string): Promise<boolean> {
  try {
    if (jsonString.length > MAX_BACKUP_CHARS) {
      throw new Error('Backup file exceeds 50 MB limit.');
    }

    const data = JSON.parse(jsonString);
    if (!data || typeof data.schemaVersion !== 'number' || data.schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw new Error('Unsupported backup schema.');
    }

    const list = (key: string): any[] => (Array.isArray(data[key]) ? data[key] : []);
    const db = await getDatabase();

    for (const c of list('collections')) await upsertCollection(db, c);
    for (const c of list('characters')) await upsertCharacter(db, c);
    for (const g of list('groups')) await saveGroup(g);
    for (const conv of list('conversations')) await upsertConversation(db, conv);
    for (const m of list('messages')) await upsertMessage(db, m);
    for (const m of list('memories')) await upsertMemory(db, m);

    const chunksByDocument = new Map<string, DocumentChunk[]>();
    for (const ch of list('chunks') as DocumentChunk[]) {
      const bucket = chunksByDocument.get(ch.documentId) ?? [];
      bucket.push(ch);
      chunksByDocument.set(ch.documentId, bucket);
    }
    for (const doc of list('documents') as DocumentMetadata[]) {
      const chunks = chunksByDocument.get(doc.id) ?? [];
      await db.withTransactionAsync(async () => {
        await writeDocument(db, doc, chunks);
      });
    }

    return true;
  } catch (err) {
    console.warn('Backup import failed:', err);
    return false;
  }
}

// ==========================================
// React provider
// ==========================================

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
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))));
  }, []);

  return React.createElement(DatabaseContext.Provider, { value: { isReady, error } }, children);
};

export const useDatabase = () => useContext(DatabaseContext);
