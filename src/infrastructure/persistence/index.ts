// Storage classes
export { ProjectStorage } from "./project-storage.ts"

// Types
export {
  type Session,
  type SessionMetadata,
  type SessionEntry,
  type EntryKind,
  type UserInput,
  type AgentResponse,
  type SystemInstruction,
  type KnowledgeReference,
  type ToolInvocation,
  // Legacy
  type Message,
  type MessageType,
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
export { sessionsSchema, messagesSchema, knowledgeSchema } from "./schema.ts"
