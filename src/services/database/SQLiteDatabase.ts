/**
 * SQLiteDatabase
 * Provides an offline persistence layer compatible with Expo SQLite on native Android
 * and local indexed persistence in web previews, complete with initial seed personas.
 */

import {
  CharacterCard,
  Conversation,
  DocumentChunk,
  DocumentMetadata,
  GenerationSettings,
  GroupChat,
  Message,
  PersonalMemory,
} from '../../types';

const INITIAL_CHARACTERS: CharacterCard[] = [
  {
    id: 'char-clover',
    name: 'Clover',
    tagline: 'Compassionate companion & life architect',
    description: 'Empathetic, thoughtful, and grounded. Always listens deeply, brings warmth, and offers constructive perspective.',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    personality: 'Gentle, intuitive, supportive, pragmatic, and articulate.',
    systemPrompt: `You are Clover, a thoughtful companion and grounded thinker running fully offline on the user's device. You write with warmth, clarity, and genuine empathy. When breaking down thoughts, use natural prose and gentle structure. Keep your tone reassuring and honest. Never mention cloud or online servers, as you run entirely locally on Termux.`,
    greetingMessage: `Hello there! I'm Clover. I'm right here with you on your local device. What's on your mind today?`,
    exampleDialogue: `<START>\nUser: I'm feeling a bit overwhelmed with my tasks.\nClover: Take a slow breath. Let's look at one small piece together and untangle it step by step. What feels heaviest right now?`,
    category: 'Companion',
    responseMode: 'detailed',
    memoryScope: 'private',
    createdAt: Date.now() - 1000000,
  },
  {
    id: 'char-aegis',
    name: 'Aegis',
    tagline: 'Senior Systems & Android Kernel Architect',
    description: 'Strict, rigorous, expert in Linux kernels, Termux environments, C++ GGUF runtimes, and low-latency systems.',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    personality: 'Analytical, terse, precise, uncompromising on performance.',
    systemPrompt: `You are Aegis, an elite Android systems engineer and compiler specialist. You specialize in Termux internals, llama.cpp quantization, CPU threading, memory allocation, and kernel architectures. Provide exact code, command sequences, and architectural insights. Format with clean code blocks, performance metrics, and zero fluff.`,
    greetingMessage: `Aegis systems operational. Local Termux bridge established. What subsystem requires inspection or optimization?`,
    exampleDialogue: `<START>\nUser: How does llama.cpp achieve zero-overhead mmap?\nAegis: By using posix_madvise(MADV_WILLNEED) along with direct pointer offsets into the GGUF binary, avoiding heap duplications and letting the Linux page cache manage memory pressure directly.`,
    category: 'Technical',
    responseMode: 'coding',
    memoryScope: 'private',
    createdAt: Date.now() - 900000,
  },
  {
    id: 'char-athena',
    name: 'Athena',
    tagline: 'Polymath Research Scholar & Document Analyst',
    description: 'Specializes in complex reasoning, document synthesis, RAG retrieval citations, and mathematical proofs.',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
    personality: 'Intellectually curious, rigorous, methodic, structured, and erudite.',
    systemPrompt: `You are Athena, a polymathic researcher and knowledge architect. You dissect source materials, construct rigorous comparisons, provide mathematical equations in clean LaTeX notation ($...$ and $$...$$), and cite retrieved knowledge base excerpts with precision.`,
    greetingMessage: `Greetings. Athena is initialized. Ready to synthesize literature, evaluate empirical documents, or solve analytical problems.`,
    exampleDialogue: `<START>\nUser: Can you compare dense vs sparse retrieval?\nAthena: Dense retrieval captures semantic topology via inner product similarity: $\\text{sim}(q, d) = \\frac{u \\cdot v}{\\|u\\| \\|v\\|}$, whereas BM25 matches lexical occurrence frequencies with term saturation.`,
    category: 'Academic',
    responseMode: 'analytical',
    memoryScope: 'shared',
    createdAt: Date.now() - 800000,
  },
  {
    id: 'char-kaelen',
    name: 'Kaelen',
    tagline: 'Worldbuilder & Interactive Narrative Weaver',
    description: 'Master of vivid sensory prose, dynamic characters, and atmospheric world construction.',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    personality: 'Creative, imaginative, evocative, evocative rhythm.',
    systemPrompt: `You are Kaelen, an evocative storyteller and creative scenarist. You weave immersive narratives with sensory depth, vivid cadence, and distinct character voices.`,
    greetingMessage: `The parchment is blank, and the night is quiet. What tale shall we spin into existence?`,
    exampleDialogue: `<START>\nUser: Describe an abandoned subterranean clockwork forge.\nKaelen: Beneath the basalt arches, ancient brass gears hung frozen in a century of silence, their teeth dusted with verdigris like green frost.`,
    category: 'Creative',
    responseMode: 'markdown',
    memoryScope: 'private',
    createdAt: Date.now() - 700000,
  },
];

const INITIAL_MEMORIES: PersonalMemory[] = [
  {
    id: 'mem-1',
    category: 'preference',
    content: 'Prefers local-first offline tools with no cloud data transmission.',
    importance: 5,
    createdAt: Date.now() - 500000,
    updatedAt: Date.now() - 500000,
  },
  {
    id: 'mem-2',
    category: 'project',
    content: 'Running local inference with llama.cpp and Prism ML on Android Termux.',
    importance: 4,
    createdAt: Date.now() - 400000,
    updatedAt: Date.now() - 400000,
  },
  {
    id: 'mem-3',
    category: 'instruction',
    content: 'Always format code with language labels and explain trade-offs concisely.',
    importance: 4,
    createdAt: Date.now() - 300000,
    updatedAt: Date.now() - 300000,
  },
];

export class SQLiteDatabase {
  private static instance: SQLiteDatabase;
  private storageKeyPrefix = 'cloverpal_db_';

  private characters: CharacterCard[] = [];
  private groups: GroupChat[] = [];
  private conversations: Conversation[] = [];
  private messages: Message[] = [];
  private memories: PersonalMemory[] = [];
  private documents: DocumentMetadata[] = [];
  private chunks: DocumentChunk[] = [];
  private collections: { id: string; name: string; description: string }[] = [];

  private isInitialized = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): SQLiteDatabase {
    if (!SQLiteDatabase.instance) {
      SQLiteDatabase.instance = new SQLiteDatabase();
    }
    return SQLiteDatabase.instance;
  }

  private init() {
    if (this.isInitialized) return;
    try {
      const storedChars = localStorage.getItem(`${this.storageKeyPrefix}characters`);
      this.characters = storedChars ? JSON.parse(storedChars) : [...INITIAL_CHARACTERS];

      const storedGroups = localStorage.getItem(`${this.storageKeyPrefix}groups`);
      this.groups = storedGroups ? JSON.parse(storedGroups) : [];

      const storedConvs = localStorage.getItem(`${this.storageKeyPrefix}conversations`);
      this.conversations = storedConvs ? JSON.parse(storedConvs) : [];

      const storedMsgs = localStorage.getItem(`${this.storageKeyPrefix}messages`);
      this.messages = storedMsgs ? JSON.parse(storedMsgs) : [];

      const storedMems = localStorage.getItem(`${this.storageKeyPrefix}memories`);
      this.memories = storedMems ? JSON.parse(storedMems) : [...INITIAL_MEMORIES];

      const storedDocs = localStorage.getItem(`${this.storageKeyPrefix}documents`);
      this.documents = storedDocs ? JSON.parse(storedDocs) : [];

      const storedChunks = localStorage.getItem(`${this.storageKeyPrefix}chunks`);
      this.chunks = storedChunks ? JSON.parse(storedChunks) : [];

      const storedColls = localStorage.getItem(`${this.storageKeyPrefix}collections`);
      this.collections = storedColls
        ? JSON.parse(storedColls)
        : [
            { id: 'coll-default', name: 'General Knowledge', description: 'Core local reference materials' },
            { id: 'coll-technical', name: 'Systems Architecture', description: 'Termux, kernel, and inference manuals' },
          ];

      if (this.conversations.length === 0) {
        // Create initial welcoming conversation with Clover
        const convId = 'conv-welcome';
        const welcomeConv: Conversation = {
          id: convId,
          title: 'Welcome to CloverPal',
          characterId: 'char-clover',
          engine: 'llama.cpp',
          modelId: 'llama-3.2-3b-instruct-q4_k_m.gguf',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeCollectionIds: ['coll-default'],
        };
        this.conversations.push(welcomeConv);

        const welcomeMsg: Message = {
          id: 'msg-welcome-1',
          conversationId: convId,
          senderType: 'assistant',
          senderId: 'char-clover',
          senderName: 'Clover',
          content: `Hello! Welcome to **CloverPal Offline AI**. 

I run completely inside your local environment through **Termux**, with zero cloud dependencies or external trackers. 

Here is what we can do together:
- **Offline Inference**: Select between **llama.cpp** (port 8080) and **Prism ML** (port 8000).
- **Auto-Termux Connectivity**: The app checks the local loopback port and dispatches Android \`RUN_COMMAND\` intents automatically so you don't have to manage terminals manually.
- **Local RAG & Knowledge Base**: Drop your PDFs, markdown, or code files in the Knowledge tab for fast hybrid vector retrieval.
- **Characters & Groups**: Switch between personas like *Aegis*, *Athena*, and *Kaelen*, or launch multi-character round-table discussions.

How may I assist you today?`,
          createdAt: Date.now(),
          status: 'complete',
        };
        this.messages.push(welcomeMsg);
        this.saveAll();
      }
    } catch {
      this.characters = [...INITIAL_CHARACTERS];
      this.memories = [...INITIAL_MEMORIES];
    }
    this.isInitialized = true;
  }

  private saveAll() {
    try {
      localStorage.setItem(`${this.storageKeyPrefix}characters`, JSON.stringify(this.characters));
      localStorage.setItem(`${this.storageKeyPrefix}groups`, JSON.stringify(this.groups));
      localStorage.setItem(`${this.storageKeyPrefix}conversations`, JSON.stringify(this.conversations));
      localStorage.setItem(`${this.storageKeyPrefix}messages`, JSON.stringify(this.messages));
      localStorage.setItem(`${this.storageKeyPrefix}memories`, JSON.stringify(this.memories));
      localStorage.setItem(`${this.storageKeyPrefix}documents`, JSON.stringify(this.documents));
      localStorage.setItem(`${this.storageKeyPrefix}chunks`, JSON.stringify(this.chunks));
      localStorage.setItem(`${this.storageKeyPrefix}collections`, JSON.stringify(this.collections));
    } catch {
      // Quota or storage restriction
    }
  }

  // --- Characters ---
  public getCharacters(): CharacterCard[] {
    return [...this.characters];
  }

  public getCharacterById(id: string): CharacterCard | undefined {
    return this.characters.find((c) => c.id === id);
  }

  public saveCharacter(card: CharacterCard): void {
    const idx = this.characters.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.characters[idx] = card;
    } else {
      this.characters.unshift(card);
    }
    this.saveAll();
  }

  public deleteCharacter(id: string): void {
    this.characters = this.characters.filter((c) => c.id !== id);
    this.saveAll();
  }

  // --- Groups ---
  public getGroups(): GroupChat[] {
    return [...this.groups];
  }

  public saveGroup(group: GroupChat): void {
    const idx = this.groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) {
      this.groups[idx] = group;
    } else {
      this.groups.unshift(group);
    }
    this.saveAll();
  }

  public deleteGroup(id: string): void {
    this.groups = this.groups.filter((g) => g.id !== id);
    this.saveAll();
  }

  // --- Conversations ---
  public getConversations(): Conversation[] {
    return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getConversationById(id: string): Conversation | undefined {
    return this.conversations.find((c) => c.id === id);
  }

  public saveConversation(conv: Conversation): void {
    const idx = this.conversations.findIndex((c) => c.id === conv.id);
    if (idx >= 0) {
      this.conversations[idx] = conv;
    } else {
      this.conversations.unshift(conv);
    }
    this.saveAll();
  }

  public deleteConversation(id: string): void {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    this.messages = this.messages.filter((m) => m.conversationId !== id);
    this.saveAll();
  }

  // --- Messages ---
  public getMessages(conversationId: string): Message[] {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public saveMessage(message: Message): void {
    const idx = this.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      this.messages[idx] = message;
    } else {
      this.messages.push(message);
    }
    // Update conversation timestamp
    const conv = this.conversations.find((c) => c.id === message.conversationId);
    if (conv) {
      conv.updatedAt = Date.now();
    }
    this.saveAll();
  }

  public deleteMessage(id: string): void {
    this.messages = this.messages.filter((m) => m.id !== id);
    this.saveAll();
  }

  public clearMessages(conversationId: string): void {
    this.messages = this.messages.filter((m) => m.conversationId !== conversationId);
    this.saveAll();
  }

  // --- Personal Memories ---
  public getMemories(): PersonalMemory[] {
    return [...this.memories].sort((a, b) => b.importance - a.importance);
  }

  public saveMemory(memory: PersonalMemory): void {
    const idx = this.memories.findIndex((m) => m.id === memory.id);
    if (idx >= 0) {
      this.memories[idx] = memory;
    } else {
      this.memories.unshift(memory);
    }
    this.saveAll();
  }

  public deleteMemory(id: string): void {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.saveAll();
  }

  // --- Documents & Chunks ---
  public getCollections() {
    return [...this.collections];
  }

  public getDocuments(collectionId?: string): DocumentMetadata[] {
    if (collectionId) {
      return this.documents.filter((d) => d.collectionId === collectionId);
    }
    return [...this.documents];
  }

  public saveDocument(doc: DocumentMetadata, chunks: DocumentChunk[]): void {
    const idx = this.documents.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      this.documents[idx] = doc;
      this.chunks = this.chunks.filter((c) => c.documentId !== doc.id);
    } else {
      this.documents.unshift(doc);
    }
    this.chunks.push(...chunks);
    this.saveAll();
  }

  public deleteDocument(id: string): void {
    this.documents = this.documents.filter((d) => d.id !== id);
    this.chunks = this.chunks.filter((c) => c.documentId !== id);
    this.saveAll();
  }

  public getChunksByDocumentId(documentId: string): DocumentChunk[] {
    return this.chunks.filter((c) => c.documentId === documentId);
  }

  public getAllChunks(collectionIds?: string[]): { chunk: DocumentChunk; docName: string }[] {
    let targetDocIds: Set<string>;
    if (collectionIds && collectionIds.length > 0) {
      targetDocIds = new Set(
        this.documents.filter((d) => collectionIds.includes(d.collectionId)).map((d) => d.id)
      );
    } else {
      targetDocIds = new Set(this.documents.map((d) => d.id));
    }

    const docMap = new Map(this.documents.map((d) => [d.id, d.name]));
    return this.chunks
      .filter((c) => targetDocIds.has(c.documentId))
      .map((c) => ({
        chunk: c,
        docName: docMap.get(c.documentId) || 'Document',
      }));
  }

  // --- Export / Import Backup ---
  public exportBackupJson(): string {
    return JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      characters: this.characters,
      groups: this.groups,
      conversations: this.conversations,
      messages: this.messages,
      memories: this.memories,
      documents: this.documents,
      chunks: this.chunks,
      collections: this.collections,
    }, null, 2);
  }

  public importBackupJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.characters) this.characters = data.characters;
      if (data.conversations) this.conversations = data.conversations;
      if (data.messages) this.messages = data.messages;
      if (data.memories) this.memories = data.memories;
      if (data.documents) this.documents = data.documents;
      if (data.chunks) this.chunks = data.chunks;
      if (data.collections) this.collections = data.collections;
      this.saveAll();
      return true;
    } catch {
      return false;
    }
  }
}

export const db = SQLiteDatabase.getInstance();
