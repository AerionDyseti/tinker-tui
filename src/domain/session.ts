// Re-export entry types for convenience
export type {
  SessionEntry,
  EntryKind,
  UserInput,
  AgentResponse,
  SystemInstruction,
  KnowledgeReference,
  ToolInvocation,
} from "./entry.ts"

export {
  isConversationEntry,
  isContextEntry,
  isActionEntry,
  messageTypeToEntryKind,
} from "./entry.ts"

// Legacy exports for backward compatibility during migration
export type { Message, MessageType } from "./entry.ts"

/**
 * Session metadata — tracks context about how/where the session was created.
 */
export interface SessionMetadata {
  /** @deprecated Use Session.projectId instead */
  projectPath?: string
  provider?: string
  model?: string
}

/**
 * A conversation session.
 *
 * Sessions belong to a Project and contain SessionEntries
 * (user inputs, assistant responses, context, tool invocations).
 */
export interface Session {
  id: string
  /** Project this session belongs to */
  projectId: string
  title: string
  createdAt: Date
  updatedAt: Date
  metadata?: SessionMetadata
}
