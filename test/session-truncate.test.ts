import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import { ActiveSession, createActiveSession } from "@/application/active-session.ts"
import { SessionManager } from "@/application/session-manager.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import type { Provider, ProviderInfo, Context, StreamChunk } from "@/domain/provider.ts"
import type { Embedder } from "@/infrastructure/embedding/types.ts"
import { DEFAULT_EMBEDDING_DIMENSIONS, type Embedding } from "@/domain/shared.ts"

// ─── Test Helpers ─────────────────────────────────────────────────

const TEST_PROJECT_ID = "test-project-truncate"

function randomVector(): number[] {
  return Array.from({ length: DEFAULT_EMBEDDING_DIMENSIONS }, () => Math.random())
}

function createMockEmbedder(): Embedder {
  return {
    name: "mock-embedder",
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    async embed(text: string): Promise<Embedding> {
      return {
        vector: randomVector(),
        model: "mock-embedder",
        dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
        createdAt: new Date(),
      }
    },
  }
}

function createMockProvider(): Provider {
  const info: ProviderInfo = {
    id: "mock-provider",
    name: "Mock Provider",
    model: "mock-model",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      systemPrompt: true,
      maxContextTokens: 4096,
      maxOutputTokens: 1024,
    },
  }

  return {
    info,
    async *complete(context: Context): AsyncIterable<StreamChunk> {
      yield { content: "Mock response", done: false }
      yield {
        content: "",
        done: true,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }
    },
    async countTokens(text: string): Promise<number> {
      return Math.ceil(text.length / 4)
    },
  }
}

// ─── ActiveSession.truncateAfter Tests ────────────────────────────

describe("ActiveSession.truncateAfter", () => {
  let storage: ProjectStorage
  let session: ActiveSession

  beforeEach(async () => {
    storage = await ProjectStorage.memory()
    session = createActiveSession({
      projectId: TEST_PROJECT_ID,
      provider: createMockProvider(),
      storage,
      embedder: createMockEmbedder(),
      systemPrompt: "Test system prompt",
    })
    await session.start()
  })

  afterEach(() => {
    storage.close()
  })

  test("truncates after artifact by index", async () => {
    // Add some artifacts via send (which creates user input + agent response)
    const events1: unknown[] = []
    for await (const e of session.send("First message")) {
      events1.push(e)
    }

    await new Promise((r) => setTimeout(r, 10))

    const events2: unknown[] = []
    for await (const e of session.send("Second message")) {
      events2.push(e)
    }

    // Should have 4 artifacts: user1, agent1, user2, agent2
    expect(session.currentArtifacts).toHaveLength(4)

    // Truncate after index 1 (keep user1 + agent1)
    const removed = await session.truncateAfter(1)
    expect(removed).toBe(2)
    expect(session.currentArtifacts).toHaveLength(2)

    // Verify storage is also truncated
    const stored = await storage.getArtifacts(session.currentSession!.id)
    expect(stored).toHaveLength(2)
  })

  test("truncates after artifact by ID", async () => {
    for await (const _ of session.send("First message")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of session.send("Second message")) {}

    const artifacts = session.currentArtifacts
    expect(artifacts).toHaveLength(4)

    // Truncate after first artifact (user input)
    const firstId = artifacts[0].id
    const removed = await session.truncateAfter(firstId)
    expect(removed).toBe(3)
    expect(session.currentArtifacts).toHaveLength(1)
    expect(session.currentArtifacts[0].id).toBe(firstId)
  })

  test("returns 0 when truncating after last artifact", async () => {
    for await (const _ of session.send("Only message")) {}

    const artifacts = session.currentArtifacts
    expect(artifacts).toHaveLength(2)

    // Truncate after last artifact - nothing to remove
    const removed = await session.truncateAfter(1)
    expect(removed).toBe(0)
    expect(session.currentArtifacts).toHaveLength(2)
  })

  test("throws error for invalid index", async () => {
    for await (const _ of session.send("Message")) {}

    await expect(session.truncateAfter(10)).rejects.toThrow("Invalid artifact index")
    await expect(session.truncateAfter(-1)).rejects.toThrow("Invalid artifact index")
  })

  test("throws error for non-existent artifact ID", async () => {
    for await (const _ of session.send("Message")) {}

    await expect(session.truncateAfter("non-existent-id")).rejects.toThrow(
      "Artifact not found"
    )
  })

  test("throws error when no active session", async () => {
    // Create a new session without starting it
    const newSession = createActiveSession({
      projectId: TEST_PROJECT_ID,
      provider: createMockProvider(),
      storage,
      embedder: createMockEmbedder(),
    })

    await expect(newSession.truncateAfter(0)).rejects.toThrow("No active session")
  })

  test("correctly truncates in middle of conversation", async () => {
    // Build up a longer conversation
    for await (const _ of session.send("Message 1")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of session.send("Message 2")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of session.send("Message 3")) {}

    // 6 artifacts: u1, a1, u2, a2, u3, a3
    expect(session.currentArtifacts).toHaveLength(6)

    // Truncate after index 2 (keep u1, a1, u2)
    const removed = await session.truncateAfter(2)
    expect(removed).toBe(3)
    expect(session.currentArtifacts).toHaveLength(3)

    // Verify the right artifacts remain
    const remaining = session.currentArtifacts
    expect(remaining[0].kind).toBe("user_input")
    expect(remaining[1].kind).toBe("agent_response")
    expect(remaining[2].kind).toBe("user_input")
  })
})

// ─── SessionManager.truncateSession Tests ─────────────────────────

describe("SessionManager.truncateSession", () => {
  let storage: ProjectStorage
  let manager: SessionManager

  beforeEach(async () => {
    storage = await ProjectStorage.memory()
    manager = new SessionManager(
      {
        projectId: TEST_PROJECT_ID,
        storage,
        embedder: createMockEmbedder(),
        systemPrompt: "Test prompt",
      },
      createMockProvider()
    )
  })

  afterEach(() => {
    storage.close()
  })

  test("truncates an existing session", async () => {
    // Create and populate a session
    const activeSession = await manager.createSession()
    const sessionId = activeSession.currentSession!.id

    for await (const _ of activeSession.send("First")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of activeSession.send("Second")) {}

    expect(activeSession.currentArtifacts).toHaveLength(4)

    // Truncate via manager
    const removed = await manager.truncateSession(sessionId, 1)
    expect(removed).toBe(2)

    // Verify the session is truncated
    const session = await manager.getSession(sessionId)
    expect(session!.currentArtifacts).toHaveLength(2)
  })

  test("returns null for non-existent session", async () => {
    const result = await manager.truncateSession("non-existent-id", 0)
    expect(result).toBeNull()
  })

  test("works with cached session", async () => {
    // Create session (gets cached)
    const activeSession = await manager.createSession()
    const sessionId = activeSession.currentSession!.id

    for await (const _ of activeSession.send("Message")) {}

    // Access via manager again (should use cache)
    const cached = await manager.getSession(sessionId)
    expect(cached).toBe(activeSession) // Same instance

    // Truncate should work on cached session
    const removed = await manager.truncateSession(sessionId, 0)
    expect(removed).toBe(1)
    expect(activeSession.currentArtifacts).toHaveLength(1)
  })

  test("works with loaded session from storage", async () => {
    // Create session
    const activeSession = await manager.createSession()
    const sessionId = activeSession.currentSession!.id

    for await (const _ of activeSession.send("Message")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of activeSession.send("Another")) {}

    // Evict from cache
    manager.evictSession(sessionId)

    // Truncate should load from storage and work
    const removed = await manager.truncateSession(sessionId, 1)
    expect(removed).toBe(2)

    // Verify via fresh load
    const loaded = await manager.getSession(sessionId)
    expect(loaded!.currentArtifacts).toHaveLength(2)
  })
})
