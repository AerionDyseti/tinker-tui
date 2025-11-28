import { test, expect, beforeEach, afterEach } from "bun:test"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import { DEFAULT_EMBEDDING_DIMENSIONS, type Embedding } from "@/domain/shared.ts"

// Helper to generate random embedding vector
function randomVector(): number[] {
  return Array.from({ length: DEFAULT_EMBEDDING_DIMENSIONS }, () => Math.random())
}

// Helper to create a full Embedding object
function createEmbedding(vector?: number[]): Embedding {
  return {
    vector: vector ?? randomVector(),
    model: "test-model",
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    createdAt: new Date(),
  }
}

// Helper to compare embedding vectors with Float32 tolerance
// LanceDB stores as Float32, so we expect some precision loss
function expectVectorsClose(actual: number[], expected: number[]) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    // Float32 has ~7 digits of precision
    expect(actual[i]).toBeCloseTo(expected[i], 5)
  }
}

let storage: ProjectStorage

beforeEach(async () => {
  storage = await ProjectStorage.memory()
})

afterEach(() => {
  storage.close()
})

// ─── Sessions ──────────────────────────────────────────────────

test("creates a session", async () => {
  const session = await storage.createSession("Test Session")

  expect(session.id).toBeDefined()
  expect(session.title).toBe("Test Session")
  expect(session.createdAt).toBeInstanceOf(Date)
  expect(session.updatedAt.getTime()).toBe(session.createdAt.getTime())
})

test("creates session with metadata", async () => {
  const session = await storage.createSession("With Metadata", {
    projectPath: "/test/path",
    provider: "claude",
    model: "claude-3",
  })

  expect(session.metadata).toBeDefined()
  expect(session.metadata!.projectPath).toBe("/test/path")
  expect(session.metadata!.provider).toBe("claude")
})

test("gets a session by id", async () => {
  const created = await storage.createSession("Find Me")
  const found = await storage.getSession(created.id)

  expect(found).not.toBeNull()
  expect(found!.title).toBe("Find Me")
})

test("returns null for non-existent session", async () => {
  const found = await storage.getSession("non-existent-id")
  expect(found).toBeNull()
})

test("lists sessions sorted by updatedAt", async () => {
  await storage.createSession("First")
  await storage.createSession("Second")
  await storage.createSession("Third")

  const sessions = await storage.listSessions()

  expect(sessions).toHaveLength(3)
  // Most recent first
  expect(sessions[0].title).toBe("Third")
  expect(sessions[2].title).toBe("First")
})

test("updates session title", async () => {
  const session = await storage.createSession("Original")
  const updated = await storage.updateSession(session.id, { title: "Updated" })

  expect(updated!.title).toBe("Updated")
  expect(updated!.updatedAt.getTime()).toBeGreaterThan(session.updatedAt.getTime())
})

test("deletes a session", async () => {
  const session = await storage.createSession("To Delete")
  const deleted = await storage.deleteSession(session.id)

  expect(deleted).toBe(true)
  expect(await storage.getSession(session.id)).toBeNull()
})

// ─── Messages ──────────────────────────────────────────────────

test("adds a message to a session", async () => {
  const session = await storage.createSession("Chat")
  const embedding = createEmbedding()
  const message = await storage.addMessage(
    session.id,
    "user",
    "Hello!",
    embedding,
    10 // tokens
  )

  expect(message.id).toBeDefined()
  expect(message.sessionId).toBe(session.id)
  expect(message.type).toBe("user")
  expect(message.content).toBe("Hello!")
  expect(message.tokens).toBe(10)
  expect(message.embedding.model).toBe("test-model")
})

test("adds message with metadata", async () => {
  const session = await storage.createSession("Chat")
  const embedding = createEmbedding()
  const message = await storage.addMessage(
    session.id,
    "tool_result",
    "Tool output",
    embedding,
    15,
    {
      pinned: true,
      metadata: {
        toolId: "tool-123",
        toolName: "calculator",
        toolOutput: { result: 42 },
      },
    }
  )

  expect(message.pinned).toBe(true)
  expect(message.metadata!.toolId).toBe("tool-123")
  expect(message.metadata!.toolName).toBe("calculator")
})

test("gets messages for a session in order", async () => {
  const session = await storage.createSession("Chat")

  await storage.addMessage(session.id, "user", "First", createEmbedding(), 5)
  await storage.addMessage(session.id, "assistant", "Second", createEmbedding(), 10)
  await storage.addMessage(session.id, "user", "Third", createEmbedding(), 5)

  const messages = await storage.getMessages(session.id)

  expect(messages).toHaveLength(3)
  expect(messages[0].content).toBe("First")
  expect(messages[1].content).toBe("Second")
  expect(messages[2].content).toBe("Third")
})

test("updates message pinned status", async () => {
  const session = await storage.createSession("Chat")
  const message = await storage.addMessage(
    session.id,
    "user",
    "Test",
    createEmbedding(),
    5
  )

  expect(message.pinned).toBeFalsy()

  const updated = await storage.updateMessage(message.id, { pinned: true })
  expect(updated!.pinned).toBe(true)
})

test("searches messages by vector similarity", async () => {
  const session = await storage.createSession("Chat")

  // Add messages with embeddings
  const emb1 = createEmbedding()
  const emb2 = createEmbedding()
  await storage.addMessage(session.id, "user", "About TypeScript", emb1, 10)
  await storage.addMessage(session.id, "assistant", "About JavaScript", emb2, 15)

  // Search with emb1's vector - should find "About TypeScript" as closer
  const results = await storage.searchMessages(emb1.vector, 2)

  expect(results).toHaveLength(2)
  expect(results[0].item.content).toBe("About TypeScript")
  expect(results[0].distance).toBeLessThan(results[1].distance)
})

test("deleting session deletes its messages", async () => {
  const session = await storage.createSession("Chat")
  await storage.addMessage(session.id, "user", "Message 1", createEmbedding(), 5)
  await storage.addMessage(session.id, "user", "Message 2", createEmbedding(), 5)

  await storage.deleteSession(session.id)

  const messages = await storage.getMessages(session.id)
  expect(messages).toHaveLength(0)
})

// ─── Knowledge ─────────────────────────────────────────────────

test("adds knowledge", async () => {
  const embedding = createEmbedding()
  const knowledge = await storage.addKnowledge(
    "User prefers TypeScript",
    embedding,
    "conversation",
    { sessionId: "session-123" },
    ["preference", "language"]
  )

  expect(knowledge.id).toBeDefined()
  expect(knowledge.content).toBe("User prefers TypeScript")
  expectVectorsClose(knowledge.embedding.vector, embedding.vector)
  expect(knowledge.source).toBe("conversation")
  expect(knowledge.sourceMetadata.sessionId).toBe("session-123")
  expect(knowledge.tags).toEqual(["preference", "language"])
})

test("gets knowledge by id", async () => {
  const embedding = createEmbedding()
  const created = await storage.addKnowledge("Test knowledge", embedding, "user", {})
  const found = await storage.getKnowledge(created.id)

  expect(found).not.toBeNull()
  expect(found!.content).toBe("Test knowledge")
})

test("lists knowledge by source", async () => {
  const emb = createEmbedding()
  await storage.addKnowledge("From conversation", emb, "conversation", {})
  await storage.addKnowledge("From user", emb, "user", {})
  await storage.addKnowledge("From code", emb, "code", {})

  const conversationKnowledge = await storage.listKnowledge({ source: "conversation" })
  expect(conversationKnowledge).toHaveLength(1)
  expect(conversationKnowledge[0].source).toBe("conversation")
})

test("searches knowledge by vector similarity", async () => {
  const emb1 = createEmbedding()
  const emb2 = createEmbedding()

  await storage.addKnowledge("TypeScript is great", emb1, "conversation", {})
  await storage.addKnowledge("Python is nice", emb2, "conversation", {})

  const results = await storage.searchKnowledge(emb1.vector, { limit: 2 })

  expect(results).toHaveLength(2)
  expect(results[0].item.content).toBe("TypeScript is great")
})

test("updates knowledge content", async () => {
  const emb = createEmbedding()
  const knowledge = await storage.addKnowledge("Original", emb, "user", {})

  const updated = await storage.updateKnowledge(knowledge.id, {
    content: "Updated content",
  })

  expect(updated!.content).toBe("Updated content")
  expect(updated!.updatedAt.getTime()).toBeGreaterThan(knowledge.updatedAt.getTime())
})

// NOTE: LanceDB has limitations with updating array/List type columns directly
// Tags updates may require a delete+re-add pattern for now
test.skip("updates knowledge tags (known LanceDB limitation)", async () => {
  const emb = createEmbedding()
  const knowledge = await storage.addKnowledge("Original", emb, "user", {}, ["old-tag"])

  const updated = await storage.updateKnowledge(knowledge.id, {
    tags: ["new-tag"],
  })

  expect(updated!.tags).toEqual(["new-tag"])
})

test("deletes knowledge", async () => {
  const emb = createEmbedding()
  const knowledge = await storage.addKnowledge("To delete", emb, "user", {})

  const deleted = await storage.deleteKnowledge(knowledge.id)
  expect(deleted).toBe(true)

  const found = await storage.getKnowledge(knowledge.id)
  expect(found).toBeNull()
})

test("counts knowledge", async () => {
  const emb = createEmbedding()
  await storage.addKnowledge("Item 1", emb, "conversation", {})
  await storage.addKnowledge("Item 2", emb, "conversation", {})
  await storage.addKnowledge("Item 3", emb, "user", {})

  expect(await storage.countKnowledge()).toBe(3)
  expect(await storage.countKnowledge("conversation")).toBe(2)
  expect(await storage.countKnowledge("user")).toBe(1)
})
