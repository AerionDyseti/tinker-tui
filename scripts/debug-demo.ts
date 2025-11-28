#!/usr/bin/env bun
/**
 * Demo script showing how to use providers with the debug server.
 *
 * Run in TWO terminals:
 *   Terminal 1: bun run debug-server
 *   Terminal 2: bun run scripts/debug-demo.ts [native|openrouter]
 *
 * Modes:
 *   native     - Use DebugProvider (default)
 *   openrouter - Use real OpenRouterProvider pointed at debug server
 */

import { DebugProvider, OpenRouterProvider } from "@/infrastructure/provider/index.ts"
import { ContextAssembler } from "@/infrastructure/context/index.ts"
import type { Provider } from "@/domain/provider.ts"
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
  const mode = process.argv[2] ?? "native"

  console.log("🧪 Debug Provider Demo")
  console.log("=".repeat(40))
  console.log(`Mode: ${mode}`)

  // Assemble context
  const assembler = new ContextAssembler()
  const context = assembler.assemble(messages, {
    maxTokens: 4096,
    systemPrompt: "You are a helpful TypeScript expert. Be concise.",
    reservations: { response: 500 },
  })

  console.log(`\nAssembled context with ${context.items.length} messages`)
  console.log(`Tokens used: ${context.budget.used}/${context.budget.total}`)

  // Create provider based on mode
  let provider: Provider

  if (mode === "openrouter") {
    // Use REAL OpenRouterProvider, but pointed at our debug server
    provider = new OpenRouterProvider({
      apiKey: "fake-key-for-debug",
      model: "debug/test-model",
      baseUrl: "http://localhost:7331/v1", // ← debug server!
    })
    console.log("\nUsing OpenRouterProvider → debug server")
    console.log("(This tests the REAL provider code path)")
  } else {
    // Native DebugProvider
    provider = new DebugProvider()
    console.log("\nUsing DebugProvider (native format)")
  }

  console.log("\nSending to debug server...")

  try {
    let fullResponse = ""
    for await (const chunk of provider.complete(context)) {
      if (chunk.content) {
        fullResponse += chunk.content
        // Show streaming progress
        process.stdout.write(chunk.content)
      }
      if (chunk.done && chunk.usage) {
        console.log(`\n\nUsage: ${chunk.usage.promptTokens} prompt + ${chunk.usage.completionTokens} completion = ${chunk.usage.totalTokens} total`)
      }
    }
    if (fullResponse && mode === "native") {
      // Native mode returns all at once
      console.log(`\nReceived: "${fullResponse}"`)
    }
  } catch (err) {
    console.error("\n❌ Error:", (err as Error).message)
    console.log("\nMake sure the debug server is running:")
    console.log("  bun run debug-server")
  }
}

main()
