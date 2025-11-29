#!/usr/bin/env bun
/**
 * Debug Server — A mock LLM endpoint for testing providers.
 *
 * Usage:
 *   bun run debug-server           # Formatted output (default)
 *   bun run debug-server --raw     # Raw JSON output
 *
 * Endpoints:
 *   POST /complete            - Native DebugProvider format
 *   POST /v1/chat/completions - OpenAI-compatible format (SSE)
 *   GET  /health              - Health check
 *
 * To test OpenRouterProvider against this server:
 *   const provider = new OpenRouterProvider({
 *     apiKey: "fake",
 *     model: "test",
 *     baseUrl: "http://localhost:7331/v1",
 *   })
 */

import * as readline from "readline"

const DEFAULT_PORT = 7331

// Parse CLI flags
const args = process.argv.slice(2)
const rawJson = args.includes("--raw") || args.includes("--rawJson")

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

/** Context item shape from DebugProvider */
interface ContextItemData {
  type: string
  content: string
  tokens: number
  source?: {
    type: string
    message?: { type: string }
  }
}

/** Request body shape for DebugProvider */
interface NativeRequestBody {
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

/** OpenAI message format */
interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  name?: string
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** OpenAI chat completion request */
interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string[]
  tools?: Array<{
    type: "function"
    function: { name: string; description: string; parameters: unknown }
  }>
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
 * Pretty-print native DebugProvider context.
 */
function printNativeContext(body: NativeRequestBody): void {
  console.log("\n" + c("bold", "═".repeat(60)))
  console.log(c("bold", " CONTEXT RECEIVED (Native Format)"))
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
 * Pretty-print OpenAI-format request.
 */
function printOpenAIRequest(body: OpenAIRequest): void {
  console.log("\n" + c("bold", "═".repeat(60)))
  console.log(c("bold", " OPENAI REQUEST RECEIVED"))
  console.log(c("bold", "═".repeat(60)))

  // Model info
  console.log(c("magenta", `\n[Model] ${body.model}`))

  // Options
  const opts: string[] = []
  if (body.stream) opts.push("stream=true")
  if (body.max_tokens) opts.push(`max_tokens=${body.max_tokens}`)
  if (body.temperature) opts.push(`temperature=${body.temperature}`)
  if (body.top_p) opts.push(`top_p=${body.top_p}`)
  if (opts.length > 0) {
    console.log(c("gray", `[Options] ${opts.join(", ")}`))
  }

  // Tools
  if (body.tools && body.tools.length > 0) {
    console.log(c("blue", `\n[Tools] (${body.tools.length} defined)`))
    for (const tool of body.tools) {
      console.log(c("dim", `  - ${tool.function.name}: ${tool.function.description.slice(0, 60)}...`))
    }
  }

  // Messages
  console.log(c("cyan", `\n[Messages] (${body.messages.length} total)`))
  for (const msg of body.messages) {
    const roleColor = {
      system: "yellow",
      user: "cyan",
      assistant: "green",
      tool: "blue",
    }[msg.role] ?? "gray"

    const prefix = c(roleColor as keyof typeof colors, `[${msg.role}]`)

    // Handle different message types
    if (msg.tool_calls) {
      console.log(`  ${prefix} ${c("dim", "[tool_calls]")}`)
      for (const tc of msg.tool_calls) {
        console.log(c("dim", `    → ${tc.function.name}(${tc.function.arguments.slice(0, 50)}...)`))
      }
    } else if (msg.tool_call_id) {
      console.log(`  ${prefix} ${c("dim", `[tool_call_id: ${msg.tool_call_id}]`)}`)
      const content = msg.content?.slice(0, 100) ?? ""
      console.log(c("dim", `    ${content}`))
    } else {
      const content = msg.content ?? ""
      const truncated = content.length > 150 ? content.slice(0, 150) + "..." : content
      // Handle multiline
      const firstLine = truncated.split("\n")[0]
      console.log(`  ${prefix} ${firstLine}`)
      if (truncated.includes("\n")) {
        console.log(c("dim", "    (multiline content)"))
      }
    }
  }

  console.log(c("bold", "\n" + "─".repeat(60)))
}

/**
 * Create SSE stream response for OpenAI format.
 */
function createSSEStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = content.split(" ") // Simple word-by-word streaming

  return new ReadableStream({
    async start(controller) {
      // Send content chunks
      for (let i = 0; i < chunks.length; i++) {
        const text = i === 0 ? chunks[i] : " " + chunks[i]
        const chunk = {
          id: "debug-" + Date.now(),
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "debug",
          choices: [{
            index: 0,
            delta: { content: text },
            finish_reason: null,
          }],
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
        // Small delay for realistic streaming feel
        await new Promise((r) => setTimeout(r, 20))
      }

      // Send final chunk with finish_reason
      const finalChunk = {
        id: "debug-" + Date.now(),
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "debug",
        choices: [{
          index: 0,
          delta: {},
          finish_reason: "stop",
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: Math.ceil(content.length / 4),
          total_tokens: Math.ceil(content.length / 4),
        },
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`))
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
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
  console.log(c("dim", "   Waiting for requests from tinker-ui..."))
  console.log(c("dim", `   Display mode: ${rawJson ? "RAW JSON" : "FORMATTED"} (use --raw flag to change)\n`))

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)

      // Health check
      if (url.pathname === "/health") {
        return new Response("ok")
      }

      // Native DebugProvider endpoint
      if (url.pathname === "/complete" && req.method === "POST") {
        try {
          const body = (await req.json()) as NativeRequestBody

          // Print the context
          if (rawJson) {
            console.log("\n" + c("bold", "═".repeat(60)))
            console.log(c("bold", " RAW JSON (Native)"))
            console.log(c("bold", "═".repeat(60)))
            console.log(JSON.stringify(body, null, 2))
            console.log(c("bold", "─".repeat(60)))
          } else {
            printNativeContext(body)
          }

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

      // OpenAI-compatible endpoint (for OpenRouterProvider, etc.)
      if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
        try {
          const body = (await req.json()) as OpenAIRequest

          // Print the OpenAI request
          if (rawJson) {
            console.log("\n" + c("bold", "═".repeat(60)))
            console.log(c("bold", " RAW JSON (OpenAI Format)"))
            console.log(c("bold", "═".repeat(60)))
            console.log(JSON.stringify(body, null, 2))
            console.log(c("bold", "─".repeat(60)))
          } else {
            printOpenAIRequest(body)
          }

          // Prompt for response
          const response = await promptForResponse()

          console.log(c("dim", `\n← Sending SSE response (${response.length} chars)\n`))

          // Return SSE stream
          return new Response(createSSEStream(response), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          })
        } catch (err) {
          console.error("Error processing OpenAI request:", err)
          return Response.json(
            { error: { message: "Error processing request", type: "server_error" } },
            { status: 500 }
          )
        }
      }

      return new Response("Not found", { status: 404 })
    },
  })

  console.log(c("green", `✓ Listening on http://localhost:${server.port}`))
  console.log(c("dim", "  POST /complete            - Native DebugProvider format"))
  console.log(c("dim", "  POST /v1/chat/completions - OpenAI-compatible format"))
  console.log(c("dim", "  GET  /health              - Health check\n"))
}

main().catch(console.error)
