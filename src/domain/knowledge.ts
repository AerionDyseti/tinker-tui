import type { Embedding } from "./shared.ts"

/**
 * Knowledge source types — where the knowledge came from.
 */
export type KnowledgeSource = "conversation" | "user" | "code" | "system"

/**
 * Flexible metadata about knowledge source.
 * Different fields are relevant for different sources.
 */
export interface KnowledgeSourceMetadata {
  // For conversation-sourced knowledge
  sessionId?: string
  messageIds?: string[] // Could span multiple messages

  // For code-sourced knowledge
  filePath?: string
  lineRange?: { start: number; end: number }

  // For user-sourced knowledge
  userNote?: string

  // Extensible for future sources
  [key: string]: unknown
}

/**
 * A piece of knowledge — extracted facts for RAG retrieval.
 * When injected into a conversation, becomes a "knowledge" type message.
 */
export interface Knowledge {
  id: string
  content: string
  embedding: Embedding
  source: KnowledgeSource
  sourceMetadata: KnowledgeSourceMetadata
  tags: string[]
  createdAt: Date
  updatedAt: Date
}
