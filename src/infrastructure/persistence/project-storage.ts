import { connect, type Connection, type Table, type IntoSql } from "@lancedb/lancedb"
import { join } from "node:path"
import { mkdirSync, existsSync, rmSync } from "node:fs"

import { sessionsSchema, messagesSchema, knowledgeSchema } from "./schema.ts"
import type {
  Session,
  SessionMetadata,
  Message,
  MessageType,
  MessageMetadata,
  Knowledge,
  KnowledgeSource,
  KnowledgeSourceMetadata,
  Embedding,
  SearchResult,
} from "./types.ts"

const STORAGE_DIR = ".tinker"
const DB_DIR = "lancedb"

function generateId(): string {
  return crypto.randomUUID()
}

// ─── Serialization Helpers ──────────────────────────────────────

/** Serialize Date to timestamp for storage */
function dateToTimestamp(date: Date): number {
  return date.getTime()
}

/** Deserialize timestamp to Date */
function timestampToDate(timestamp: number | bigint): Date {
  return new Date(Number(timestamp))
}

/** Serialize optional JSON fields */
function toJson<T>(obj: T | undefined): string | null {
  return obj ? JSON.stringify(obj) : null
}

/** Deserialize optional JSON fields */
function fromJson<T>(json: string | null | undefined): T | undefined {
  return json ? JSON.parse(json) : undefined
}

/** Extract vector from Arrow result */
function extractVector(value: unknown): number[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && "toArray" in value) {
    return Array.from((value as { toArray: () => number[] }).toArray())
  }
  if (value && typeof value === "object" && "length" in value && "get" in value) {
    const arr: number[] = []
    const len = (value as { length: number }).length
    const get = (value as { get: (i: number) => number }).get
    for (let i = 0; i < len; i++) {
      arr.push(get(i))
    }
    return arr
  }
  return []
}

// ─── DB Record Types ────────────────────────────────────────────

interface SessionRecord {
  id: string
  title: string
  created_at: bigint | number
  updated_at: bigint | number
  metadata: string | null
  [key: string]: unknown // Index signature for LanceDB compatibility
}

interface MessageRecord {
  id: string
  session_id: string
  message_type: string
  content: string
  tokens: number
  pinned: boolean
  embedding_vector: unknown
  embedding_model: string
  embedding_dimensions: number
  embedding_created_at: bigint | number
  timestamp: bigint | number
  metadata: string | null
  [key: string]: unknown // Index signature for LanceDB compatibility
}

interface KnowledgeRecord {
  id: string
  content: string
  embedding_vector: unknown
  embedding_model: string
  embedding_dimensions: number
  embedding_created_at: bigint | number
  source: string
  source_metadata: string
  tags: string[]
  created_at: bigint | number
  updated_at: bigint | number
  [key: string]: unknown // Index signature for LanceDB compatibility
}

// ─── Record Converters ──────────────────────────────────────────

function sessionToRecord(session: Session): SessionRecord {
  return {
    id: session.id,
    title: session.title,
    created_at: dateToTimestamp(session.createdAt),
    updated_at: dateToTimestamp(session.updatedAt),
    metadata: toJson(session.metadata),
  }
}

function recordToSession(record: SessionRecord): Session {
  return {
    id: record.id,
    title: record.title,
    createdAt: timestampToDate(record.created_at),
    updatedAt: timestampToDate(record.updated_at),
    metadata: fromJson<SessionMetadata>(record.metadata),
  }
}

function messageToRecord(message: Message): MessageRecord {
  return {
    id: message.id,
    session_id: message.sessionId,
    message_type: message.type,
    content: message.content,
    tokens: message.tokens,
    pinned: message.pinned ?? false,
    embedding_vector: message.embedding.vector,
    embedding_model: message.embedding.model,
    embedding_dimensions: message.embedding.dimensions,
    embedding_created_at: dateToTimestamp(message.embedding.createdAt),
    timestamp: dateToTimestamp(message.timestamp),
    metadata: toJson(message.metadata),
  }
}

function recordToMessage(record: MessageRecord): Message {
  const embedding: Embedding = {
    vector: extractVector(record.embedding_vector),
    model: record.embedding_model,
    dimensions: record.embedding_dimensions,
    createdAt: timestampToDate(record.embedding_created_at),
  }

  return {
    id: record.id,
    sessionId: record.session_id,
    type: record.message_type as MessageType,
    content: record.content,
    tokens: record.tokens,
    embedding,
    timestamp: timestampToDate(record.timestamp),
    pinned: record.pinned || undefined,
    metadata: fromJson<MessageMetadata>(record.metadata),
  }
}

function knowledgeToRecord(knowledge: Knowledge): KnowledgeRecord {
  return {
    id: knowledge.id,
    content: knowledge.content,
    embedding_vector: knowledge.embedding.vector,
    embedding_model: knowledge.embedding.model,
    embedding_dimensions: knowledge.embedding.dimensions,
    embedding_created_at: dateToTimestamp(knowledge.embedding.createdAt),
    source: knowledge.source,
    source_metadata: JSON.stringify(knowledge.sourceMetadata),
    tags: knowledge.tags,
    created_at: dateToTimestamp(knowledge.createdAt),
    updated_at: dateToTimestamp(knowledge.updatedAt),
  }
}

function recordToKnowledge(record: KnowledgeRecord): Knowledge {
  const embedding: Embedding = {
    vector: extractVector(record.embedding_vector),
    model: record.embedding_model,
    dimensions: record.embedding_dimensions,
    createdAt: timestampToDate(record.embedding_created_at),
  }

  return {
    id: record.id,
    content: record.content,
    embedding,
    source: record.source as KnowledgeSource,
    sourceMetadata: JSON.parse(record.source_metadata) as KnowledgeSourceMetadata,
    tags: Array.isArray(record.tags) ? record.tags : [],
    createdAt: timestampToDate(record.created_at),
    updatedAt: timestampToDate(record.updated_at),
  }
}

// ─── Storage Class ──────────────────────────────────────────────

/**
 * ProjectStorage — per-project storage for sessions, messages, and knowledge.
 * Stored in {project}/.tinker/lancedb/
 *
 * Handles serialization between domain types (Date, Embedding interface)
 * and storage format (timestamps, flat vectors).
 */
export class ProjectStorage {
  private db: Connection
  private sessions: Table | null = null
  private messages: Table | null = null
  private knowledge: Table | null = null

  private constructor(db: Connection) {
    this.db = db
  }

  /**
   * Open or create project storage.
   */
  static async open(projectRoot: string): Promise<ProjectStorage> {
    const dbPath = join(projectRoot, STORAGE_DIR, DB_DIR)

    if (!existsSync(join(projectRoot, STORAGE_DIR))) {
      mkdirSync(join(projectRoot, STORAGE_DIR), { recursive: true })
    }

    const db = await connect(dbPath)
    const storage = new ProjectStorage(db)
    await storage.ensureTables()
    return storage
  }

  /**
   * Create temporary storage for testing.
   * Uses a unique temp directory that's cleaned up when closed.
   */
  static async memory(): Promise<ProjectStorage> {
    const tempDir = join("/tmp", `tinker-test-${crypto.randomUUID()}`)
    mkdirSync(tempDir, { recursive: true })
    const db = await connect(tempDir)
    const storage = new ProjectStorage(db)
    storage._tempDir = tempDir
    await storage.ensureTables()
    return storage
  }

  private _tempDir: string | null = null

  private async ensureTables(): Promise<void> {
    const tables = await this.db.tableNames()

    if (tables.includes("sessions")) {
      this.sessions = await this.db.openTable("sessions")
    } else {
      this.sessions = await this.db.createEmptyTable("sessions", sessionsSchema)
    }

    if (tables.includes("messages")) {
      this.messages = await this.db.openTable("messages")
    } else {
      this.messages = await this.db.createEmptyTable("messages", messagesSchema)
    }

    if (tables.includes("knowledge")) {
      this.knowledge = await this.db.openTable("knowledge")
    } else {
      this.knowledge = await this.db.createEmptyTable("knowledge", knowledgeSchema)
    }
  }

  // ─── Sessions ──────────────────────────────────────────────────

  async createSession(title: string, metadata?: SessionMetadata): Promise<Session> {
    const now = new Date()
    const session: Session = {
      id: generateId(),
      title,
      createdAt: now,
      updatedAt: now,
      metadata,
    }

    await this.sessions!.add([sessionToRecord(session)])
    return session
  }

  async getSession(id: string): Promise<Session | null> {
    const results = await this.sessions!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return recordToSession(results[0] as unknown as SessionRecord)
  }

  async listSessions(): Promise<Session[]> {
    const results = await this.sessions!.query().toArray()
    const sessions = results.map((r) => recordToSession(r as unknown as SessionRecord))
    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  async updateSession(
    id: string,
    updates: { title?: string; metadata?: SessionMetadata }
  ): Promise<Session | null> {
    const values: Record<string, IntoSql> = {
      updated_at: Date.now(),
    }
    if (updates.title !== undefined) values.title = updates.title
    if (updates.metadata !== undefined) values.metadata = toJson(updates.metadata)

    await this.sessions!.update({
      where: `id = '${id}'`,
      values,
    })
    return this.getSession(id)
  }

  async deleteSession(id: string): Promise<boolean> {
    const before = await this.sessions!.countRows()
    await this.sessions!.delete(`id = '${id}'`)
    await this.messages!.delete(`session_id = '${id}'`)
    const after = await this.sessions!.countRows()
    return before > after
  }

  // ─── Messages ──────────────────────────────────────────────────

  async addMessage(
    sessionId: string,
    type: MessageType,
    content: string,
    embedding: Embedding,
    tokens: number,
    options?: { pinned?: boolean; metadata?: MessageMetadata }
  ): Promise<Message> {
    const message: Message = {
      id: generateId(),
      sessionId,
      type,
      content,
      tokens,
      embedding,
      timestamp: new Date(),
      pinned: options?.pinned,
      metadata: options?.metadata,
    }

    await this.messages!.add([messageToRecord(message)])

    // Touch session
    await this.sessions!.update({
      where: `id = '${sessionId}'`,
      values: { updated_at: Date.now() },
    })

    return message
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const results = await this.messages!
      .query()
      .where(`session_id = '${sessionId}'`)
      .toArray()

    const messages = results.map((r) => recordToMessage(r as unknown as MessageRecord))
    return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  async getMessage(id: string): Promise<Message | null> {
    const results = await this.messages!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return recordToMessage(results[0] as unknown as MessageRecord)
  }

  async updateMessage(
    id: string,
    updates: { pinned?: boolean; metadata?: MessageMetadata }
  ): Promise<Message | null> {
    const values: Record<string, IntoSql> = {}
    if (updates.pinned !== undefined) values.pinned = updates.pinned
    if (updates.metadata !== undefined) values.metadata = toJson(updates.metadata)

    if (Object.keys(values).length > 0) {
      await this.messages!.update({
        where: `id = '${id}'`,
        values,
      })
    }
    return this.getMessage(id)
  }

  async searchMessages(
    queryEmbedding: number[],
    limit: number = 10,
    sessionId?: string
  ): Promise<SearchResult<Message>[]> {
    let query = this.messages!.vectorSearch(queryEmbedding).column("embedding_vector")

    if (sessionId) {
      query = query.where(`session_id = '${sessionId}'`)
    }

    const results = await query.limit(limit).toArray()

    return results.map((r: Record<string, unknown>) => ({
      item: recordToMessage(r as unknown as MessageRecord),
      distance: r._distance as number,
    }))
  }

  // ─── Knowledge ─────────────────────────────────────────────────

  async addKnowledge(
    content: string,
    embedding: Embedding,
    source: KnowledgeSource,
    sourceMetadata: KnowledgeSourceMetadata,
    tags?: string[]
  ): Promise<Knowledge> {
    const now = new Date()
    const knowledge: Knowledge = {
      id: generateId(),
      content,
      embedding,
      source,
      sourceMetadata,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
    }

    await this.knowledge!.add([knowledgeToRecord(knowledge)])
    return knowledge
  }

  async getKnowledge(id: string): Promise<Knowledge | null> {
    const results = await this.knowledge!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return recordToKnowledge(results[0] as unknown as KnowledgeRecord)
  }

  async listKnowledge(options?: {
    source?: KnowledgeSource
    limit?: number
  }): Promise<Knowledge[]> {
    let query = this.knowledge!.query()

    if (options?.source) {
      query = query.where(`source = '${options.source}'`)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const results = await query.toArray()
    const items = results.map((r) => recordToKnowledge(r as unknown as KnowledgeRecord))
    return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  async searchKnowledge(
    queryEmbedding: number[],
    options?: {
      limit?: number
      source?: KnowledgeSource
    }
  ): Promise<SearchResult<Knowledge>[]> {
    let query = this.knowledge!.vectorSearch(queryEmbedding).column("embedding_vector")

    if (options?.source) {
      query = query.where(`source = '${options.source}'`)
    }

    const limit = options?.limit ?? 10
    const results = await query.limit(limit).toArray()

    return results.map((r: Record<string, unknown>) => ({
      item: recordToKnowledge(r as unknown as KnowledgeRecord),
      distance: r._distance as number,
    }))
  }

  async updateKnowledge(
    id: string,
    updates: Partial<Pick<Knowledge, "content" | "tags">> & { embedding?: Embedding }
  ): Promise<Knowledge | null> {
    const values: Record<string, IntoSql> = {
      updated_at: Date.now(),
    }

    if (updates.content !== undefined) values.content = updates.content
    if (updates.tags !== undefined) values.tags = updates.tags as IntoSql
    if (updates.embedding !== undefined) {
      values.embedding_vector = updates.embedding.vector as IntoSql
      values.embedding_model = updates.embedding.model
      values.embedding_dimensions = updates.embedding.dimensions
      values.embedding_created_at = dateToTimestamp(updates.embedding.createdAt)
    }

    await this.knowledge!.update({
      where: `id = '${id}'`,
      values,
    })
    return this.getKnowledge(id)
  }

  async deleteKnowledge(id: string): Promise<boolean> {
    const before = await this.knowledge!.countRows()
    await this.knowledge!.delete(`id = '${id}'`)
    const after = await this.knowledge!.countRows()
    return before > after
  }

  async countKnowledge(source?: KnowledgeSource): Promise<number> {
    if (source) {
      return this.knowledge!.countRows(`source = '${source}'`)
    }
    return this.knowledge!.countRows()
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  close(): void {
    this.db.close()
    // Clean up temp directory if this was a test instance
    if (this._tempDir) {
      rmSync(this._tempDir, { recursive: true, force: true })
    }
  }
}
