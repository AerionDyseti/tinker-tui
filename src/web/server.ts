#!/usr/bin/env bun
/**
 * Tinker Web Server
 *
 * Serves the web UI and provides the chat API.
 * Uses Bun.serve() with HTML imports for React bundling.
 */

import { ActiveSession } from "@/application/index.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import { detectProject } from "@/infrastructure/project/index.ts"
import { getDefaultEmbedder } from "@/infrastructure/embedding/index.ts"
import { OpenRouterProvider, DebugProvider } from "@/infrastructure/provider/index.ts"
import { ConfigService, type ProviderConfig } from "@/infrastructure/config/index.ts"
import type { Provider } from "@/domain/provider.ts"

// Import HTML file — Bun bundles this with React/CSS automatically
import index from "./index.html"

/**
 * Create a provider instance from config.
 */
function createProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case "openrouter":
      return new OpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })

    case "local":
      return new OpenRouterProvider({
        apiKey: "not-needed",
        model: config.model,
        baseUrl: config.baseUrl,
      })

    case "claude-code":
    default:
      return new DebugProvider({
        host: "localhost",
        port: 7331,
      })
  }
}

/**
 * Handle chat request — streams response as SSE.
 */
async function handleChat(
  request: Request,
  session: ActiveSession
): Promise<Response> {
  const { message } = await request.json() as { message: string }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function sendEvent(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const event of session.send(message)) {
          switch (event.type) {
            case "stream_chunk":
              sendEvent({ type: "chunk", content: event.content })
              break

            case "stream_end":
              if (event.usage) {
                sendEvent({
                  type: "usage",
                  prompt: event.usage.promptTokens,
                  completion: event.usage.completionTokens,
                  total: event.usage.totalTokens,
                })
              }
              break

            case "error":
              sendEvent({ type: "error", message: event.error.message })
              break
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      } catch (err) {
        sendEvent({ type: "error", message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

/**
 * Main entry point.
 */
async function main() {
  const projectRoot = process.cwd()
  const port = Number(process.env.PORT) || 3000

  console.log("Starting Tinker web server...")

  // Detect project
  const project = await detectProject(projectRoot)
  console.log(`Project: ${project.name} (${project.id.slice(0, 8)})`)

  // Load config
  const configService = new ConfigService(projectRoot)
  const config = await configService.load()

  // Initialize services
  const storage = await ProjectStorage.open(projectRoot)
  const embedder = getDefaultEmbedder()
  const provider = createProvider(config.provider)

  console.log(`Provider: ${provider.info.name} (${provider.info.model})`)

  // Create active session
  const session = new ActiveSession({
    projectId: project.id,
    provider,
    storage,
    embedder,
    systemPrompt: "You are a helpful coding assistant. Be concise and clear.",
    responseReserve: 1024,
  })

  // Start initial session
  await session.start()

  // Start server
  const server = Bun.serve({
    port,
    routes: {
      // Serve the web UI
      "/": index,

      // Chat API
      "/api/chat": {
        POST: (req) => handleChat(req, session),
      },

      // Health check
      "/api/health": {
        GET: () => Response.json({ status: "ok" }),
      },
    },
    development: {
      hmr: true,
      console: true,
    },
  })

  console.log(`\nTinker running at http://localhost:${server.port}`)

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...")
    storage.close()
    server.stop()
    process.exit(0)
  })
}

main().catch(console.error)
