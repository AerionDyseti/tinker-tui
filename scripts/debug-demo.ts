#!/usr/bin/env bun
/**
 * Demo script showing how to use the DebugProvider.
 *
 * Run in TWO terminals:
 *   Terminal 1: bun run debug-server
 *   Terminal 2: bun run scripts/debug-demo.ts
 */

import { DebugProvider } from "@/infrastructure/provider/index.ts"
import { ContextAssembler } from "@/infrastructure/context/index.ts"
import type { Message } from "@/domain/session.ts"
import type { Embedding } from "@/domain/shared.ts"

// Mock embedding (normally from MiniLMEmbedder)
function mockEmbedding(): Embedding {
  return {
    vector: Array(384).fill(0),
    model: "mock",
    dimensions: 384,
    createdAt: new Date(),
  }
}

// Create some test messages
const messages: Message[] = [
  {
    id: "1",
    sessionId: "demo",
    type: "user",
    content: "Hello! Can you help me with TypeScript?",
    tokens: 12,
    embedding: mockEmbedding(),
    timestamp: new Date(Date.now() - 60000),
  },
  {
    id: "2",
    sessionId: "demo",
    type: "assistant",
    content: "Of course! I'd be happy to help with TypeScript. What would you like to know?",
    tokens: 18,
    embedding: mockEmbedding(),
    timestamp: new Date(Date.now() - 30000),
  },
  {
    id: "3",
    sessionId: "demo",
    type: "user",
    content: "How do I create a generic function?",
    tokens: 9,
    embedding: mockEmbedding(),
    timestamp: new Date(),
  },
]

async function main() {
  console.log("🧪 Debug Provider Demo")
  console.log("=".repeat(40))

  // Assemble context
  const assembler = new ContextAssembler()
  const context = assembler.assemble(messages, {
    maxTokens: 4096,
    systemPrompt: "You are a helpful TypeScript expert. Be concise.",
    reservations: { response: 500 },
  })

  console.log(`\nAssembled context with ${context.items.length} messages`)
  console.log(`Tokens used: ${context.budget.used}/${context.budget.total}`)

  // Create debug provider and send
  const provider = new DebugProvider()

  console.log("\nSending to debug server...")

  try {
    for await (const chunk of provider.complete(context)) {
      if (chunk.content) {
        console.log(`\nReceived response: "${chunk.content}"`)
      }
      if (chunk.usage) {
        console.log(`Usage: ${chunk.usage.promptTokens} prompt + ${chunk.usage.completionTokens} completion = ${chunk.usage.totalTokens} total`)
      }
    }
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message)
    console.log("\nMake sure the debug server is running:")
    console.log("  bun run debug-server")
  }
}

main()
