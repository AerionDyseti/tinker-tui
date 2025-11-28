#!/usr/bin/env bun
/**
 * Debug Server — A mock LLM endpoint for testing context assembly.
 *
 * Run in a separate terminal:
 *   bun run src/tools/debug-server.ts
 *
 * The server:
 * 1. Receives POST /complete with context JSON
 * 2. Pretty-prints the context to the console
 * 3. Prompts for a manual response
 * 4. Returns the typed response
 */

import * as readline from "readline"

const DEFAULT_PORT = 7331

// ANSI colors for pretty output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
}

const c = (color: keyof typeof colors, text: string) => `${colors[color]}${text}${colors.reset}`

/** Context item shape from the provider */
interface ContextItemData {
  type: string
  content: string
  tokens: number
  source?: {
    type: string
    message?: { type: string }
  }
}

/** Request body shape */
interface RequestBody {
  systemPrompt?: string
  items?: ContextItemData[]
  budget?: {
    total: number
    used: number
    available: number
    reserved?: Record<string, number>
  }
  options?: {
    maxTokens?: number
    temperature?: number
  }
}

/**
 * Format a context item for display.
 */
function formatContextItem(item: ContextItemData): string {
  const role = item.source?.message?.type ?? item.source?.type ?? item.type
  const roleColor = {
    user: "cyan",
    assistant: "green",
    system: "yellow",
    knowledge: "magenta",
    tool: "blue",
  }[role] ?? "gray"

  const prefix = c(roleColor as keyof typeof colors, `[${role}]`)
  const tokens = c("dim", `(${item.tokens} tok)`)

  // Truncate long content
  const maxLen = 200
  const content = item.content.length > maxLen
    ? item.content.slice(0, maxLen) + c("dim", "...")
    : item.content

  return `  ${prefix} ${tokens} ${content}`
}

/**
 * Pretty-print the received context.
 */
function printContext(body: RequestBody): void {
  console.log("\n" + c("bold", "═".repeat(60)))
  console.log(c("bold", " CONTEXT RECEIVED"))
  console.log(c("bold", "═".repeat(60)))

  // System prompt
  if (body.systemPrompt) {
    console.log(c("yellow", "\n[System Prompt]"))
    const lines = body.systemPrompt.split("\n").slice(0, 5)
    for (const line of lines) {
      console.log(c("dim", "  " + line.slice(0, 100)))
    }
    if (body.systemPrompt.split("\n").length > 5) {
      console.log(c("dim", "  ..."))
    }
  }

  // Messages/Items
  if (body.items && body.items.length > 0) {
    console.log(c("cyan", `\n[Messages] (${body.items.length} items)`))
    for (const item of body.items) {
      console.log(formatContextItem(item))
    }
  }

  // Budget info
  if (body.budget) {
    console.log(c("blue", "\n[Token Budget]"))
    console.log(`  Total: ${body.budget.total}`)
    console.log(`  Used: ${body.budget.used}`)
    console.log(`  Available: ${body.budget.available}`)
    if (body.budget.reserved) {
      const reservations = Object.entries(body.budget.reserved)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
      if (reservations) {
        console.log(`  Reserved: ${reservations}`)
      }
    }
  }

  // Options
  if (body.options) {
    console.log(c("gray", "\n[Options]"))
    if (body.options.maxTokens) console.log(`  maxTokens: ${body.options.maxTokens}`)
    if (body.options.temperature) console.log(`  temperature: ${body.options.temperature}`)
  }

  console.log(c("bold", "\n" + "─".repeat(60)))
}

/**
 * Prompt for user input via readline.
 */
async function promptForResponse(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    console.log(c("green", "\n> Enter response (empty line to send):"))
    const lines: string[] = []

    const prompt = () => {
      rl.question(c("dim", "  "), (line) => {
        if (line === "") {
          rl.close()
          resolve(lines.join("\n"))
        } else {
          lines.push(line)
          prompt()
        }
      })
    }

    prompt()
  })
}

/**
 * Start the debug server.
 */
async function main() {
  const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT))

  console.log(c("bold", `\n🔧 Debug Server starting on port ${port}`))
  console.log(c("dim", "   Waiting for requests from tinker-tui...\n"))

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)

      // Health check
      if (url.pathname === "/health") {
        return new Response("ok")
      }

      // Complete endpoint
      if (url.pathname === "/complete" && req.method === "POST") {
        try {
          const body = (await req.json()) as RequestBody

          // Print the context
          printContext(body)

          // Prompt for response
          const response = await promptForResponse()

          console.log(c("dim", `\n← Sending response (${response.length} chars)\n`))

          return Response.json({
            content: response,
            usage: {
              promptTokens: body.budget?.used ?? 0,
              completionTokens: Math.ceil(response.length / 4),
              totalTokens: (body.budget?.used ?? 0) + Math.ceil(response.length / 4),
            },
          })
        } catch (err) {
          console.error("Error processing request:", err)
          return new Response("Error processing request", { status: 500 })
        }
      }

      return new Response("Not found", { status: 404 })
    },
  })

  console.log(c("green", `✓ Listening on http://localhost:${server.port}`))
  console.log(c("dim", "  POST /complete - Send context, get response"))
  console.log(c("dim", "  GET /health    - Health check\n"))
}

main().catch(console.error)
