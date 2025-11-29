// Storage classes
export { ProjectStorage } from "./project-storage.ts"

// Types
export {
  type Session,
  type SessionMetadata,
  type SessionArtifact,
  type ArtifactKind,
  type CompletionStatus,
  type UserInput,
  type AgentResponse,
  type SystemInstruction,
  type KnowledgeReference,
  type ToolUse,
  type ToolResult,
  // Knowledge
  type Knowledge,
  type KnowledgeSource,
  type KnowledgeSourceMetadata,
  // Shared
  type Embedding,
  type SearchResult,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from "./types.ts"

// Schemas (for advanced usage)
export { sessionsSchema, artifactsSchema, knowledgeSchema } from "./schema.ts"
