import type { Embedding } from "./shared.ts"

// ============================================================================
// Session Entry — the things that live inside a session
// ============================================================================

/**
 * Entry kind — categorizes what type of session entry this is.
 * Used as discriminator for the SessionEntry union.
 */
export type EntryKind =
  // Conversation
  | "user_input"
  | "agent_response"
  // Context
  | "system_instruction"
  | "knowledge_reference"
  // Actions
  | "tool_invocation"

/**
 * Base properties shared by all session entries.
 */
interface EntryBase {
  id: string
  sessionId: string
  kind: EntryKind
  timestamp: Date
  /** Token count for context budgeting */
  tokens: number
  /** Embedding for semantic search */
  embedding: Embedding
  /** User can pin important entries */
  pinned?: boolean
}

// ─── Conversation Entries ───────────────────────────────────────────────────

/**
 * User input — what the human said/asked.
 */
export interface UserInput extends EntryBase {
  kind: "user_input"
  content: string
}

/**
 * Agent response — what the LLM/agent produced.
 * Named "agent" to support future multi-agent scenarios.
 */
export interface AgentResponse extends EntryBase {
  kind: "agent_response"
  content: string
  /** Model that generated this response */
  model?: string
  /** Stop reason if available */
  stopReason?: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"
}

// ─── Context Entries ────────────────────────────────────────────────────────

/**
 * System instruction — behavioral guidance for the LLM.
 */
export interface SystemInstruction extends EntryBase {
  kind: "system_instruction"
  content: string
  /** Priority for context assembly (higher = more important) */
  priority?: number
}

/**
 * Knowledge reference — fact from RAG, extracted knowledge, or file content.
 * Code and file contents flow through here or via ToolInvocation results.
 */
export interface KnowledgeReference extends EntryBase {
  kind: "knowledge_reference"
  content: string
  /** ID of the source Knowledge entity (if from knowledge base) */
  knowledgeId?: string
  /** Relevance score from vector search */
  relevanceScore?: number
}

// ─── Action Entries ─────────────────────────────────────────────────────────

/**
 * Tool invocation — a tool use request and its result.
 * Combined into one entry since they're logically paired.
 */
export interface ToolInvocation extends EntryBase {
  kind: "tool_invocation"
  /** Tool identifier */
  toolId: string
  /** Human-readable tool name */
  toolName: string
  /** Input provided to the tool */
  input: unknown
  /** Result from tool execution (undefined if pending/failed) */
  result?: unknown
  /** Error message if tool failed */
  error?: string
  /** Status of the invocation */
  status: "pending" | "success" | "error"
}

// ─── Union Type ─────────────────────────────────────────────────────────────

/**
 * SessionEntry — discriminated union of all entry types.
 * Replaces the old Message type with a domain-centric model.
 */
export type SessionEntry =
  | UserInput
  | AgentResponse
  | SystemInstruction
  | KnowledgeReference
  | ToolInvocation

// ─── Type Guards ────────────────────────────────────────────────────────────

export function isConversationEntry(
  entry: SessionEntry
): entry is UserInput | AgentResponse {
  return entry.kind === "user_input" || entry.kind === "agent_response"
}

export function isContextEntry(
  entry: SessionEntry
): entry is SystemInstruction | KnowledgeReference {
  return entry.kind === "system_instruction" || entry.kind === "knowledge_reference"
}

export function isActionEntry(entry: SessionEntry): entry is ToolInvocation {
  return entry.kind === "tool_invocation"
}

// ─── Legacy Compatibility ───────────────────────────────────────────────────

/**
 * @deprecated Use EntryKind instead. This maps old MessageType to new EntryKind.
 */
export type MessageType =
  | "user"
  | "assistant"
  | "system"
  | "knowledge"
  | "code"
  | "tool_use"
  | "tool_result"

/**
 * @deprecated Use SessionEntry instead.
 */
export type Message = SessionEntry

/**
 * Map legacy MessageType to new EntryKind.
 * Note: tool_use and tool_result both map to tool_invocation.
 * Note: code maps to knowledge_reference (file content is knowledge).
 */
export function messageTypeToEntryKind(type: MessageType): EntryKind {
  const mapping: Record<MessageType, EntryKind> = {
    user: "user_input",
    assistant: "agent_response",
    system: "system_instruction",
    knowledge: "knowledge_reference",
    code: "knowledge_reference",
    tool_use: "tool_invocation",
    tool_result: "tool_invocation",
  }
  return mapping[type]
}
