// Storage classes
export { ProjectStorage } from "./project-storage.ts"

// Types
export {
  type Session,
  type SessionMetadata,
  type Message,
  type MessageType,
  type MessageMetadata,
  type Knowledge,
  type KnowledgeSource,
  type KnowledgeSourceMetadata,
  type Embedding,
  type SearchResult,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from "./types.ts"

// Schemas (for advanced usage)
export { sessionsSchema, messagesSchema, knowledgeSchema } from "./schema.ts"
