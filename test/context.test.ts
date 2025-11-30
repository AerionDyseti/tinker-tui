import { test, expect, describe } from "bun:test"
import { ContextAssembler } from "@/infrastructure/context/index.ts"
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
    id: `msg-${Math.random().toString(36).slice(2)}`,
    sessionId: "session-1",
    type: "user",
    content: "Hello",
    tokens: 10,
    embedding: mockEmbedding(),
    timestamp: new Date(),
    ...overrides,
  }
}

describe("ContextAssembler", () => {
  const assembler = new ContextAssembler()

  describe("assemble", () => {
    test("includes all messages when under budget", () => {
      const messages = [
        mockMessage({ content: "First", tokens: 10 }),
        mockMessage({ content: "Second", tokens: 10 }),
        mockMessage({ content: "Third", tokens: 10 }),
      ]

      const context = assembler.assemble(messages, { maxTokens: 100 })

      expect(context.items).toHaveLength(3)
      expect(context.metadata.artifactsIncluded).toBe(3)
      expect(context.metadata.artifactsFiltered).toBe(0)
    })

    test("truncates oldest messages when over budget", () => {
      const messages = [
        mockMessage({ content: "Old", tokens: 50 }),
        mockMessage({ content: "Middle", tokens: 50 }),
        mockMessage({ content: "Recent", tokens: 50 }),
      ]

      // Only 100 tokens available, each message is 50
      const context = assembler.assemble(messages, { maxTokens: 100 })

      expect(context.items).toHaveLength(2)
      expect(context.items[0].content).toBe("Middle")
      expect(context.items[1].content).toBe("Recent")
      expect(context.metadata.artifactsFiltered).toBe(1)
    })

    test("reserves tokens for response", () => {
      const messages = [
        mockMessage({ content: "First", tokens: 40 }),
        mockMessage({ content: "Second", tokens: 40 }),
      ]

      // 100 total, 50 reserved for response = 50 available
      const context = assembler.assemble(messages, {
        maxTokens: 100,
        reservations: { response: 50 },
      })

      expect(context.items).toHaveLength(1)
      expect(context.items[0].content).toBe("Second")
      expect(context.budget.reserved.response).toBe(50)
    })

    test("reserves tokens for system prompt", () => {
      const systemPrompt = "You are a helpful assistant." // ~8 tokens estimated

      const messages = [
        mockMessage({ content: "Hello", tokens: 90 }),
      ]

      const context = assembler.assemble(messages, {
        maxTokens: 100,
        systemPrompt,
      })

      expect(context.systemPrompt).toBe(systemPrompt)
      expect(context.budget.reserved.system).toBeGreaterThan(0)
    })

    test("maintains message order", () => {
      const messages = [
        mockMessage({ content: "1", tokens: 10 }),
        mockMessage({ content: "2", tokens: 10 }),
        mockMessage({ content: "3", tokens: 10 }),
      ]

      const context = assembler.assemble(messages, { maxTokens: 100 })

      expect(context.items[0].content).toBe("1")
      expect(context.items[1].content).toBe("2")
      expect(context.items[2].content).toBe("3")
    })

    test("handles empty messages array", () => {
      const context = assembler.assemble([], { maxTokens: 100 })

      expect(context.items).toHaveLength(0)
      expect(context.metadata.artifactsIncluded).toBe(0)
      expect(context.metadata.artifactsFiltered).toBe(0)
    })

    test("tracks budget correctly", () => {
      const messages = [
        mockMessage({ tokens: 20 }),
        mockMessage({ tokens: 30 }),
      ]

      const context = assembler.assemble(messages, {
        maxTokens: 100,
        reservations: { response: 20 },
      })

      expect(context.budget.total).toBe(100)
      expect(context.budget.reserved.response).toBe(20)
      expect(context.budget.used).toBe(50) // 20 + 30
      expect(context.budget.available).toBe(30) // 100 - 20 - 50
    })

    test("sets metadata timestamps", () => {
      const before = new Date()
      const context = assembler.assemble([], { maxTokens: 100 })
      const after = new Date()

      expect(context.metadata.assembledAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(context.metadata.assembledAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    test("converts messages to context items with correct type", () => {
      const messages = [
        mockMessage({ type: "user", content: "User msg" }),
        mockMessage({ type: "assistant", content: "Assistant msg" }),
      ]

      const context = assembler.assemble(messages, { maxTokens: 100 })

      expect(context.items[0].type).toBe("artifact")
      expect(context.items[0].source.type).toBe("artifact")
      expect(context.items[1].type).toBe("artifact")
    })

    test("marks pinned messages as high priority", () => {
      const messages = [
        mockMessage({ pinned: false }),
        mockMessage({ pinned: true }),
      ]

      const context = assembler.assemble(messages, { maxTokens: 100 })

      expect(context.items[0].priority).toBe("medium")
      expect(context.items[1].priority).toBe("high")
    })

    test("reports zero knowledge when RAG is not used", () => {
      const context = assembler.assemble([mockMessage()], { maxTokens: 100 })

      expect(context.metadata.knowledgeIncluded).toBe(0)
    })
  })
})
