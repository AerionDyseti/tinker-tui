import { connect, type Connection, type Table, type IntoSql } from "@lancedb/lancedb"
import { join } from "node:path"
import { mkdirSync, existsSync, rmSync } from "node:fs"

import { sessionsSchema, artifactsSchema, knowledgeSchema } from "./schema.ts"
import type {
  Session,
  SessionMetadata,
  SessionArtifact,
  ArtifactKind,
  UserInput,
  AgentResponse,
  SystemInstruction,
  KnowledgeReference,
  ToolUse,
  ToolResult,
  Knowledge,
  KnowledgeSource,
  KnowledgeSourceMetadata,
  Embedding,
  SearchResult,
} from "./types.ts"

/** Metadata stored in entry records for type-specific fields */
interface EntryRecordMetadata {
  // For AgentResponse
  model?: string
  provider?: string
  status?: string
  // For SystemInstruction
  priority?: number
  // For KnowledgeReference
  knowledgeId?: string
  relevanceScore?: number
  // For ToolUse
  toolUseId?: string
  toolId?: string
  toolName?: string
  input?: unknown
  // For ToolResult
  result?: unknown
  isError?: boolean
}

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
  if (!json) return undefined
  try {
    return JSON.parse(json)
  } catch {
    // Handle malformed JSON gracefully
    return undefined
  }
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
  project_id: string // Stored in metadata until schema migration
  title: string
  created_at: bigint | number
  updated_at: bigint | number
  metadata: string | null
  [key: string]: unknown // Index signature for LanceDB compatibility
}

/** Storage record for session artifacts (messages table) */
interface EntryRecord {
  id: string
  session_id: string
  message_type: string // Stores ArtifactKind
  content: string // Content or empty for ToolUse/ToolResult
  tokens: number
  pinned: boolean
  embedding_vector: unknown
  embedding_model: string
  embedding_dimensions: number
  embedding_created_at: bigint | number
  timestamp: bigint | number
  metadata: string | null // Stores EntryRecordMetadata
  [key: string]: unknown // Index signature for LanceDB compatibility
}

// Legacy alias
type MessageRecord = EntryRecord

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

function sessionToRecord(session: Session): Omit<SessionRecord, "project_id"> {
  // Note: project_id is stored in metadata until schema migration
  const metadata: SessionMetadata & { projectId?: string } = {
    ...session.metadata,
    projectId: session.projectId,
  }
  return {
    id: session.id,
    title: session.title,
    created_at: dateToTimestamp(session.createdAt),
    updated_at: dateToTimestamp(session.updatedAt),
    metadata: toJson(metadata),
  }
}

function recordToSession(record: SessionRecord): Session {
  const metadata = fromJson<SessionMetadata & { projectId?: string }>(record.metadata)
  const projectId = metadata?.projectId ?? "unknown"
  // Remove projectId from metadata to keep it clean
  if (metadata?.projectId) {
    delete (metadata as Record<string, unknown>).projectId
  }
  return {
    id: record.id,
    projectId,
    title: record.title,
    createdAt: timestampToDate(record.created_at),
    updatedAt: timestampToDate(record.updated_at),
    metadata: Object.keys(metadata ?? {}).length > 0 ? metadata : undefined,
  }
}

function entryToRecord(entry: SessionArtifact): EntryRecord {
  // Extract content - ToolUse/ToolResult don't have content
  let content = ""
  if ("content" in entry) {
    content = entry.content
  }

  // Build type-specific metadata
  const metadata: EntryRecordMetadata = {}
  switch (entry.kind) {
    case "user_input":
      // No additional metadata needed
      break
    case "agent_response":
      metadata.model = entry.model
      metadata.provider = entry.provider
      metadata.status = entry.status
      break
    case "system_instruction":
      if (entry.priority !== undefined) metadata.priority = entry.priority
      break
    case "knowledge_reference":
      // No additional metadata needed
      break
    case "tool_use":
      metadata.toolUseId = entry.toolUseId
      metadata.toolId = entry.toolId
      metadata.toolName = entry.toolName
      metadata.input = entry.input
      break
    case "tool_result":
      metadata.toolUseId = entry.toolUseId
      metadata.result = entry.result
      metadata.isError = entry.isError
      break
  }

  return {
    id: entry.id,
    session_id: entry.sessionId,
    message_type: entry.kind,
    content,
    tokens: entry.tokens,
    pinned: entry.pinned ?? false,
    embedding_vector: entry.embedding.vector,
    embedding_model: entry.embedding.model,
    embedding_dimensions: entry.embedding.dimensions,
    embedding_created_at: dateToTimestamp(entry.embedding.createdAt),
    timestamp: dateToTimestamp(entry.timestamp),
    metadata: toJson(metadata),
  }
}

function recordToEntry(record: EntryRecord): SessionArtifact {
  const embedding: Embedding = {
    vector: extractVector(record.embedding_vector),
    model: record.embedding_model,
    dimensions: record.embedding_dimensions,
    createdAt: timestampToDate(record.embedding_created_at),
  }

  const base = {
    id: record.id,
    sessionId: record.session_id,
    timestamp: timestampToDate(record.timestamp),
    tokens: record.tokens,
    embedding,
    pinned: record.pinned || undefined,
  }

  const metadata = fromJson<EntryRecordMetadata>(record.metadata) ?? {}
  const kind = record.message_type as ArtifactKind

  switch (kind) {
    case "user_input":
      return { ...base, kind: "user_input", content: record.content } as UserInput
    case "agent_response":
      return {
        ...base,
        kind: "agent_response",
        content: record.content,
        model: metadata.model ?? "unknown",
        provider: metadata.provider ?? "unknown",
        status: (metadata.status as AgentResponse["status"]) ?? "complete",
      } as AgentResponse
    case "system_instruction":
      return {
        ...base,
        kind: "system_instruction",
        content: record.content,
        priority: metadata.priority,
      } as SystemInstruction
    case "knowledge_reference":
      return {
        ...base,
        kind: "knowledge_reference",
        content: record.content,
      } as KnowledgeReference
    case "tool_use":
      return {
        ...base,
        kind: "tool_use",
        toolUseId: metadata.toolUseId ?? "",
        toolId: metadata.toolId ?? "",
        toolName: metadata.toolName ?? "",
        input: metadata.input,
      } as ToolUse
    case "tool_result":
      return {
        ...base,
        kind: "tool_result",
        toolUseId: metadata.toolUseId ?? "",
        result: metadata.result,
        isError: metadata.isError ?? false,
      } as ToolResult
    default:
      // Fallback for unknown/legacy types - treat as user_input
      return { ...base, kind: "user_input", content: record.content } as UserInput
  }
}

// Legacy aliases for gradual migration
const messageToRecord = entryToRecord
const recordToMessage = recordToEntry

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
 * ProjectStorage — per-project storage for sessions, artifacts, and knowledge.
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
      this.messages = await this.db.createEmptyTable("messages", artifactsSchema)
    }

    if (tables.includes("knowledge")) {
      this.knowledge = await this.db.openTable("knowledge")
    } else {
      this.knowledge = await this.db.createEmptyTable("knowledge", knowledgeSchema)
    }
  }

  // ─── Sessions ──────────────────────────────────────────────────

  async createSession(
    projectId: string,
    title: string,
    metadata?: SessionMetadata
  ): Promise<Session> {
    const now = new Date()
    const session: Session = {
      id: generateId(),
      projectId,
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

  // ─── Artifacts (Entries/Messages) ───────────────────────────────

  /**
   * Add a session artifact.
   * Pass a partial artifact (without id/timestamp) and it will be completed.
   */
  async addEntry<T extends SessionArtifact>(
    sessionId: string,
    entry: Omit<T, "id" | "sessionId" | "timestamp">
  ): Promise<T> {
    const fullEntry = {
      ...entry,
      id: generateId(),
      sessionId,
      timestamp: new Date(),
    } as T

    await this.messages!.add([entryToRecord(fullEntry)])

    // Touch session
    await this.sessions!.update({
      where: `id = '${sessionId}'`,
      values: { updated_at: Date.now() },
    })

    return fullEntry
  }

  async getEntries(sessionId: string): Promise<SessionArtifact[]> {
    const results = await this.messages!
      .query()
      .where(`session_id = '${sessionId}'`)
      .toArray()

    const entries = results.map((r) => recordToEntry(r as unknown as EntryRecord))
    return entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  async getEntry(id: string): Promise<SessionArtifact | null> {
    const results = await this.messages!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return recordToEntry(results[0] as unknown as EntryRecord)
  }

  async updateEntry(
    id: string,
    updates: { pinned?: boolean }
  ): Promise<SessionArtifact | null> {
    const values: Record<string, IntoSql> = {}
    if (updates.pinned !== undefined) values.pinned = updates.pinned

    if (Object.keys(values).length > 0) {
      await this.messages!.update({
        where: `id = '${id}'`,
        values,
      })
    }
    return this.getEntry(id)
  }

  // Legacy aliases
  /** @deprecated Use addEntry instead */
  async addMessage(
    sessionId: string,
    kind: ArtifactKind,
    content: string,
    embedding: Embedding,
    tokens: number,
    options?: { pinned?: boolean }
  ): Promise<SessionArtifact> {
    // Create a basic artifact - works for user_input, agent_response, system_instruction, knowledge_reference
    const entry = {
      kind,
      content,
      embedding,
      tokens,
      pinned: options?.pinned,
    } as Omit<SessionArtifact, "id" | "sessionId" | "timestamp">
    return this.addEntry(sessionId, entry)
  }

  /** @deprecated Use getEntries instead */
  async getMessages(sessionId: string): Promise<SessionArtifact[]> {
    return this.getEntries(sessionId)
  }

  /** @deprecated Use getEntry instead */
  async getMessage(id: string): Promise<SessionArtifact | null> {
    return this.getEntry(id)
  }

  /** @deprecated Use updateEntry instead */
  async updateMessage(
    id: string,
    updates: { pinned?: boolean }
  ): Promise<SessionArtifact | null> {
    return this.updateEntry(id, updates)
  }

  async searchEntries(
    queryEmbedding: number[],
    limit: number = 10,
    sessionId?: string
  ): Promise<SearchResult<SessionArtifact>[]> {
    let query = this.messages!.vectorSearch(queryEmbedding).column("embedding_vector")

    if (sessionId) {
      query = query.where(`session_id = '${sessionId}'`)
    }

    const results = await query.limit(limit).toArray()

    return results.map((r: Record<string, unknown>) => ({
      item: recordToEntry(r as unknown as EntryRecord),
      distance: r._distance as number,
    }))
  }

  /** @deprecated Use searchEntries instead */
  async searchMessages(
    queryEmbedding: number[],
    limit: number = 10,
    sessionId?: string
  ): Promise<SearchResult<SessionArtifact>[]> {
    return this.searchEntries(queryEmbedding, limit, sessionId)
  }

  // ─── Artifact Aliases (Preferred API) ───────────────────────────

  /**
   * Add a session artifact.
   * Preferred alias for addEntry().
   */
  async addArtifact<T extends SessionArtifact>(
    sessionId: string,
    artifact: Omit<T, "id" | "sessionId" | "timestamp">
  ): Promise<T> {
    return this.addEntry<T>(sessionId, artifact)
  }

  /**
   * Get all artifacts for a session.
   * Preferred alias for getEntries().
   */
  async getArtifacts(sessionId: string): Promise<SessionArtifact[]> {
    return this.getEntries(sessionId)
  }

  /**
   * Get a single artifact by ID.
   * Preferred alias for getEntry().
   */
  async getArtifact(id: string): Promise<SessionArtifact | null> {
    return this.getEntry(id)
  }

  /**
   * Update an artifact.
   * Preferred alias for updateEntry().
   */
  async updateArtifact(
    id: string,
    updates: { pinned?: boolean }
  ): Promise<SessionArtifact | null> {
    return this.updateEntry(id, updates)
  }

  /**
   * Search artifacts using vector similarity.
   * Preferred alias for searchEntries().
   */
  async searchArtifacts(
    queryEmbedding: number[],
    limit: number = 10,
    sessionId?: string
  ): Promise<SearchResult<SessionArtifact>[]> {
    return this.searchEntries(queryEmbedding, limit, sessionId)
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
    // LanceDB doesn't support updating List columns directly.
    // If tags are being updated, we need to delete and re-insert.
    if (updates.tags !== undefined) {
      const existing = await this.getKnowledge(id)
      if (!existing) return null

      // Merge updates with existing values
      const updated: Knowledge = {
        ...existing,
        content: updates.content ?? existing.content,
        tags: updates.tags,
        embedding: updates.embedding ?? existing.embedding,
        updatedAt: new Date(),
      }

      // Delete and re-add with same ID
      await this.knowledge!.delete(`id = '${id}'`)
      await this.knowledge!.add([knowledgeToRecord(updated)])
      return updated
    }

    // For non-tag updates, use normal update
    const values: Record<string, IntoSql> = {
      updated_at: Date.now(),
    }

    if (updates.content !== undefined) values.content = updates.content
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
