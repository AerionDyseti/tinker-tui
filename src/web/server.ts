#!/usr/bin/env bun
/**
 * Tinker Web Server
 *
 * Serves the web UI and provides the chat API.
 * Uses Bun.serve() with HTML imports for React bundling.
 */

import { SessionManager } from "@/application/session-manager.ts"
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
 *
 * Session ID can be provided via:
 * - X-Session-ID header
 * - sessionId field in request body
 *
 * If no session ID is provided, creates a new session.
 * Returns the session ID in the X-Session-ID response header.
 */
async function handleChat(
  request: Request,
  sessionManager: SessionManager
): Promise<Response> {
  const body = await request.json() as { message: string; sessionId?: string }
  const { message } = body

  // Get session ID from header or body
  const sessionId = request.headers.get("X-Session-ID") || body.sessionId

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Get or create session
  const session = await sessionManager.getOrCreateSession(sessionId)
  const currentSessionId = session.currentSession?.id

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function sendEvent(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Send session ID as first event so client can track it
      if (currentSessionId) {
        sendEvent({ type: "session", sessionId: currentSessionId })
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

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  }

  // Include session ID in response header
  if (currentSessionId) {
    headers["X-Session-ID"] = currentSessionId
  }

  return new Response(stream, { headers })
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
  let currentProviderConfig = config.provider
  const provider = createProvider(currentProviderConfig)

  // Cleanup duplicate sessions from storage
  const duplicatesRemoved = await storage.cleanupDuplicateSessions()
  if (duplicatesRemoved > 0) {
    console.log(`Cleaned up ${duplicatesRemoved} duplicate session record(s)`)
  }

  console.log(`Provider: ${provider.info.name} (${provider.info.model})`)

  // Create session manager
  const sessionManager = new SessionManager(
    {
      projectId: project.id,
      storage,
      embedder,
      systemPrompt: "You are a helpful coding assistant. Be concise and clear.",
      workingDirectory: projectRoot,
      responseReserve: 1024,
    },
    provider
  )

  // Start server
  const server = Bun.serve({
    port,
    routes: {
      // Serve the web UI
      "/": index,

      // Chat API
      "/api/chat": {
        POST: (req) => handleChat(req, sessionManager),
      },

      // Session API
      "/api/session/new": {
        POST: async () => {
          const session = await sessionManager.createSession()
          return Response.json({
            sessionId: session.currentSession?.id,
          })
        },
      },

      "/api/sessions": {
        GET: async () => {
          const sessions = await sessionManager.listSessions()
          // Dedupe by ID (storage may have duplicates - see issue #10)
          const seen = new Set<string>()
          const unique = sessions.filter(s => {
            if (seen.has(s.id)) return false
            seen.add(s.id)
            return true
          })
          return Response.json({ sessions: unique })
        },
      },

      // Get messages for a session
      "/api/session/messages": {
        GET: async (req) => {
          const url = new URL(req.url)
          const id = url.searchParams.get("id")
          if (!id) {
            return Response.json({ error: "Missing session id" }, { status: 400 })
          }
          const artifacts = await storage.getArtifacts(id)
          // Convert to message format for frontend
          const messages = artifacts
            .filter(a => a.kind === "user_input" || a.kind === "agent_response")
            .map(a => ({
              role: a.kind === "user_input" ? "user" : "agent",
              content: a.content,
            }))
          return Response.json({ messages })
        },
      },

      // Truncate session after a specific message index
      "/api/session/truncate": {
        POST: async (req) => {
          const body = await req.json() as {
            sessionId: string
            afterIndex: number
          }
          if (!body.sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 })
          }
          if (typeof body.afterIndex !== "number") {
            return Response.json({ error: "Missing afterIndex" }, { status: 400 })
          }
          const removed = await sessionManager.truncateSession(
            body.sessionId,
            body.afterIndex
          )
          if (removed === null) {
            return Response.json({ error: "Session not found" }, { status: 404 })
          }
          return Response.json({ removed })
        },
      },

      // Settings API
      "/api/settings": {
        GET: () => Response.json({
          systemPrompt: sessionManager["config"].systemPrompt,
          provider: currentProviderConfig,
        }),
        PUT: async (req) => {
          const body = await req.json() as {
            systemPrompt?: string
            provider?: ProviderConfig
          }
          if (body.systemPrompt !== undefined) {
            sessionManager["config"].systemPrompt = body.systemPrompt
          }
          if (body.provider !== undefined) {
            currentProviderConfig = body.provider
            const newProvider = createProvider(body.provider)
            sessionManager.setProvider(newProvider)
            console.log(`Provider switched to: ${newProvider.info.name} (${newProvider.info.model})`)
          }
          return Response.json({
            systemPrompt: sessionManager["config"].systemPrompt,
            provider: currentProviderConfig,
          })
        },
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
