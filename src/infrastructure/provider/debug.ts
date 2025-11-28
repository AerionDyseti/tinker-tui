import type {
  Provider,
  ProviderInfo,
  CompletionOptions,
  StreamChunk,
} from "@/domain/provider.ts"
import type { MessageType } from "@/domain/session.ts"
import type { Context } from "@/domain/context.ts"

const DEFAULT_PORT = 7331
const DEFAULT_HOST = "localhost"

/**
 * Configuration for the debug provider.
 */
export interface DebugProviderConfig {
  host?: string
  port?: number
}

/**
 * Debug provider — sends context to a debug server for manual response.
 *
 * Use this for testing context assembly without calling a real LLM.
 * Run the debug server in a separate terminal:
 *   bun run src/tools/debug-server.ts
 */
export class DebugProvider implements Provider {
  readonly info: ProviderInfo

  private baseUrl: string

  constructor(config: DebugProviderConfig = {}) {
    const host = config.host ?? DEFAULT_HOST
    const port = config.port ?? DEFAULT_PORT
    this.baseUrl = `http://${host}:${port}`

    this.info = {
      id: "debug",
      name: "Debug Provider",
      model: "human",
      capabilities: {
        streaming: false, // Simple request/response for now
        tools: false,
        vision: false,
        systemPrompt: true,
        maxContextTokens: 100000, // No real limit
        maxOutputTokens: 100000,
      },
    }
  }

  /**
   * Send context to debug server and yield the response.
   */
  async *complete(
    context: Context,
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk> {
    // Check if server is available
    try {
      const health = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (!health.ok) {
        throw new Error("Debug server not responding")
      }
    } catch {
      throw new Error(
        `Debug server not available at ${this.baseUrl}. ` +
        `Run: bun run src/tools/debug-server.ts`
      )
    }

    // Send context to debug server
    const response = await fetch(`${this.baseUrl}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt: context.systemPrompt,
        items: context.items.map((item) => ({
          type: item.type,
          content: item.content,
          tokens: item.tokens,
          priority: item.priority,
          source: item.source,
        })),
        budget: {
          total: context.budget.total,
          used: context.budget.used,
          available: context.budget.available,
          reserved: context.budget.reserved,
        },
        options: {
          maxTokens: options?.maxTokens,
          temperature: options?.temperature,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Debug server error: ${error}`)
    }

    const result = await response.json() as {
      content: string
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }

    // Yield the response as a single chunk
    yield {
      content: result.content,
      done: true,
      usage: result.usage,
    }
  }

  /**
   * Simple token estimation.
   */
  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4)
  }

  /**
   * Translate message types to roles.
   */
  translateMessageType(type: MessageType): string {
    return type // Just pass through for debug
  }
}

/**
 * Create a debug provider instance.
 */
export function createDebugProvider(config?: DebugProviderConfig): DebugProvider {
  return new DebugProvider(config)
}
