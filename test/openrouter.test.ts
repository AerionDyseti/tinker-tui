import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test"
import { OpenRouterProvider } from "@/infrastructure/provider/index.ts"
import type { Context, ContextItem } from "@/domain/context.ts"
import { createTokenBudget } from "@/domain/context.ts"
import type { Message } from "@/domain/session.ts"
import type { Embedding } from "@/domain/shared.ts"

// Helper to create a mock embedding
function mockEmbedding(): Embedding {
  return {
    vector: Array(384).fill(0),
    model: "test",
    dimensions: 384,
    createdAt: new Date(),
  }
}

// Helper to create a mock message
function mockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    sessionId: "session-1",
    type: "user",
    content: "Hello",
    tokens: 10,
    embedding: mockEmbedding(),
    timestamp: new Date(),
    ...overrides,
  }
}

// Helper to create a mock context item from a message
function messageToContextItem(msg: Message): ContextItem {
  return {
    id: msg.id,
    type: "message",
    content: msg.content,
    tokens: msg.tokens,
    priority: "medium",
    source: { type: "message", message: msg },
  }
}

// Helper to create a minimal context
function mockContext(items: ContextItem[] = [], systemPrompt?: string): Context {
  return {
    systemPrompt,
    items,
    budget: createTokenBudget({ total: 4096 }),
    metadata: {
      messagesIncluded: items.length,
      messagesFiltered: 0,
      knowledgeIncluded: 0,
      assembledAt: new Date(),
    },
  }
}

// Mock SSE response helper
function createSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  })
}

describe("OpenRouterProvider", () => {
  let provider: OpenRouterProvider
  let originalFetch: typeof fetch

  beforeEach(() => {
    provider = new OpenRouterProvider({
      apiKey: "test-api-key",
      model: "meta-llama/llama-3.2-3b-instruct:free",
    })
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("info", () => {
    test("has correct provider info", () => {
      expect(provider.info.id).toBe("openrouter:meta-llama/llama-3.2-3b-instruct:free")
      expect(provider.info.name).toContain("OpenRouter")
      expect(provider.info.capabilities.streaming).toBe(true)
    })

    test("uses default capabilities for unknown models", () => {
      const unknownProvider = new OpenRouterProvider({
        apiKey: "test",
        model: "unknown/model",
      })
      expect(unknownProvider.info.capabilities.maxContextTokens).toBe(32000)
    })
  })

  describe("translateMessageType", () => {
    test("maps user to user", () => {
      expect(provider.translateMessageType("user")).toBe("user")
    })

    test("maps assistant to assistant", () => {
      expect(provider.translateMessageType("assistant")).toBe("assistant")
    })

    test("maps system to system", () => {
      expect(provider.translateMessageType("system")).toBe("system")
    })

    test("maps knowledge to system", () => {
      expect(provider.translateMessageType("knowledge")).toBe("system")
    })

    test("maps tool_result to tool", () => {
      expect(provider.translateMessageType("tool_result")).toBe("tool")
    })
  })

  describe("countTokens", () => {
    test("estimates tokens based on character count", async () => {
      const text = "Hello, world!" // 13 chars
      const tokens = await provider.countTokens(text)
      expect(tokens).toBe(4) // ceil(13/4)
    })

    test("handles empty string", async () => {
      const tokens = await provider.countTokens("")
      expect(tokens).toBe(0)
    })
  })

  describe("complete", () => {
    test("sends correct request format", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ])
      }) as typeof fetch

      const context = mockContext([
        messageToContextItem(mockMessage({ type: "user", content: "Hello" })),
      ])

      const chunks: string[] = []
      for await (const chunk of provider.complete(context)) {
        chunks.push(chunk.content)
      }

      expect(capturedBody).not.toBeNull()
      expect(capturedBody!.model).toBe("meta-llama/llama-3.2-3b-instruct:free")
      expect(capturedBody!.stream).toBe(true)
      expect(capturedBody!.messages).toHaveLength(1)
      expect((capturedBody!.messages as Array<{ role: string }>)[0].role).toBe("user")
    })

    test("includes system prompt when present", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      const context = mockContext([], "You are a helpful assistant")

      for await (const _ of provider.complete(context)) {
        // consume
      }

      expect(capturedBody!.messages).toHaveLength(1)
      expect((capturedBody!.messages as Array<{ role: string }>)[0].role).toBe("system")
    })

    test("streams content chunks", async () => {
      globalThis.fetch = mock(async () => {
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      const context = mockContext([
        messageToContextItem(mockMessage({ type: "user", content: "Hi" })),
      ])

      const chunks: string[] = []
      for await (const chunk of provider.complete(context)) {
        chunks.push(chunk.content)
      }

      expect(chunks.join("")).toBe("Hello world")
    })

    test("includes usage in final chunk", async () => {
      globalThis.fetch = mock(async () => {
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        ])
      }) as typeof fetch

      const context = mockContext([
        messageToContextItem(mockMessage()),
      ])

      let finalChunk = null
      for await (const chunk of provider.complete(context)) {
        if (chunk.done) finalChunk = chunk
      }

      expect(finalChunk?.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      })
    })

    test("throws on API error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Rate limit exceeded", { status: 429 })
      }) as typeof fetch

      const context = mockContext([messageToContextItem(mockMessage())])

      await expect(async () => {
        for await (const _ of provider.complete(context)) {
          // consume
        }
      }).toThrow("OpenRouter API error (429)")
    })

    test("handles tool calls", async () => {
      globalThis.fetch = mock(async () => {
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        ])
      }) as typeof fetch

      const context = mockContext([messageToContextItem(mockMessage())])

      let toolUseChunk = null
      for await (const chunk of provider.complete(context)) {
        if (chunk.toolUse) toolUseChunk = chunk
      }

      expect(toolUseChunk?.toolUse).toEqual({
        id: "call_1",
        name: "get_weather",
        input: { city: "NYC" },
      })
    })
  })

  describe("context conversion", () => {
    test("converts tool_use messages correctly", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      const toolUseMsg = mockMessage({
        type: "tool_use",
        content: "",
        metadata: {
          toolId: "call_123",
          toolName: "calculator",
          toolInput: { expression: "2+2" },
        },
      })

      const context = mockContext([messageToContextItem(toolUseMsg)])

      for await (const _ of provider.complete(context)) {
        // consume
      }

      const messages = capturedBody!.messages as Array<{
        role: string
        tool_calls?: Array<{ id: string; function: { name: string } }>
      }>
      expect(messages[0].role).toBe("assistant")
      expect(messages[0].tool_calls?.[0].id).toBe("call_123")
      expect(messages[0].tool_calls?.[0].function.name).toBe("calculator")
    })

    test("converts tool_result messages correctly", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      const toolResultMsg = mockMessage({
        type: "tool_result",
        content: "4",
        metadata: {
          toolId: "call_123",
          toolOutput: "4",
        },
      })

      const context = mockContext([messageToContextItem(toolResultMsg)])

      for await (const _ of provider.complete(context)) {
        // consume
      }

      const messages = capturedBody!.messages as Array<{
        role: string
        tool_call_id?: string
        content: string
      }>
      expect(messages[0].role).toBe("tool")
      expect(messages[0].tool_call_id).toBe("call_123")
    })
  })
})
