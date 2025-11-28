import type { Message } from "./session.ts"
import type { Knowledge } from "./knowledge.ts"

/**
 * TokenBudget — value object for managing context window allocation.
 * Immutable; all operations return new instances.
 */
export interface TokenBudget {
  readonly total: number
  readonly used: number
  readonly reserved: {
    readonly system: number // System prompt reservation
    readonly response: number // Space for LLM response
  }

  /** Available tokens after accounting for used and reserved */
  readonly available: number
}

/**
 * Create a new TokenBudget with computed available.
 */
export function createTokenBudget(params: {
  total: number
  used?: number
  reserved?: { system?: number; response?: number }
}): TokenBudget {
  const used = params.used ?? 0
  const reserved = {
    system: params.reserved?.system ?? 0,
    response: params.reserved?.response ?? 0,
  }
  const available = params.total - used - reserved.system - reserved.response

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
 * A weighted item that can be included in context.
 */
export interface ContextItem {
  id: string
  type: "message" | "knowledge" | "system"
  content: string
  tokens: number
  priority: ContextPriority
  relevanceScore?: number // From RAG similarity search

  // Source reference
  source:
    | { type: "message"; message: Message }
    | { type: "knowledge"; knowledge: Knowledge }
    | { type: "system"; name: string }
}

/**
 * Strategy for filtering messages before RAG.
 * Different strategies can prioritize recency, pinned messages, etc.
 */
export interface FilterStrategy {
  name: string
  description: string

  /**
   * Filter and prioritize messages.
   * Returns messages that should be considered for context.
   */
  filter(messages: Message[], budget: TokenBudget): Message[]
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

  /** Tokens to reserve for the response */
  responseReserve?: number

  /** System prompt to include */
  systemPrompt?: string

  /** Filter strategy to use */
  filterStrategy?: FilterStrategy

  /** RAG strategy to use */
  ragStrategy?: RAGStrategy

  /** Whether to include pinned messages regardless of relevance */
  alwaysIncludePinned?: boolean
}
