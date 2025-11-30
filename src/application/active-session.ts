/**
 * ActiveSession — Orchestrates a live dialogue session.
 *
 * Responsibilities:
 * 1. Manage session lifecycle (create, load)
 * 2. Process user input → embed → store
 * 3. Assemble context within token budget
 * 4. Call provider for completion (streaming)
 * 5. Store agent response
 */

import type {
  Session,
  SessionArtifact,
  ArtifactKind,
  UserInput,
  AgentResponse,
} from "@/domain/session.ts"
import type { Provider, StreamChunk } from "@/domain/provider.ts"
import type { Context, ContextAssemblyOptions } from "@/domain/context.ts"
import type { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import type { Embedder } from "@/infrastructure/embedding/types.ts"
import { ContextAssembler } from "@/infrastructure/context/index.ts"

/**
 * Configuration for an active session.
 */
export interface ActiveSessionConfig {
  /** The project ID for session association */
  projectId: string

  /** The LLM provider to use */
  provider: Provider

  /** The project storage for persistence */
  storage: ProjectStorage

  /** The embedder for creating artifact embeddings */
  embedder: Embedder

  /** System prompt for the conversation */
  systemPrompt?: string

  /** Maximum context tokens (defaults to provider's max) */
  maxContextTokens?: number

  /** Tokens to reserve for response (default: 1024) */
  responseReserve?: number
}

/**
 * Events emitted during session processing.
 */
export type SessionEvent =
  | { type: "user_input"; artifact: UserInput }
  | { type: "context_assembled"; context: Context }
  | { type: "stream_start" }
  | { type: "stream_chunk"; content: string }
  | { type: "stream_end"; usage?: StreamChunk["usage"] }
  | { type: "agent_response"; artifact: AgentResponse }
  | { type: "error"; error: Error }

/**
 * ActiveSession — The runtime wrapper around a persisted Session.
 * Manages the live dialogue flow with streaming and context assembly.
 */
export class ActiveSession {
  private projectId: string
  private provider: Provider
  private storage: ProjectStorage
  private embedder: Embedder
  private assembler: ContextAssembler
  private systemPrompt: string
  private maxContextTokens: number
  private responseReserve: number

  private session: Session | null = null
  private artifacts: SessionArtifact[] = []

  constructor(config: ActiveSessionConfig) {
    this.projectId = config.projectId
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
   * Get the underlying session, if any.
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
   * Get the current artifacts in the session.
   */
  get currentArtifacts(): readonly SessionArtifact[] {
    return this.artifacts
  }

  /**
   * Start a new session.
   */
  async start(title?: string): Promise<Session> {
    const sessionTitle = title ?? `Chat ${new Date().toLocaleString()}`
    this.session = await this.storage.createSession(this.projectId, sessionTitle, {
      provider: this.provider.info.id,
      model: this.provider.info.model,
    })
    this.artifacts = []
    return this.session
  }

  /**
   * Load an existing session.
   */
  async load(sessionId: string): Promise<Session | null> {
    const session = await this.storage.getSession(sessionId)
    if (!session) return null

    this.session = session
    this.artifacts = await this.storage.getArtifacts(sessionId)
    return session
  }

  /**
   * Send user input and get a streaming response.
   * Yields SessionEvents as processing progresses.
   */
  async *send(userInput: string): AsyncIterable<SessionEvent> {
    if (!this.session) {
      await this.start()
    }

    try {
      // 1. Process user input
      const userArtifact = await this.addUserInput(userInput)
      yield { type: "user_input", artifact: userArtifact }

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

      // 4. Store agent response
      if (fullContent) {
        const agentArtifact = await this.addAgentResponse(fullContent, "complete")
        yield { type: "agent_response", artifact: agentArtifact }
      }
    } catch (error) {
      yield { type: "error", error: error as Error }
    }
  }

  /**
   * Add a user input artifact.
   */
  private async addUserInput(content: string): Promise<UserInput> {
    if (!this.session) {
      throw new Error("No active session")
    }

    const embedding = await this.embedder.embed(content)
    const tokens = await this.countTokens(content)

    const artifact = await this.storage.addArtifact<UserInput>(this.session.id, {
      kind: "user_input",
      content,
      embedding,
      tokens,
    })

    this.artifacts.push(artifact)
    return artifact as UserInput
  }

  /**
   * Add an agent response artifact.
   */
  private async addAgentResponse(
    content: string,
    status: "complete" | "token_limit" | "user_interrupted"
  ): Promise<AgentResponse> {
    if (!this.session) {
      throw new Error("No active session")
    }

    const embedding = await this.embedder.embed(content)
    const tokens = await this.countTokens(content)

    const artifact = await this.storage.addArtifact<AgentResponse>(this.session.id, {
      kind: "agent_response",
      content,
      provider: this.provider.info.id,
      model: this.provider.info.model,
      status,
      embedding,
      tokens,
    })

    this.artifacts.push(artifact)
    return artifact as AgentResponse
  }

  /**
   * Assemble context from current artifacts.
   */
  private assembleContext(): Context {
    const options: ContextAssemblyOptions = {
      maxTokens: this.maxContextTokens,
      systemPrompt: this.systemPrompt,
      reservations: {
        response: this.responseReserve,
      },
    }

    return this.assembler.assemble(this.artifacts, options)
  }

  /**
   * Estimate token count for text.
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
 * Create an active session with the given configuration.
 */
export function createActiveSession(config: ActiveSessionConfig): ActiveSession {
  return new ActiveSession(config)
}
