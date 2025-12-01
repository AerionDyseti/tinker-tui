/**
 * SessionRepository Port — Contract for session and artifact persistence.
 *
 * This port abstracts the storage of conversation sessions and their
 * artifacts (user inputs, agent responses, tool uses, etc.).
 */

import type { Session, SessionMetadata, SessionArtifact } from "../session.ts"

/**
 * Repository for Session entities.
 */
export interface SessionRepository {
  /**
   * Create a new session.
   */
  createSession(
    projectId: string,
    title: string,
    metadata?: SessionMetadata
  ): Promise<Session>

  /**
   * Get a session by ID.
   */
  getSession(id: string): Promise<Session | null>

  /**
   * List all sessions, ordered by most recently updated.
   */
  listSessions(): Promise<Session[]>

  /**
   * Update session properties.
   */
  updateSession(
    id: string,
    updates: { title?: string; metadata?: SessionMetadata }
  ): Promise<Session | null>

  /**
   * Delete a session and all its artifacts.
   */
  deleteSession(id: string): Promise<boolean>
}

/**
 * Repository for SessionArtifact entities.
 */
export interface ArtifactRepository {
  /**
   * Add an artifact to a session.
   */
  addArtifact<T extends SessionArtifact>(
    sessionId: string,
    artifact: Omit<T, "id" | "sessionId" | "timestamp">
  ): Promise<T>

  /**
   * Get all artifacts for a session, ordered by timestamp.
   */
  getArtifacts(sessionId: string): Promise<SessionArtifact[]>

  /**
   * Get a single artifact by ID.
   */
  getArtifact(id: string): Promise<SessionArtifact | null>

  /**
   * Delete all artifacts after a given timestamp.
   * Used for truncation/regeneration.
   */
  deleteArtifactsAfter(sessionId: string, afterTimestamp: Date): Promise<number>

  /**
   * Search artifacts by vector similarity.
   */
  searchArtifacts(
    queryEmbedding: number[],
    limit?: number,
    sessionId?: string
  ): Promise<Array<{ item: SessionArtifact; distance: number }>>
}
