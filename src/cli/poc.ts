#!/usr/bin/env bun
/**
 * POC CLI — A minimal proof-of-concept chat interface.
 *
 * Usage:
 *   bun run src/cli/poc.ts [--provider openrouter|debug] [--model <model>]
 *
 * Examples:
 *   bun run src/cli/poc.ts                           # Uses debug provider
 *   bun run src/cli/poc.ts --provider openrouter     # Uses OpenRouter
 *   bun run src/cli/poc.ts --provider debug          # Uses debug server
 *
 * For debug mode, run the debug server first:
 *   bun run debug-server
 */

import * as readline from "readline"
import { ConversationService } from "@/application/index.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import { getDefaultEmbedder } from "@/infrastructure/embedding/index.ts"
import { OpenRouterProvider, DebugProvider } from "@/infrastructure/provider/index.ts"
import type { Provider } from "@/domain/provider.ts"

// ANSI colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
}

/**
 * Parse command line arguments.
 */
function parseArgs(): { provider: string; model?: string } {
  const args = process.argv.slice(2)
  let provider = "debug"
  let model: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--provider" && args[i + 1]) {
      provider = args[++i]!
    } else if (arg === "--model" && args[i + 1]) {
      model = args[++i]
    }
  }

  return { provider, model }
}

/**
 * Create provider based on CLI args.
 */
function createProvider(args: { provider: string; model?: string }): Provider {
  switch (args.provider) {
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        console.error(`${c.red}Error: OPENROUTER_API_KEY environment variable required${c.reset}`)
        process.exit(1)
      }
      return new OpenRouterProvider({
        apiKey,
        model: args.model ?? "anthropic/claude-3.5-haiku",
      })
    }

    case "debug":
    default:
      return new DebugProvider({
        host: "localhost",
        port: 7331,
      })
  }
}

/**
 * Print the welcome banner.
 */
function printBanner(provider: Provider) {
  console.log()
  console.log(`${c.bold}${c.cyan}╭─────────────────────────────────────╮${c.reset}`)
  console.log(`${c.bold}${c.cyan}│   tinker-tui POC CLI                │${c.reset}`)
  console.log(`${c.bold}${c.cyan}╰─────────────────────────────────────╯${c.reset}`)
  console.log()
  console.log(`${c.dim}Provider: ${c.reset}${provider.info.name}`)
  console.log(`${c.dim}Model:    ${c.reset}${provider.info.model}`)
  console.log()
  console.log(`${c.dim}Commands:${c.reset}`)
  console.log(`  ${c.yellow}/quit${c.reset}  - Exit the CLI`)
  console.log(`  ${c.yellow}/clear${c.reset} - Start a new session`)
  console.log(`  ${c.yellow}/info${c.reset}  - Show session info`)
  console.log()
}

/**
 * Main CLI loop.
 */
async function main() {
  const args = parseArgs()

  // Initialize components
  console.log(`${c.dim}Initializing...${c.reset}`)

  const provider = createProvider(args)
  const storage = await ProjectStorage.open(process.cwd())
  const embedder = getDefaultEmbedder()

  // Create conversation service
  const service = new ConversationService({
    provider,
    storage,
    embedder,
    systemPrompt: "You are a helpful assistant. Be concise and clear.",
    responseReserve: 1024,
  })

  // Start session
  await service.startSession()

  printBanner(provider)

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = () => {
    rl.question(`${c.cyan}You: ${c.reset}`, async (input) => {
      const trimmed = input.trim()

      // Handle commands
      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log(`\n${c.dim}Goodbye!${c.reset}\n`)
        rl.close()
        storage.close()
        process.exit(0)
      }

      if (trimmed === "/clear") {
        await service.startSession()
        console.log(`${c.yellow}Started new session${c.reset}\n`)
        prompt()
        return
      }

      if (trimmed === "/info") {
        const session = service.currentSession
        const messages = service.currentMessages
        console.log(`${c.magenta}Session:${c.reset} ${session?.id ?? "none"}`)
        console.log(`${c.magenta}Messages:${c.reset} ${messages.length}`)
        console.log()
        prompt()
        return
      }

      if (!trimmed) {
        prompt()
        return
      }

      // Process chat
      try {
        process.stdout.write(`${c.green}Assistant: ${c.reset}`)

        for await (const event of service.chat(trimmed)) {
          switch (event.type) {
            case "stream_chunk":
              process.stdout.write(event.content)
              break

            case "stream_end":
              console.log() // newline after response
              if (event.usage) {
                console.log(
                  `${c.dim}[${event.usage.promptTokens} prompt + ${event.usage.completionTokens} completion = ${event.usage.totalTokens} tokens]${c.reset}`
                )
              }
              console.log()
              break

            case "error":
              console.log(`\n${c.red}Error: ${event.error.message}${c.reset}\n`)
              break
          }
        }
      } catch (err) {
        console.log(`\n${c.red}Error: ${(err as Error).message}${c.reset}\n`)
      }

      prompt()
    })
  }

  prompt()
}

main().catch((err) => {
  console.error(`${c.red}Fatal error:${c.reset}`, err)
  process.exit(1)
})
