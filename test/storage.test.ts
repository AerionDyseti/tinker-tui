import { test, expect, beforeEach, afterEach } from "bun:test"
import { ProjectStorage, DEFAULT_EMBEDDING_DIMENSIONS } from "@/storage/index.ts"

// Helper to generate random embedding
function randomEmbedding(): number[] {
  return Array.from({ length: DEFAULT_EMBEDDING_DIMENSIONS }, () => Math.random())
}

// Helper to compare embeddings with Float32 tolerance
// LanceDB stores as Float32, so we expect some precision loss
function expectEmbeddingsClose(actual: number[] | null, expected: number[]) {
  expect(actual).not.toBeNull()
  expect(actual!.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    // Float32 has ~7 digits of precision
    expect(actual![i]).toBeCloseTo(expected[i], 5)
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
  expect(session.createdAt).toBeGreaterThan(0)
  expect(session.updatedAt).toBe(session.createdAt)
})

test("creates session without title", async () => {
  const session = await storage.createSession()
  expect(session.title).toBeNull()
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
  const updated = await storage.updateSession(session.id, "Updated")

  expect(updated!.title).toBe("Updated")
  expect(updated!.updatedAt).toBeGreaterThan(session.updatedAt)
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
  const message = await storage.addMessage(session.id, "user", "Hello!")

  expect(message.id).toBeDefined()
  expect(message.sessionId).toBe(session.id)
  expect(message.role).toBe("user")
  expect(message.content).toBe("Hello!")
  expect(message.embedding).toBeNull()
})

test("adds message with embedding", async () => {
  const session = await storage.createSession("Chat")
  const embedding = randomEmbedding()
  const message = await storage.addMessage(session.id, "assistant", "Hi!", embedding)

  expect(message.embedding).toEqual(embedding)
})

test("gets messages for a session in order", async () => {
  const session = await storage.createSession("Chat")

  await storage.addMessage(session.id, "user", "First")
  await storage.addMessage(session.id, "assistant", "Second")
  await storage.addMessage(session.id, "user", "Third")

  const messages = await storage.getMessages(session.id)

  expect(messages).toHaveLength(3)
  expect(messages[0].content).toBe("First")
  expect(messages[1].content).toBe("Second")
  expect(messages[2].content).toBe("Third")
})

test("updates message embedding", async () => {
  const session = await storage.createSession("Chat")
  const message = await storage.addMessage(session.id, "user", "Test")

  expect(message.embedding).toBeNull()

  const embedding = randomEmbedding()
  await storage.updateMessageEmbedding(message.id, embedding)

  const updated = await storage.getMessage(message.id)
  expectEmbeddingsClose(updated!.embedding, embedding)
})

test("searches messages by vector similarity", async () => {
  const session = await storage.createSession("Chat")

  // Add messages with embeddings
  const emb1 = randomEmbedding()
  const emb2 = randomEmbedding()
  await storage.addMessage(session.id, "user", "About TypeScript", emb1)
  await storage.addMessage(session.id, "assistant", "About JavaScript", emb2)

  // Search with emb1 - should find "About TypeScript" as closer
  const results = await storage.searchMessages(emb1, 2)

  expect(results).toHaveLength(2)
  expect(results[0].item.content).toBe("About TypeScript")
  expect(results[0].distance).toBeLessThan(results[1].distance)
})

test("deleting session deletes its messages", async () => {
  const session = await storage.createSession("Chat")
  await storage.addMessage(session.id, "user", "Message 1")
  await storage.addMessage(session.id, "user", "Message 2")

  await storage.deleteSession(session.id)

  const messages = await storage.getMessages(session.id)
  expect(messages).toHaveLength(0)
})

// ─── Memories ──────────────────────────────────────────────────

test("adds a memory", async () => {
  const embedding = randomEmbedding()
  const memory = await storage.addMemory(
    "User prefers TypeScript",
    embedding,
    "conversation",
    { tags: ["preference", "language"] }
  )

  expect(memory.id).toBeDefined()
  expect(memory.content).toBe("User prefers TypeScript")
  expect(memory.embedding).toEqual(embedding)
  expect(memory.source).toBe("conversation")
  expect(memory.tags).toEqual(["preference", "language"])
})

test("gets a memory by id", async () => {
  const embedding = randomEmbedding()
  const created = await storage.addMemory("Test memory", embedding, "user")
  const found = await storage.getMemory(created.id)

  expect(found).not.toBeNull()
  expect(found!.content).toBe("Test memory")
})

test("lists memories by source", async () => {
  const emb = randomEmbedding()
  await storage.addMemory("From conversation", emb, "conversation")
  await storage.addMemory("From user", emb, "user")
  await storage.addMemory("From code", emb, "code")

  const conversationMemories = await storage.listMemories({ source: "conversation" })
  expect(conversationMemories).toHaveLength(1)
  expect(conversationMemories[0].source).toBe("conversation")
})

test("searches memories by vector similarity", async () => {
  const emb1 = randomEmbedding()
  const emb2 = randomEmbedding()

  await storage.addMemory("TypeScript is great", emb1, "conversation")
  await storage.addMemory("Python is nice", emb2, "conversation")

  const results = await storage.searchMemories(emb1, { limit: 2 })

  expect(results).toHaveLength(2)
  expect(results[0].item.content).toBe("TypeScript is great")
})

test("updates a memory", async () => {
  const emb = randomEmbedding()
  const memory = await storage.addMemory("Original", emb, "user")

  const updated = await storage.updateMemory(memory.id, {
    content: "Updated content",
    tags: ["new-tag"],
  })

  expect(updated!.content).toBe("Updated content")
  expect(updated!.tags).toEqual(["new-tag"])
  expect(updated!.updatedAt).toBeGreaterThan(memory.updatedAt)
})

test("deletes a memory", async () => {
  const emb = randomEmbedding()
  const memory = await storage.addMemory("To delete", emb, "user")

  const deleted = await storage.deleteMemory(memory.id)
  expect(deleted).toBe(true)

  const found = await storage.getMemory(memory.id)
  expect(found).toBeNull()
})

test("counts memories", async () => {
  const emb = randomEmbedding()
  await storage.addMemory("Mem 1", emb, "conversation")
  await storage.addMemory("Mem 2", emb, "conversation")
  await storage.addMemory("Mem 3", emb, "user")

  expect(await storage.countMemories()).toBe(3)
  expect(await storage.countMemories("conversation")).toBe(2)
  expect(await storage.countMemories("user")).toBe(1)
})
