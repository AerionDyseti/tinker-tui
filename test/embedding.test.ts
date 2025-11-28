import { test, expect, beforeAll } from "bun:test"
import { MiniLMEmbedder, getDefaultEmbedder } from "@/embedding/index.ts"

// Note: First run downloads the model (~23MB), subsequent runs use cache

let embedder: MiniLMEmbedder

beforeAll(() => {
  embedder = new MiniLMEmbedder()
})

test("embedder has correct name and dimensions", () => {
  expect(embedder.name).toBe("minilm-l6-v2")
  expect(embedder.dimensions).toBe(384)
})

test("embeds a single text", async () => {
  const result = await embedder.embed("Hello, world!")

  expect(result.vector).toHaveLength(384)
  expect(result.embedder).toBe("minilm-l6-v2")
  expect(result.createdAt).toBeGreaterThan(0)

  // Vector should be normalized (L2 norm ≈ 1)
  const norm = Math.sqrt(result.vector.reduce((sum, v) => sum + v * v, 0))
  expect(norm).toBeCloseTo(1, 2)
})

test("embeds with type metadata", async () => {
  const result = await embedder.embed("Test message", "message")

  expect(result.type).toBe("message")
})

test("embeds batch of texts", async () => {
  const texts = ["First text", "Second text", "Third text"]
  const results = await embedder.embedBatch(texts)

  expect(results).toHaveLength(3)

  for (const result of results) {
    expect(result.vector).toHaveLength(384)
    expect(result.embedder).toBe("minilm-l6-v2")
  }
})

test("similar texts have similar embeddings", async () => {
  const [a, b, c] = await embedder.embedBatch([
    "The cat sat on the mat",
    "A cat was sitting on a mat",
    "I love programming in TypeScript",
  ])

  // Cosine similarity (vectors are normalized, so dot product = cosine)
  const simAB = dotProduct(a.vector, b.vector)
  const simAC = dotProduct(a.vector, c.vector)

  // Similar sentences should have higher similarity than unrelated
  expect(simAB).toBeGreaterThan(simAC)
  expect(simAB).toBeGreaterThan(0.8) // Should be quite similar
  expect(simAC).toBeLessThan(0.5) // Should be less similar
})

test("getDefaultEmbedder returns singleton", () => {
  const a = getDefaultEmbedder()
  const b = getDefaultEmbedder()

  expect(a).toBe(b)
})

// Helper: dot product of two vectors
function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}
