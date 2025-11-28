import type {
  Provider,
  ProviderInfo,
  CompletionOptions,
  StreamChunk,
  ToolDefinition,
} from "@/domain/provider.ts"
import type { MessageType } from "@/domain/session.ts"
import type { Context, ContextItem } from "@/domain/context.ts"
import type {
  OpenAIMessage,
  OpenAIChatRequest,
  OpenAIStreamChunk,
  OpenAITool,
  OpenRouterConfig,
} from "./types.ts"

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

/**
 * Model capability presets for common models.
 * OpenRouter supports many models; these are reasonable defaults.
 */
const MODEL_CAPABILITIES: Record<
  string,
  { maxContext: number; maxOutput: number; tools: boolean; vision: boolean }
> = {
  // Free models
  "google/gemma-3-1b-it:free": { maxContext: 32000, maxOutput: 8192, tools: false, vision: false },
  "meta-llama/llama-3.2-3b-instruct:free": { maxContext: 131000, maxOutput: 8192, tools: false, vision: false },
  "mistralai/mistral-7b-instruct:free": { maxContext: 32000, maxOutput: 8192, tools: false, vision: false },
  "qwen/qwen3-14b:free": { maxContext: 40000, maxOutput: 8192, tools: false, vision: false },
  // Paid models (common ones)
  "anthropic/claude-3.5-sonnet": { maxContext: 200000, maxOutput: 8192, tools: true, vision: true },
  "openai/gpt-4o": { maxContext: 128000, maxOutput: 16384, tools: true, vision: true },
  "openai/gpt-4o-mini": { maxContext: 128000, maxOutput: 16384, tools: true, vision: true },
}

const DEFAULT_CAPABILITIES = { maxContext: 32000, maxOutput: 4096, tools: false, vision: false }

/**
 * OpenRouter provider implementation.
 * Uses OpenAI-compatible API to access various models.
 */
export class OpenRouterProvider implements Provider {
  readonly info: ProviderInfo

  private config: OpenRouterConfig
  private baseUrl: string

  constructor(config: OpenRouterConfig) {
    this.config = config
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL

    const caps = MODEL_CAPABILITIES[config.model] ?? DEFAULT_CAPABILITIES

    this.info = {
      id: `openrouter:${config.model}`,
      name: `OpenRouter (${config.model})`,
      model: config.model,
      capabilities: {
        streaming: true,
        tools: caps.tools,
        vision: caps.vision,
        systemPrompt: true,
        maxContextTokens: caps.maxContext,
        maxOutputTokens: caps.maxOutput,
      },
    }
  }

  /**
   * Stream a completion response.
   */
  async *complete(
    context: Context,
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk> {
    const messages = this.contextToMessages(context)
    const tools = options?.tools ? this.toolsToOpenAI(options.tools) : undefined

    const request: OpenAIChatRequest = {
      model: this.config.model,
      messages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.info.capabilities.maxOutputTokens,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop: options?.stopSequences,
      tools: tools?.length ? tools : undefined,
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": this.config.siteUrl ?? "https://github.com/tinker-tui",
        "X-Title": this.config.siteName ?? "tinker-tui",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error (${response.status}): ${error}`)
    }

    if (!response.body) {
      throw new Error("No response body from OpenRouter")
    }

    // Parse SSE stream
    yield* this.parseSSEStream(response.body)
  }

  /**
   * Estimate token count for a string.
   * Uses a simple heuristic: ~4 chars per token for English text.
   * For accurate counts, we'd need a tokenizer specific to each model.
   */
  async countTokens(text: string): Promise<number> {
    // Simple heuristic: ~4 characters per token on average
    // This is a rough estimate; actual tokenization varies by model
    return Math.ceil(text.length / 4)
  }

  /**
   * Translate domain MessageType to OpenAI role.
   */
  translateMessageType(type: MessageType): string {
    switch (type) {
      case "user":
        return "user"
      case "assistant":
        return "assistant"
      case "system":
        return "system"
      case "knowledge":
        // Knowledge gets injected as system context
        return "system"
      case "code":
        // Code snippets go as user context
        return "user"
      case "tool_use":
        return "assistant"
      case "tool_result":
        return "tool"
      default:
        return "user"
    }
  }

  /**
   * Convert our Context to OpenAI message format.
   */
  private contextToMessages(context: Context): OpenAIMessage[] {
    const messages: OpenAIMessage[] = []

    // Add system prompt if present
    if (context.systemPrompt) {
      messages.push({
        role: "system",
        content: context.systemPrompt,
      })
    }

    // Convert context items to messages
    for (const item of context.items) {
      const message = this.contextItemToMessage(item)
      if (message) {
        messages.push(message)
      }
    }

    return messages
  }

  /**
   * Convert a single ContextItem to an OpenAI message.
   */
  private contextItemToMessage(item: ContextItem): OpenAIMessage | null {
    switch (item.source.type) {
      case "message": {
        const msg = item.source.message
        const role = this.translateMessageType(msg.type) as OpenAIMessage["role"]

        // Handle tool_use messages specially
        if (msg.type === "tool_use" && msg.metadata?.toolId) {
          return {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: msg.metadata.toolId,
                type: "function",
                function: {
                  name: msg.metadata.toolName as string,
                  arguments: JSON.stringify(msg.metadata.toolInput),
                },
              },
            ],
          }
        }

        // Handle tool_result messages
        if (msg.type === "tool_result" && msg.metadata?.toolId) {
          return {
            role: "tool",
            content: typeof msg.metadata.toolOutput === "string"
              ? msg.metadata.toolOutput
              : JSON.stringify(msg.metadata.toolOutput),
            tool_call_id: msg.metadata.toolId,
          }
        }

        return {
          role,
          content: item.content,
        }
      }

      case "knowledge": {
        // Knowledge items are injected as system context
        return {
          role: "system",
          content: `[Knowledge] ${item.content}`,
        }
      }

      case "system": {
        return {
          role: "system",
          content: item.content,
        }
      }

      default:
        return null
    }
  }

  /**
   * Convert our ToolDefinition to OpenAI tool format.
   */
  private toolsToOpenAI(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  /**
   * Parse Server-Sent Events stream from OpenRouter.
   */
  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>
  ): AsyncIterable<StreamChunk> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    // Track accumulated tool calls across chunks
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? "" // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue

          const data = line.slice(6).trim()
          if (data === "[DONE]") {
            // Final chunk
            yield { content: "", done: true }
            return
          }

          try {
            const chunk: OpenAIStreamChunk = JSON.parse(data)
            const choice = chunk.choices[0]

            if (!choice) continue

            // Handle content delta
            const content = choice.delta.content ?? ""

            // Handle tool call deltas
            if (choice.delta.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const existing = toolCalls.get(tc.index) ?? { id: "", name: "", arguments: "" }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) existing.arguments += tc.function.arguments
                toolCalls.set(tc.index, existing)
              }
            }

            // Check if we're done
            if (choice.finish_reason) {
              // If we have tool calls, emit them
              if (toolCalls.size > 0) {
                for (const [, tc] of toolCalls) {
                  yield {
                    content: "",
                    done: false,
                    toolUse: {
                      id: tc.id,
                      name: tc.name,
                      input: JSON.parse(tc.arguments || "{}"),
                    },
                  }
                }
              }

              // Emit final chunk with usage if available
              yield {
                content,
                done: true,
                usage: chunk.usage
                  ? {
                      promptTokens: chunk.usage.prompt_tokens,
                      completionTokens: chunk.usage.completion_tokens,
                      totalTokens: chunk.usage.total_tokens,
                    }
                  : undefined,
              }
              return
            }

            // Emit content chunk
            if (content) {
              yield { content, done: false }
            }
          } catch {
            // Skip malformed JSON
            continue
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

/**
 * Create an OpenRouter provider from config.
 */
export function createOpenRouterProvider(config: OpenRouterConfig): OpenRouterProvider {
  return new OpenRouterProvider(config)
}
