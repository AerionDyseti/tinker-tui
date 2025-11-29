import type { Embedding } from "./shared.ts"

// ============================================================================
// Session Artifact — discrete units of data that comprise a session
// ============================================================================

/**
 * Artifact kind — discriminator for the SessionArtifact union.
 */
export type ArtifactKind =
  // Conversation
  | "user_input"
  | "agent_response"
  // Context
  | "system_instruction"
  | "knowledge_reference"
  // Actions
  | "tool_use"
  | "tool_result"

/**
 * How an agent response completed.
 */
export type CompletionStatus = "complete" | "token_limit" | "user_interrupted"

/**
 * Base properties shared by all session artifacts.
 */
interface ArtifactBase {
  id: string
  sessionId: string
  kind: ArtifactKind
  timestamp: Date
  /** Token count for context budgeting */
  tokens: number
  /** Embedding for semantic search */
  embedding: Embedding
  /** User can pin important artifacts */
  pinned?: boolean
}

// ─── Conversation Artifacts ─────────────────────────────────────────────────

/**
 * User input — what the human said/asked.
 */
export interface UserInput extends ArtifactBase {
  kind: "user_input"
  content: string
}

/**
 * Agent response — what the LLM/agent produced.
 */
export interface AgentResponse extends ArtifactBase {
  kind: "agent_response"
  content: string
  /** Provider that served this response (e.g., "anthropic", "openrouter") */
  provider: string
  /** Model that generated this response */
  model: string
  /** How the response completed */
  status: CompletionStatus
}

// ─── Context Artifacts ──────────────────────────────────────────────────────

/**
 * System instruction — behavioral guidance for the LLM.
 */
export interface SystemInstruction extends ArtifactBase {
  kind: "system_instruction"
  content: string
  /** Priority for context assembly (higher = more important) */
  priority?: number
}

/**
 * Knowledge reference — a block of contextual content.
 * Produced by RAG, file reads, or other knowledge sources.
 */
export interface KnowledgeReference extends ArtifactBase {
  kind: "knowledge_reference"
  content: string
}

// ─── Action Artifacts ───────────────────────────────────────────────────────

/**
 * Tool use — agent's request to invoke a tool.
 * Immutable once created; result comes as separate ToolResult artifact.
 */
export interface ToolUse extends ArtifactBase {
  kind: "tool_use"
  /** Unique ID for this tool use (used to link with ToolResult) */
  toolUseId: string
  /** Tool identifier */
  toolId: string
  /** Human-readable tool name */
  toolName: string
  /** Input provided to the tool */
  input: unknown
}

/**
 * Tool result — the outcome of a tool invocation.
 * Links back to the ToolUse that triggered it.
 */
export interface ToolResult extends ArtifactBase {
  kind: "tool_result"
  /** Links to the ToolUse.toolUseId this result is for */
  toolUseId: string
  /** Result from tool execution */
  result: unknown
  /** Whether the tool failed */
  isError: boolean
}

// ─── Union Type ─────────────────────────────────────────────────────────────

/**
 * SessionArtifact — discriminated union of all artifact types.
 * Represents discrete units of data that comprise a session.
 */
export type SessionArtifact =
  | UserInput
  | AgentResponse
  | SystemInstruction
  | KnowledgeReference
  | ToolUse
  | ToolResult

// ─── Type Guards ────────────────────────────────────────────────────────────

export function isConversationArtifact(
  artifact: SessionArtifact
): artifact is UserInput | AgentResponse {
  return artifact.kind === "user_input" || artifact.kind === "agent_response"
}

export function isContextArtifact(
  artifact: SessionArtifact
): artifact is SystemInstruction | KnowledgeReference {
  return artifact.kind === "system_instruction" || artifact.kind === "knowledge_reference"
}

export function isActionArtifact(
  artifact: SessionArtifact
): artifact is ToolUse | ToolResult {
  return artifact.kind === "tool_use" || artifact.kind === "tool_result"
}
