/**
 * ConversationService — Orchestrates the chat flow.
 *
 * Responsibilities:
 * 1. Manage session lifecycle (create, load)
 * 2. Process user input → embed → store
 * 3. Assemble context within token budget
 * 4. Call provider for completion (streaming)
 * 5. Store assistant response
 */

import type { Session, Message, MessageType } from "@/domain/session.ts"
import type { Provider, StreamChunk } from "@/domain/provider.ts"
import type { Context, ContextAssemblyOptions } from "@/domain/context.ts"
import type { Embedding } from "@/domain/shared.ts"
import type { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import type { Embedder } from "@/infrastructure/embedding/types.ts"
import { ContextAssembler } from "@/infrastructure/context/index.ts"

/**
 * Configuration for the conversation service.
 */
export interface ConversationServiceConfig {
  /** The LLM provider to use */
  provider: Provider

  /** The project storage for persistence */
  storage: ProjectStorage

  /** The embedder for creating message embeddings */
  embedder: Embedder

  /** System prompt for the conversation */
  systemPrompt?: string

  /** Maximum context tokens (defaults to provider's max) */
  maxContextTokens?: number

  /** Tokens to reserve for response (default: 1024) */
  responseReserve?: number
}

/**
 * Event emitted during conversation processing.
 */
export type ConversationEvent =
  | { type: "user_message"; message: Message }
  | { type: "context_assembled"; context: Context }
  | { type: "stream_start" }
  | { type: "stream_chunk"; content: string }
  | { type: "stream_end"; usage?: StreamChunk["usage"] }
  | { type: "assistant_message"; message: Message }
  | { type: "error"; error: Error }

/**
 * ConversationService — The main orchestrator for chat interactions.
 */
export class ConversationService {
  private provider: Provider
  private storage: ProjectStorage
  private embedder: Embedder
  private assembler: ContextAssembler
  private systemPrompt: string
  private maxContextTokens: number
  private responseReserve: number

  private session: Session | null = null
  private messages: Message[] = []

  constructor(config: ConversationServiceConfig) {
    this.provider = config.provider
    this.storage = config.storage
    this.embedder = config.embedder
    this.assembler = new ContextAssembler()
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant."
    this.maxContextTokens =
      config.maxContextTokens ?? config.provider.info.capabilities.maxContextTokens
    this.responseReserve = config.responseReserve ?? 1024
  }

  /**
   * Get the current session, if any.
   */
  get currentSession(): Session | null {
    return this.session
  }

  /**
   * Get provider info for display purposes.
   */
  get providerInfo(): Provider["info"] {
    return this.provider.info
  }

  /**
   * Get the current messages in the session.
   */
  get currentMessages(): readonly Message[] {
    return this.messages
  }

  /**
   * Start a new conversation session.
   */
  async startSession(title?: string): Promise<Session> {
    const sessionTitle = title ?? `Chat ${new Date().toLocaleString()}`
    this.session = await this.storage.createSession(sessionTitle, {
      provider: this.provider.info.id,
      model: this.provider.info.model,
    })
    this.messages = []
    return this.session
  }

  /**
   * Load an existing session.
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const session = await this.storage.getSession(sessionId)
    if (!session) return null

    this.session = session
    this.messages = await this.storage.getMessages(sessionId)
    return session
  }

  /**
   * Send a user message and get a streaming response.
   * Yields ConversationEvents as processing progresses.
   */
  async *chat(userInput: string): AsyncIterable<ConversationEvent> {
    if (!this.session) {
      await this.startSession()
    }

    try {
      // 1. Process user input
      const userMessage = await this.addMessage("user", userInput)
      yield { type: "user_message", message: userMessage }

      // 2. Assemble context
      const context = this.assembleContext()
      yield { type: "context_assembled", context }

      // 3. Stream completion
      yield { type: "stream_start" }

      let fullContent = ""
      let usage: StreamChunk["usage"] | undefined

      for await (const chunk of this.provider.complete(context)) {
        if (chunk.content) {
          fullContent += chunk.content
          yield { type: "stream_chunk", content: chunk.content }
        }
        if (chunk.done && chunk.usage) {
          usage = chunk.usage
        }
      }

      yield { type: "stream_end", usage }

      // 4. Store assistant response
      if (fullContent) {
        const assistantMessage = await this.addMessage("assistant", fullContent)
        yield { type: "assistant_message", message: assistantMessage }
      }
    } catch (error) {
      yield { type: "error", error: error as Error }
    }
  }

  /**
   * Add a message to the current session.
   */
  private async addMessage(type: MessageType, content: string): Promise<Message> {
    if (!this.session) {
      throw new Error("No active session")
    }

    // Compute embedding and token count
    const embedding = await this.embedder.embed(content)
    const tokens = await this.countTokens(content)

    // Store in database
    const message = await this.storage.addMessage(
      this.session.id,
      type,
      content,
      embedding,
      tokens
    )

    // Update local cache
    this.messages.push(message)

    return message
  }

  /**
   * Assemble context from current messages.
   */
  private assembleContext(): Context {
    const options: ContextAssemblyOptions = {
      maxTokens: this.maxContextTokens,
      systemPrompt: this.systemPrompt,
      reservations: {
        response: this.responseReserve,
      },
    }

    return this.assembler.assemble(this.messages, options)
  }

  /**
   * Estimate token count for text.
   * Uses provider's tokenizer if available, otherwise rough estimate.
   */
  private async countTokens(text: string): Promise<number> {
    try {
      return await this.provider.countTokens(text)
    } catch {
      // Fallback: ~4 chars per token
      return Math.ceil(text.length / 4)
    }
  }
}

/**
 * Create a conversation service with the given configuration.
 */
export function createConversationService(
  config: ConversationServiceConfig
): ConversationService {
  return new ConversationService(config)
}
