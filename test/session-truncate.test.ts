import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import {
  ConversationService,
  createConversationService,
} from "@/application/conversation-service.ts"
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

// ─── ConversationService.truncateAfter Tests ────────────────────────────

describe("ConversationService.truncateAfter", () => {
  let storage: ProjectStorage
  let service: ConversationService

  beforeEach(async () => {
    storage = await ProjectStorage.memory()
    service = createConversationService({
      projectId: TEST_PROJECT_ID,
      provider: createMockProvider(),
      storage,
      embedder: createMockEmbedder(),
      systemPrompt: "Test system prompt",
    })
    await service.start()
  })

  afterEach(() => {
    storage.close()
  })

  test("truncates after artifact by index", async () => {
    // Add some artifacts via send (which creates user input + agent response)
    for await (const _ of service.send("First message")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of service.send("Second message")) {}

    // Should have 4 artifacts: user1, agent1, user2, agent2
    let artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(4)

    // Truncate after index 1 (keep user1 + agent1)
    const removed = await service.truncateAfter(1)
    expect(removed).toBe(2)

    artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(2)

    // Verify storage is also truncated
    const stored = await storage.getArtifacts(service.currentSession!.id)
    expect(stored).toHaveLength(2)
  })

  test("returns 0 when truncating after last artifact", async () => {
    for await (const _ of service.send("Only message")) {}

    let artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(2)

    // Truncate after last artifact - nothing to remove
    const removed = await service.truncateAfter(1)
    expect(removed).toBe(0)

    artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(2)
  })

  test("throws error for invalid index", async () => {
    for await (const _ of service.send("Message")) {}

    await expect(service.truncateAfter(10)).rejects.toThrow("Invalid artifact index")
    await expect(service.truncateAfter(-1)).rejects.toThrow("Invalid artifact index")
  })

  test("throws error when no active session", async () => {
    // Create a new service without starting it
    const newService = createConversationService({
      projectId: TEST_PROJECT_ID,
      provider: createMockProvider(),
      storage,
      embedder: createMockEmbedder(),
    })

    await expect(newService.truncateAfter(0)).rejects.toThrow("No active session")
  })

  test("correctly truncates in middle of conversation", async () => {
    // Build up a longer conversation
    for await (const _ of service.send("Message 1")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of service.send("Message 2")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of service.send("Message 3")) {}

    // 6 artifacts: u1, a1, u2, a2, u3, a3
    let artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(6)

    // Truncate after index 2 (keep u1, a1, u2)
    const removed = await service.truncateAfter(2)
    expect(removed).toBe(3)

    artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(3)

    // Verify the right artifacts remain
    expect(artifacts[0].kind).toBe("user_input")
    expect(artifacts[1].kind).toBe("agent_response")
    expect(artifacts[2].kind).toBe("user_input")
  })

  test("getArtifacts returns empty array when no session", async () => {
    const newService = createConversationService({
      projectId: TEST_PROJECT_ID,
      provider: createMockProvider(),
      storage,
      embedder: createMockEmbedder(),
    })

    const artifacts = await newService.getArtifacts()
    expect(artifacts).toHaveLength(0)
  })

  test("getArtifacts always fetches fresh from storage", async () => {
    for await (const _ of service.send("Message")) {}

    // Get artifacts
    const artifacts1 = await service.getArtifacts()
    expect(artifacts1).toHaveLength(2)

    // Directly add to storage (simulating external modification)
    await storage.addArtifact(service.currentSession!.id, {
      kind: "user_input",
      content: "External",
      embedding: {
        vector: randomVector(),
        model: "test",
        dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
        createdAt: new Date(),
      },
      tokens: 5,
    })

    // getArtifacts should see the new artifact
    const artifacts2 = await service.getArtifacts()
    expect(artifacts2).toHaveLength(3)
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
    const service = await manager.createSession()
    const sessionId = service.currentSession!.id

    for await (const _ of service.send("First")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of service.send("Second")) {}

    let artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(4)

    // Truncate via manager
    const removed = await manager.truncateSession(sessionId, 1)
    expect(removed).toBe(2)

    // Verify the session is truncated
    const session = await manager.getSession(sessionId)
    artifacts = await session!.getArtifacts()
    expect(artifacts).toHaveLength(2)
  })

  test("returns null for non-existent session", async () => {
    const result = await manager.truncateSession("non-existent-id", 0)
    expect(result).toBeNull()
  })

  test("works with cached session", async () => {
    // Create session (gets cached)
    const service = await manager.createSession()
    const sessionId = service.currentSession!.id

    for await (const _ of service.send("Message")) {}

    // Access via manager again (should use cache)
    const cached = await manager.getSession(sessionId)
    expect(cached).toBe(service) // Same instance

    // Truncate should work on cached session
    const removed = await manager.truncateSession(sessionId, 0)
    expect(removed).toBe(1)

    const artifacts = await service.getArtifacts()
    expect(artifacts).toHaveLength(1)
  })

  test("works with loaded session from storage", async () => {
    // Create session
    const service = await manager.createSession()
    const sessionId = service.currentSession!.id

    for await (const _ of service.send("Message")) {}
    await new Promise((r) => setTimeout(r, 10))
    for await (const _ of service.send("Another")) {}

    // Evict from cache
    manager.evictSession(sessionId)

    // Truncate should load from storage and work
    const removed = await manager.truncateSession(sessionId, 1)
    expect(removed).toBe(2)

    // Verify via fresh load
    const loaded = await manager.getSession(sessionId)
    const artifacts = await loaded!.getArtifacts()
    expect(artifacts).toHaveLength(2)
  })
})
