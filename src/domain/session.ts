// Re-export artifact types for convenience
export type {
  SessionArtifact,
  ArtifactKind,
  CompletionStatus,
  UserInput,
  AgentResponse,
  SystemInstruction,
  KnowledgeReference,
  ToolUse,
  ToolResult,
} from "./artifact.ts"

export {
  isConversationArtifact,
  isContextArtifact,
  isActionArtifact,
} from "./artifact.ts"

/**
 * Session metadata — tracks context about how/where the session was created.
 */
export interface SessionMetadata {
  provider?: string
  model?: string
}

/**
 * A conversation session.
 *
 * Sessions belong to a Project and contain SessionArtifacts
 * (user inputs, agent responses, context, tool uses/results).
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
