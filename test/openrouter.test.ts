import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test"
import { OpenRouterProvider } from "@/infrastructure/provider/index.ts"
import type { Context, ContextItem } from "@/domain/context.ts"
import { createTokenBudget } from "@/domain/context.ts"
import type { SessionArtifact, ArtifactKind, UserInput, ToolUse, ToolResult } from "@/domain/artifact.ts"
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

// Helper to create a mock artifact
function mockArtifact(overrides: { kind?: ArtifactKind; content?: string } = {}): SessionArtifact {
  const kind = overrides.kind ?? "user_input"
  const content = overrides.content ?? "Hello"

  return {
    id: "artifact-1",
    sessionId: "session-1",
    kind,
    content,
    tokens: 10,
    embedding: mockEmbedding(),
    timestamp: new Date(),
  } as UserInput
}

// Helper to create a mock tool use artifact
function mockToolUse(overrides: Partial<ToolUse> = {}): ToolUse {
  return {
    id: "artifact-tool-use-1",
    sessionId: "session-1",
    kind: "tool_use",
    toolUseId: "call_123",
    toolId: "tool_calculator",
    toolName: "calculator",
    input: { expression: "2+2" },
    tokens: 10,
    embedding: mockEmbedding(),
    timestamp: new Date(),
    ...overrides,
  }
}

// Helper to create a mock tool result artifact
function mockToolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    id: "artifact-tool-result-1",
    sessionId: "session-1",
    kind: "tool_result",
    toolUseId: "call_123",
    result: "4",
    isError: false,
    tokens: 10,
    embedding: mockEmbedding(),
    timestamp: new Date(),
    ...overrides,
  }
}

// Helper to create a mock context item from an artifact
function artifactToContextItem(artifact: SessionArtifact): ContextItem {
  let content = ""
  if ("content" in artifact) {
    content = artifact.content
  } else if (artifact.kind === "tool_use") {
    const toolUse = artifact as ToolUse
    content = JSON.stringify(toolUse.input)
  } else if (artifact.kind === "tool_result") {
    const toolResult = artifact as ToolResult
    content = JSON.stringify(toolResult.result)
  }
  return {
    id: artifact.id,
    type: "message",
    content,
    tokens: artifact.tokens,
    priority: "medium",
    source: { type: "artifact", artifact },
  }
}

// Legacy aliases for tests
const mockMessage = mockArtifact
const messageToContextItem = artifactToContextItem

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

  describe("translateArtifactKind", () => {
    test("maps user_input to user", () => {
      expect(provider.translateArtifactKind("user_input")).toBe("user")
    })

    test("maps agent_response to assistant", () => {
      expect(provider.translateArtifactKind("agent_response")).toBe("assistant")
    })

    test("maps system_instruction to system", () => {
      expect(provider.translateArtifactKind("system_instruction")).toBe("system")
    })

    test("maps knowledge_reference to system", () => {
      expect(provider.translateArtifactKind("knowledge_reference")).toBe("system")
    })

    test("maps tool_use to assistant", () => {
      expect(provider.translateArtifactKind("tool_use")).toBe("assistant")
    })

    test("maps tool_result to tool", () => {
      expect(provider.translateArtifactKind("tool_result")).toBe("tool")
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
        messageToContextItem(mockMessage({ kind: "user_input", content: "Hello" })),
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
        messageToContextItem(mockMessage({ kind: "user_input", content: "Hi" })),
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
    test("converts tool_use to tool call", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      // Tool use artifact = tool call request
      const toolUse = mockToolUse({
        toolUseId: "call_123",
        toolName: "calculator",
        input: { expression: "2+2" },
      })

      const context = mockContext([artifactToContextItem(toolUse)])

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

    test("converts tool_result to tool response", async () => {
      let capturedBody: Record<string, unknown> | null = null

      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)
        return createSSEResponse([
          'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        ])
      }) as typeof fetch

      // Tool result artifact = tool response
      const toolResult = mockToolResult({
        toolUseId: "call_123",
        result: "4",
        isError: false,
      })

      const context = mockContext([artifactToContextItem(toolResult)])

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
