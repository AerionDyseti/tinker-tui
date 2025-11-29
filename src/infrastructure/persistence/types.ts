// Re-export domain types for convenience
export type {
  Session,
  SessionMetadata,
  SessionEntry,
  EntryKind,
  UserInput,
  AgentResponse,
  SystemInstruction,
  KnowledgeReference,
  ToolInvocation,
  // Legacy
  Message,
  MessageType,
} from "@/domain/session.ts"

export type {
  Knowledge,
  KnowledgeSource,
  KnowledgeSourceMetadata,
} from "@/domain/knowledge.ts"

export type { Embedding, SearchResult } from "@/domain/shared.ts"
export { DEFAULT_EMBEDDING_DIMENSIONS } from "@/domain/shared.ts"
