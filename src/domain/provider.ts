import type { Context } from "./context.ts"
import type { EntryKind } from "./session.ts"

/**
 * A message in provider-neutral format.
 * Infrastructure layer translates to/from provider-specific formats.
 * @deprecated Use SessionEntry types directly
 */
export interface ProviderMessage {
  kind: EntryKind
  content: string
  metadata?: {
    toolId?: string
    toolName?: string
    toolInput?: unknown
    toolOutput?: unknown
    [key: string]: unknown
  }
}

/**
 * A chunk of streamed response.
 */
export interface StreamChunk {
  /** The text content of this chunk */
  content: string

  /** Whether this is the final chunk */
  done: boolean

  /** Token usage (only present on final chunk) */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }

  /** Tool use request (if the model wants to use a tool) */
  toolUse?: {
    id: string
    name: string
    input: unknown
  }
}

/**
 * Completion request options.
 */
export interface CompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number

  /** Temperature for sampling (0-2) */
  temperature?: number

  /** Top-p sampling */
  topP?: number

  /** Stop sequences */
  stopSequences?: string[]

  /** Available tools */
  tools?: ToolDefinition[]
}

/**
 * A tool that the LLM can use.
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown> // JSON Schema
}

/**
 * Result of executing a tool.
 */
export interface ToolResult {
  toolId: string
  output: unknown
  isError?: boolean
}

/**
 * Provider capability flags.
 */
export interface ProviderCapabilities {
  /** Supports streaming responses */
  streaming: boolean

  /** Supports tool/function calling */
  tools: boolean

  /** Supports vision/image input */
  vision: boolean

  /** Supports system prompts */
  systemPrompt: boolean

  /** Maximum context window size */
  maxContextTokens: number

  /** Maximum output tokens */
  maxOutputTokens: number
}

/**
 * Provider metadata.
 */
export interface ProviderInfo {
  id: string
  name: string
  model: string
  capabilities: ProviderCapabilities
}

/**
 * The core provider interface.
 * All LLM providers must implement this.
 */
export interface Provider {
  /** Provider information */
  readonly info: ProviderInfo

  /**
   * Stream a completion response.
   * Returns an async iterator of chunks.
   */
  complete(
    context: Context,
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk>

  /**
   * Count tokens in a string.
   * Used for budget management.
   */
  countTokens(text: string): Promise<number>

  /**
   * Translate domain entry kinds to provider-specific roles.
   * This is where the EntryKind → role mapping happens.
   */
  translateEntryKind(kind: EntryKind): string
}

/**
 * Factory for creating provider instances.
 */
export interface ProviderFactory {
  /**
   * Create a provider from configuration.
   */
  create(config: ProviderConfig): Provider
}

/**
 * Runtime environment for local LLM providers.
 */
export type LocalRuntime = "ollama" | "lmstudio" | "llamacpp" | "other"

/**
 * Provider configuration — discriminated union for type safety.
 */
export type ProviderConfig =
  | {
      type: "claude-code"
      model: string
    }
  | {
      type: "openrouter"
      model: string
      apiKey: string
      baseUrl?: string
    }
  | {
      type: "local"
      model: string
      baseUrl: string
      runtime: LocalRuntime
    }
