import { test, expect, beforeEach, afterEach } from "bun:test"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import { DEFAULT_EMBEDDING_DIMENSIONS, type Embedding } from "@/domain/shared.ts"

// Test project ID for session creation
const TEST_PROJECT_ID = "test-project-id"

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
  const session = await storage.createSession(TEST_PROJECT_ID, "Test Session")

  expect(session.id).toBeDefined()
  expect(session.title).toBe("Test Session")
  expect(session.createdAt).toBeInstanceOf(Date)
  expect(session.updatedAt.getTime()).toBe(session.createdAt.getTime())
})

test("creates session with metadata", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "With Metadata", {
    projectPath: "/test/path",
    provider: "claude",
    model: "claude-3",
  })

  expect(session.metadata).toBeDefined()
  expect(session.metadata!.projectPath).toBe("/test/path")
  expect(session.metadata!.provider).toBe("claude")
})

test("gets a session by id", async () => {
  const created = await storage.createSession(TEST_PROJECT_ID, "Find Me")
  const found = await storage.getSession(created.id)

  expect(found).not.toBeNull()
  expect(found!.title).toBe("Find Me")
})

test("returns null for non-existent session", async () => {
  const found = await storage.getSession("non-existent-id")
  expect(found).toBeNull()
})

test("lists sessions sorted by updatedAt", async () => {
  await storage.createSession(TEST_PROJECT_ID, "First")
  await storage.createSession(TEST_PROJECT_ID, "Second")
  await storage.createSession(TEST_PROJECT_ID, "Third")

  const sessions = await storage.listSessions()

  expect(sessions).toHaveLength(3)
  // Most recent first
  expect(sessions[0].title).toBe("Third")
  expect(sessions[2].title).toBe("First")
})

test("updates session title", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Original")
  const updated = await storage.updateSession(session.id, { title: "Updated" })

  expect(updated!.title).toBe("Updated")
  expect(updated!.updatedAt.getTime()).toBeGreaterThan(session.updatedAt.getTime())
})

test("deletes a session", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "To Delete")
  const deleted = await storage.deleteSession(session.id)

  expect(deleted).toBe(true)
  expect(await storage.getSession(session.id)).toBeNull()
})

// ─── Entries (Messages) ─────────────────────────────────────────

test("adds an entry to a session", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")
  const embedding = createEmbedding()
  const entry = await storage.addMessage(
    session.id,
    "user_input",
    "Hello!",
    embedding,
    10 // tokens
  )

  expect(entry.id).toBeDefined()
  expect(entry.sessionId).toBe(session.id)
  expect(entry.kind).toBe("user_input")
  expect((entry as { content: string }).content).toBe("Hello!")
  expect(entry.tokens).toBe(10)
  expect(entry.embedding.model).toBe("test-model")
})

test("adds pinned entry", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")
  const embedding = createEmbedding()
  const entry = await storage.addMessage(
    session.id,
    "agent_response",
    "Hi there!",
    embedding,
    15,
    { pinned: true }
  )

  expect(entry.pinned).toBe(true)
  expect(entry.kind).toBe("agent_response")
})

test("gets entries for a session in order", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")

  await storage.addMessage(session.id, "user_input", "First", createEmbedding(), 5)
  await storage.addMessage(session.id, "agent_response", "Second", createEmbedding(), 10)
  await storage.addMessage(session.id, "user_input", "Third", createEmbedding(), 5)

  const messages = await storage.getMessages(session.id)

  expect(messages).toHaveLength(3)
  expect(messages[0].content).toBe("First")
  expect(messages[1].content).toBe("Second")
  expect(messages[2].content).toBe("Third")
})

test("updates entry pinned status", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")
  const entry = await storage.addMessage(
    session.id,
    "user_input",
    "Test",
    createEmbedding(),
    5
  )

  expect(entry.pinned).toBeFalsy()

  const updated = await storage.updateMessage(entry.id, { pinned: true })
  expect(updated!.pinned).toBe(true)
})

test("searches entries by vector similarity", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")

  // Add entries with embeddings
  const emb1 = createEmbedding()
  const emb2 = createEmbedding()
  await storage.addMessage(session.id, "user_input", "About TypeScript", emb1, 10)
  await storage.addMessage(session.id, "agent_response", "About JavaScript", emb2, 15)

  // Search with emb1's vector - should find "About TypeScript" as closer
  const results = await storage.searchMessages(emb1.vector, 2)

  expect(results).toHaveLength(2)
  expect((results[0].item as { content: string }).content).toBe("About TypeScript")
  expect(results[0].distance).toBeLessThan(results[1].distance)
})

test("deleting session deletes its entries", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Chat")
  await storage.addMessage(session.id, "user_input", "Message 1", createEmbedding(), 5)
  await storage.addMessage(session.id, "user_input", "Message 2", createEmbedding(), 5)

  await storage.deleteSession(session.id)

  const entries = await storage.getMessages(session.id)
  expect(entries).toHaveLength(0)
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

test("updates knowledge tags", async () => {
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

// ─── Artifact Truncation ──────────────────────────────────────────

test("deleteArtifactsAfter removes artifacts after timestamp", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Truncate Test")

  // Add artifacts with small delays to ensure distinct timestamps
  const a1 = await storage.addArtifact(session.id, {
    kind: "user_input",
    content: "First",
    embedding: createEmbedding(),
    tokens: 5,
  })

  // Small delay to ensure different timestamp
  await new Promise((r) => setTimeout(r, 10))

  const a2 = await storage.addArtifact(session.id, {
    kind: "agent_response",
    content: "Second",
    embedding: createEmbedding(),
    tokens: 10,
    model: "test",
    provider: "test",
    status: "complete",
  })

  await new Promise((r) => setTimeout(r, 10))

  const a3 = await storage.addArtifact(session.id, {
    kind: "user_input",
    content: "Third",
    embedding: createEmbedding(),
    tokens: 5,
  })

  // Verify all 3 exist
  let artifacts = await storage.getArtifacts(session.id)
  expect(artifacts).toHaveLength(3)

  // Delete after a1's timestamp (should remove a2 and a3)
  const removed = await storage.deleteArtifactsAfter(session.id, a1.timestamp)
  expect(removed).toBe(2)

  // Verify only a1 remains
  artifacts = await storage.getArtifacts(session.id)
  expect(artifacts).toHaveLength(1)
  expect(artifacts[0].id).toBe(a1.id)
})

test("deleteArtifactsAfter returns 0 when nothing to delete", async () => {
  const session = await storage.createSession(TEST_PROJECT_ID, "Truncate Test")

  const artifact = await storage.addArtifact(session.id, {
    kind: "user_input",
    content: "Only one",
    embedding: createEmbedding(),
    tokens: 5,
  })

  // Delete after this artifact's timestamp - nothing should be removed
  const removed = await storage.deleteArtifactsAfter(session.id, artifact.timestamp)
  expect(removed).toBe(0)

  const artifacts = await storage.getArtifacts(session.id)
  expect(artifacts).toHaveLength(1)
})

test("deleteArtifactsAfter only affects specified session", async () => {
  const session1 = await storage.createSession(TEST_PROJECT_ID, "Session 1")
  const session2 = await storage.createSession(TEST_PROJECT_ID, "Session 2")

  const s1a1 = await storage.addArtifact(session1.id, {
    kind: "user_input",
    content: "S1 First",
    embedding: createEmbedding(),
    tokens: 5,
  })

  await new Promise((r) => setTimeout(r, 10))

  await storage.addArtifact(session1.id, {
    kind: "agent_response",
    content: "S1 Second",
    embedding: createEmbedding(),
    tokens: 10,
    model: "test",
    provider: "test",
    status: "complete",
  })

  await storage.addArtifact(session2.id, {
    kind: "user_input",
    content: "S2 First",
    embedding: createEmbedding(),
    tokens: 5,
  })

  await storage.addArtifact(session2.id, {
    kind: "agent_response",
    content: "S2 Second",
    embedding: createEmbedding(),
    tokens: 10,
    model: "test",
    provider: "test",
    status: "complete",
  })

  // Delete from session1 only
  await storage.deleteArtifactsAfter(session1.id, s1a1.timestamp)

  // Session 1 should have 1 artifact
  const s1Artifacts = await storage.getArtifacts(session1.id)
  expect(s1Artifacts).toHaveLength(1)

  // Session 2 should still have 2 artifacts
  const s2Artifacts = await storage.getArtifacts(session2.id)
  expect(s2Artifacts).toHaveLength(2)
})
