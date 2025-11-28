/**
 * Message role in a conversation.
 * Flexible string to support various APIs and custom roles (e.g., "memory").
 */
export type MessageRole = string

/**
 * A conversation session.
 */
export interface Session {
  id: string
  title: string | null
  createdAt: number  // Unix timestamp ms
  updatedAt: number
}

/**
 * A message within a session.
 * Embeddings are stored inline for efficient semantic search.
 */
export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  embedding: number[] | null  // null if not yet embedded
  createdAt: number
}

/**
 * Memory source types — where the memory came from.
 */
export type MemorySource = "conversation" | "user" | "system" | "code"

/**
 * A memory — extracted knowledge for RAG.
 * First-class citizen in the storage layer.
 */
export interface Memory {
  id: string
  content: string
  embedding: number[]
  source: MemorySource
  sourceId: string | null  // e.g., message ID or file path
  tags: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Result from a semantic search.
 */
export interface SearchResult<T> {
  item: T
  distance: number
}

/**
 * Embedding dimensions — configurable per project.
 * Default: 384 (sentence-transformers/all-MiniLM-L6-v2)
 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 384
