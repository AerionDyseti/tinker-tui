import type { Embedding } from "./shared.ts"

/**
 * Message type — domain-specific classification.
 * Provider translation to roles happens in infrastructure.
 */
export type MessageType =
  | "user" // Human input
  | "assistant" // LLM response
  | "system" // System instructions
  | "knowledge" // Injected from RAG (content from a Knowledge entity)
  | "code" // Code snippet context
  | "tool_use" // LLM wants to use a tool
  | "tool_result" // Result from tool execution

/**
 * Message metadata — varies by message type.
 */
export interface MessageMetadata {
  // For tool messages
  toolId?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown

  // For code messages
  filePath?: string
  language?: string

  // For knowledge messages
  knowledgeId?: string
  relevanceScore?: number

  // Extensible
  [key: string]: unknown
}

/**
 * Session metadata — tracks context about how/where the session was created.
 */
export interface SessionMetadata {
  projectPath?: string
  provider?: string
  model?: string
}

/**
 * A conversation session.
 */
export interface Session {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  metadata?: SessionMetadata
}

/**
 * A message within a session.
 */
export interface Message {
  id: string
  sessionId: string
  type: MessageType
  content: string
  tokens: number // Computed once, stored
  embedding: Embedding // Computed on creation
  timestamp: Date
  pinned?: boolean // User can pin important messages
  metadata?: MessageMetadata
}
