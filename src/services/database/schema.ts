/**
 * SQLite Database Migrations Schema
 * Executed sequentially using PRAGMA user_version.
 */

export const MIGRATION_1_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT,
    description TEXT,
    avatar_key TEXT,
    personality TEXT,
    system_prompt TEXT NOT NULL,
    greeting_message TEXT,
    example_dialogue TEXT,
    category TEXT DEFAULT 'Companion',
    response_mode TEXT DEFAULT 'automatic',
    memory_scope TEXT DEFAULT 'private',
    created_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    turn_mode TEXT DEFAULT 'auto-moderated',
    created_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    PRIMARY KEY (group_id, character_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    character_id TEXT,
    group_id TEXT,
    engine TEXT NOT NULL DEFAULT 'llama.cpp',
    model_id TEXT NOT NULL,
    system_prompt_override TEXT,
    summary TEXT,
    active_collection_ids TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);`,

  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT,
    sender_name TEXT NOT NULL,
    sender_avatar TEXT,
    content TEXT NOT NULL,
    format_mode TEXT DEFAULT 'automatic',
    citations_json TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    tokens_per_second REAL DEFAULT 0,
    eval_ms INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );`,

  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);`,

  `CREATE TABLE IF NOT EXISTS personal_memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 3,
    source_conversation_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS document_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#10b981',
    created_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER DEFAULT 1,
    chunk_count INTEGER DEFAULT 0,
    raw_text TEXT,
    indexed_at INTEGER NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES document_collections(id) ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_json TEXT,
    token_count INTEGER NOT NULL,
    page_number INTEGER,
    section_header TEXT,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );`,

  `CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id, chunk_index);`,

  `CREATE TABLE IF NOT EXISTS engine_profiles (
    engine_id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    config_json TEXT,
    updated_at INTEGER NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS generation_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    temperature REAL NOT NULL,
    top_p REAL NOT NULL,
    top_k INTEGER NOT NULL,
    min_p REAL NOT NULL,
    repeat_penalty REAL NOT NULL,
    max_tokens INTEGER NOT NULL,
    is_default INTEGER DEFAULT 0
  );`,
];

export const MIGRATION_2_STATEMENTS = [
  `ALTER TABLE document_chunks ADD COLUMN embedding_model TEXT;`,
  `ALTER TABLE document_chunks ADD COLUMN embedding_dim INTEGER;`,
  `ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'complete';`,
];
