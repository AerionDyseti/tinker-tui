/**
 * OpenAI-compatible message format.
 * Used by OpenRouter and other OpenAI-compatible APIs.
 */
export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  name?: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

/**
 * OpenAI tool call format.
 */
export interface OpenAIToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string // JSON string
  }
}

/**
 * OpenAI tool definition format.
 */
export interface OpenAITool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

/**
 * OpenAI chat completion request.
 */
export interface OpenAIChatRequest {
  model: string
  messages: OpenAIMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  tools?: OpenAITool[]
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } }
}

/**
 * OpenAI streaming chunk (SSE data).
 */
export interface OpenAIStreamChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: "function"
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * OpenRouter-specific configuration.
 */
export interface OpenRouterConfig {
  apiKey: string
  model: string
  baseUrl?: string
  siteUrl?: string // For HTTP-Referer header
  siteName?: string // For X-Title header
}
