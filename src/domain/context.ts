import type { SessionEntry } from "./session.ts"
import type { Knowledge } from "./knowledge.ts"

// Legacy alias
type Message = SessionEntry

/**
 * Maximum token reservations for different context slots.
 *
 * These are CEILINGS, not fixed allocations. If a slot uses fewer
 * tokens than reserved, the remainder becomes available for messages.
 *
 * Example: If you reserve 500 for system but only use 300,
 * those 200 tokens are available for conversation history.
 */
export interface TokenReservations {
  /** Max tokens for system prompt, persona, rules */
  readonly system: number
  /** Max tokens for tool/function definitions (MCP tools) */
  readonly tools: number
  /** Max tokens for MCP resources, external content */
  readonly resources: number
  /** Max tokens for RAG-retrieved knowledge */
  readonly knowledge: number
  /** Max tokens for compressed older history */
  readonly summary: number
  /** Reserved for model output (this one IS fixed) */
  readonly response: number
}

/**
 * TokenBudget — value object for managing context window allocation.
 * Immutable; all operations return new instances.
 */
export interface TokenBudget {
  readonly total: number
  readonly used: number
  readonly reserved: TokenReservations

  /** Available tokens after accounting for used and reserved */
  readonly available: number
}

/**
 * Create a new TokenBudget with computed available.
 */
export function createTokenBudget(params: {
  total: number
  used?: number
  reserved?: Partial<TokenReservations>
}): TokenBudget {
  const used = params.used ?? 0
  const reserved: TokenReservations = {
    system: params.reserved?.system ?? 0,
    tools: params.reserved?.tools ?? 0,
    resources: params.reserved?.resources ?? 0,
    knowledge: params.reserved?.knowledge ?? 0,
    summary: params.reserved?.summary ?? 0,
    response: params.reserved?.response ?? 0,
  }

  const totalReserved =
    reserved.system +
    reserved.tools +
    reserved.resources +
    reserved.knowledge +
    reserved.summary +
    reserved.response

  const available = params.total - used - totalReserved

  return {
    total: params.total,
    used,
    reserved,
    available: Math.max(0, available),
  }
}

/**
 * Consume tokens from a budget, returning a new budget.
 */
export function consumeTokens(budget: TokenBudget, tokens: number): TokenBudget {
  return createTokenBudget({
    total: budget.total,
    used: budget.used + tokens,
    reserved: budget.reserved,
  })
}

/**
 * Priority levels for context items.
 */
export type ContextPriority = "critical" | "high" | "medium" | "low"

/**
 * Context item types — what kind of content this is.
 */
export type ContextItemType =
  | "message"   // Conversation message
  | "knowledge" // RAG-retrieved fact
  | "system"    // System prompt/instruction
  | "tool"      // Tool definition
  | "resource"  // MCP resource
  | "summary"   // Compressed history

/**
 * A weighted item that can be included in context.
 */
export interface ContextItem {
  id: string
  type: ContextItemType
  content: string
  tokens: number
  priority: ContextPriority
  relevanceScore?: number // From RAG similarity search

  // Source reference
  source:
    | { type: "message"; entry: SessionEntry }
    | { type: "knowledge"; knowledge: Knowledge }
    | { type: "system"; name: string }
    | { type: "tool"; name: string; schema: Record<string, unknown> }
    | { type: "resource"; uri: string; mimeType?: string }
    | { type: "summary"; messageCount: number; startDate: Date; endDate: Date }
}

/**
 * Strategy for filtering entries before RAG.
 * Different strategies can prioritize recency, pinned entries, etc.
 */
export interface FilterStrategy {
  name: string
  description: string

  /**
   * Filter and prioritize entries.
   * Returns entries that should be considered for context.
   */
  filter(entries: SessionEntry[], budget: TokenBudget): SessionEntry[]
}

/**
 * Strategy for RAG-based context retrieval.
 */
export interface RAGStrategy {
  name: string
  description: string

  /**
   * Retrieve relevant knowledge based on the query.
   * Should respect the token budget.
   */
  retrieve(
    query: string,
    knowledge: Knowledge[],
    budget: TokenBudget
  ): Promise<Knowledge[]>
}

/**
 * The assembled context ready for sending to a provider.
 */
export interface Context {
  /** System prompt (if any) */
  systemPrompt?: string

  /** Ordered list of context items */
  items: ContextItem[]

  /** Token budget state after assembly */
  budget: TokenBudget

  /** Metadata about context assembly */
  metadata: {
    messagesIncluded: number
    messagesFiltered: number
    knowledgeIncluded: number
    assembledAt: Date
  }
}

/**
 * Options for context assembly.
 */
export interface ContextAssemblyOptions {
  /** Maximum tokens for the context window */
  maxTokens: number

  /** Token reservations for each slot */
  reservations?: Partial<TokenReservations>

  /** System prompt to include */
  systemPrompt?: string

  /** Filter strategy to use */
  filterStrategy?: FilterStrategy

  /** RAG strategy to use */
  ragStrategy?: RAGStrategy

  /** Whether to include pinned messages regardless of relevance */
  alwaysIncludePinned?: boolean
}
