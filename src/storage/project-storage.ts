import { connect, type Connection, type Table } from "@lancedb/lancedb"
import { join } from "node:path"
import { mkdirSync, existsSync, rmSync } from "node:fs"

import { sessionsSchema, messagesSchema, memoriesSchema } from "./schema.ts"
import type { Session, Message, MessageRole, Memory, MemorySource, SearchResult } from "./types.ts"

const STORAGE_DIR = ".tinker"
const DB_DIR = "lancedb"

function generateId(): string {
  return crypto.randomUUID()
}

/** Convert camelCase to snake_case */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/** Convert snake_case to camelCase */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert TypeScript object (camelCase) to DB record (snake_case).
 */
function toDbRecord<T extends object>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value
  }
  return result
}

/**
 * Convert Arrow/DB record (snake_case) to TypeScript object (camelCase).
 * Handles BigInt -> number, Vector -> array conversions.
 */
function fromDbRecord<T>(record: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("_")) continue // Skip internal fields like _distance

    const camelKey = toCamelCase(key)

    if (typeof value === "bigint") {
      // BigInt -> number (for timestamps)
      result[camelKey] = Number(value)
    } else if (value && typeof value === "object" && "toArray" in value) {
      // Arrow Vector -> array
      result[camelKey] = (value as { toArray: () => unknown[] }).toArray()
    } else if (value && typeof value === "object" && "length" in value && "get" in value) {
      // Arrow FixedSizeList/List -> array
      const arr: unknown[] = []
      const len = (value as { length: number }).length
      const get = (value as { get: (i: number) => unknown }).get
      for (let i = 0; i < len; i++) {
        arr.push(get(i))
      }
      result[camelKey] = arr
    } else {
      result[camelKey] = value
    }
  }

  return result as T
}

/**
 * ProjectStorage — per-project storage for sessions, messages, and memories.
 * Stored in {project}/.tinker/lancedb/
 *
 * Future: Global memory support will be added via InstanceStorage.
 */
export class ProjectStorage {
  private db: Connection
  private sessions: Table | null = null
  private messages: Table | null = null
  private memories: Table | null = null

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

    if (tables.includes("memories")) {
      this.memories = await this.db.openTable("memories")
    } else {
      this.memories = await this.db.createEmptyTable("memories", memoriesSchema)
    }
  }

  // ─── Sessions ──────────────────────────────────────────────────

  async createSession(title?: string): Promise<Session> {
    const now = Date.now()
    const session: Session = {
      id: generateId(),
      title: title ?? null,
      createdAt: now,
      updatedAt: now,
    }

    await this.sessions!.add([toDbRecord(session)])
    return session
  }

  async getSession(id: string): Promise<Session | null> {
    const results = await this.sessions!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return fromDbRecord<Session>(results[0] as Record<string, unknown>)
  }

  async listSessions(): Promise<Session[]> {
    const results = await this.sessions!.query().toArray()
    const sessions = results.map((r) => fromDbRecord<Session>(r as Record<string, unknown>))
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async updateSession(id: string, title: string): Promise<Session | null> {
    await this.sessions!.update({
      where: `id = '${id}'`,
      values: { title, updated_at: Date.now() },
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
    role: MessageRole,
    content: string,
    embedding?: number[]
  ): Promise<Message> {
    const message: Message = {
      id: generateId(),
      sessionId,
      role,
      content,
      embedding: embedding ?? null,
      createdAt: Date.now(),
    }

    await this.messages!.add([toDbRecord(message)])

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

    const messages = results.map((r) => fromDbRecord<Message>(r as Record<string, unknown>))
    return messages.sort((a, b) => a.createdAt - b.createdAt)
  }

  async getMessage(id: string): Promise<Message | null> {
    const results = await this.messages!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return fromDbRecord<Message>(results[0] as Record<string, unknown>)
  }

  async updateMessageEmbedding(id: string, embedding: number[]): Promise<void> {
    await this.messages!.update({
      where: `id = '${id}'`,
      values: { embedding },
    })
  }

  async searchMessages(
    queryEmbedding: number[],
    limit: number = 10,
    sessionId?: string
  ): Promise<SearchResult<Message>[]> {
    let query = this.messages!.vectorSearch(queryEmbedding)

    if (sessionId) {
      query = query.where(`session_id = '${sessionId}'`)
    }

    const results = await query.limit(limit).toArray()

    return results.map((r: Record<string, unknown>) => ({
      item: fromDbRecord<Message>(r),
      distance: r._distance as number,
    }))
  }

  // ─── Memories ──────────────────────────────────────────────────

  async addMemory(
    content: string,
    embedding: number[],
    source: MemorySource,
    options?: { sourceId?: string; tags?: string[] }
  ): Promise<Memory> {
    const now = Date.now()
    const memory: Memory = {
      id: generateId(),
      content,
      embedding,
      source,
      sourceId: options?.sourceId ?? null,
      tags: options?.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }

    await this.memories!.add([toDbRecord(memory)])
    return memory
  }

  async getMemory(id: string): Promise<Memory | null> {
    const results = await this.memories!
      .query()
      .where(`id = '${id}'`)
      .limit(1)
      .toArray()

    if (!results[0]) return null
    return fromDbRecord<Memory>(results[0] as Record<string, unknown>)
  }

  async listMemories(options?: {
    source?: MemorySource
    limit?: number
  }): Promise<Memory[]> {
    let query = this.memories!.query()

    if (options?.source) {
      query = query.where(`source = '${options.source}'`)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const results = await query.toArray()
    const memories = results.map((r) => fromDbRecord<Memory>(r as Record<string, unknown>))
    return memories.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async searchMemories(
    queryEmbedding: number[],
    options?: {
      limit?: number
      source?: MemorySource
    }
  ): Promise<SearchResult<Memory>[]> {
    let query = this.memories!.vectorSearch(queryEmbedding)

    if (options?.source) {
      query = query.where(`source = '${options.source}'`)
    }

    const limit = options?.limit ?? 10
    const results = await query.limit(limit).toArray()

    return results.map((r: Record<string, unknown>) => ({
      item: fromDbRecord<Memory>(r),
      distance: r._distance as number,
    }))
  }

  async updateMemory(
    id: string,
    updates: Partial<Pick<Memory, "content" | "embedding" | "tags">>
  ): Promise<Memory | null> {
    await this.memories!.update({
      where: `id = '${id}'`,
      values: { ...updates, updated_at: Date.now() },
    })
    return this.getMemory(id)
  }

  async deleteMemory(id: string): Promise<boolean> {
    const before = await this.memories!.countRows()
    await this.memories!.delete(`id = '${id}'`)
    const after = await this.memories!.countRows()
    return before > after
  }

  async countMemories(source?: MemorySource): Promise<number> {
    if (source) {
      return this.memories!.countRows(`source = '${source}'`)
    }
    return this.memories!.countRows()
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
