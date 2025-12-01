/**
 * SessionManager - Manages session lifecycle to prevent singleton state leaks.
 *
 * Instead of a single global ConversationService, this class:
 * - Creates new sessions on demand
 * - Caches loaded sessions by ID
 * - Provides a clean separation between session lifecycle and conversation logic
 */

import {
  ConversationService,
  type ConversationServiceConfig,
} from "./conversation-service.ts"
import type { ProjectStorage } from "@/infrastructure/persistence/project-storage.ts"
import type { Provider } from "@/domain/provider.ts"
import type { Embedder } from "@/infrastructure/embedding/index.ts"
import type { Session } from "@/domain/session.ts"

export interface SessionManagerConfig {
  /** The project ID for session association */
  projectId: string

  /** The project storage for persistence */
  storage: ProjectStorage

  /** The embedder for creating artifact embeddings */
  embedder: Embedder

  /** Default system prompt for new sessions */
  systemPrompt?: string

  /** Working directory for sessions */
  workingDirectory?: string

  /** Tokens to reserve for response (default: 1024) */
  responseReserve?: number
}

export class SessionManager {
  private config: SessionManagerConfig
  private provider: Provider
  private loadedSessions = new Map<string, ConversationService>()

  constructor(config: SessionManagerConfig, provider: Provider) {
    this.config = config
    this.provider = provider
  }

  /**
   * Get the current provider.
   */
  get currentProvider(): Provider {
    return this.provider
  }

  /**
   * Update the provider for new sessions.
   * Existing cached sessions keep their original provider unless explicitly updated.
   */
  setProvider(provider: Provider): void {
    this.provider = provider
  }

  /**
   * Create a new session.
   */
  async createSession(title?: string): Promise<ConversationService> {
    const session = this.buildConversationService()
    await session.start(title)

    // Cache by the new session ID
    const sessionData = session.currentSession
    if (sessionData) {
      this.loadedSessions.set(sessionData.id, session)
    }

    return session
  }

  /**
   * Get an existing session by ID.
   * Returns cached instance if available, otherwise loads from storage.
   */
  async getSession(sessionId: string): Promise<ConversationService | null> {
    // Check cache first
    if (this.loadedSessions.has(sessionId)) {
      return this.loadedSessions.get(sessionId)!
    }

    // Load from storage
    const service = this.buildConversationService()
    const loaded = await service.load(sessionId)

    if (!loaded) {
      return null
    }

    this.loadedSessions.set(sessionId, service)
    return service
  }

  /**
   * Get or create a session.
   * If sessionId is provided and exists, returns that session.
   * Otherwise creates a new session.
   */
  async getOrCreateSession(sessionId?: string): Promise<ConversationService> {
    if (sessionId) {
      const existing = await this.getSession(sessionId)
      if (existing) {
        return existing
      }
    }

    return this.createSession()
  }

  /**
   * List all sessions for the project.
   */
  async listSessions(): Promise<Session[]> {
    return this.config.storage.listSessions()
  }

  /**
   * Remove a session from cache (but not from storage).
   * Call this when a session should be garbage collected.
   */
  evictSession(sessionId: string): void {
    this.loadedSessions.delete(sessionId)
  }

  /**
   * Clear all cached sessions.
   */
  clearCache(): void {
    this.loadedSessions.clear()
  }

  /**
   * Truncate a session after a specific artifact index.
   * Returns the number of artifacts removed, or null if session not found.
   */
  async truncateSession(
    sessionId: string,
    afterIndex: number
  ): Promise<number | null> {
    const session = await this.getSession(sessionId)
    if (!session) {
      return null
    }
    return session.truncateAfter(afterIndex)
  }

  /**
   * Build a new ConversationService with current config and provider.
   */
  private buildConversationService(): ConversationService {
    const serviceConfig: ConversationServiceConfig = {
      projectId: this.config.projectId,
      provider: this.provider,
      storage: this.config.storage,
      embedder: this.config.embedder,
      systemPrompt: this.config.systemPrompt,
      workingDirectory: this.config.workingDirectory,
      responseReserve: this.config.responseReserve,
    }

    return new ConversationService(serviceConfig)
  }
}
