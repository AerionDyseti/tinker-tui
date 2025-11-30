/**
 * Simulation runner — two LLMs chatting.
 * No ActiveSession integration yet, just raw conversation.
 */

import type { SimulationConfig } from "./config.ts"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface LLMProvider {
  complete(messages: Message[], systemPrompt?: string): Promise<string>
}

/** Retry config */
const MAX_RETRIES = 5
const INITIAL_BACKOFF_MS = 2000

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Wrap a provider with retry logic */
function withRetry(provider: LLMProvider, label: string): LLMProvider {
  return {
    async complete(messages, systemPrompt) {
      let lastError: Error | null = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await provider.complete(messages, systemPrompt)
        } catch (err) {
          lastError = err as Error
          const isRateLimit = lastError.message.includes("429")
          if (!isRateLimit) {
            throw lastError // Don't retry non-rate-limit errors
          }
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
          console.log(`[${label}] Rate limited, retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`)
          await sleep(backoff)
        }
      }
      throw lastError
    },
  }
}

/** Log context in a readable format */
function logContext(label: string, messages: Message[], systemPrompt?: string): void {
  console.log(`\n┌─ ${label} Context ─────────────────────────────────`)
  if (systemPrompt) {
    console.log(`│ [system] ${systemPrompt.slice(0, 100)}${systemPrompt.length > 100 ? "..." : ""}`)
  }
  for (const msg of messages) {
    const prefix = msg.role === "user" ? "[user]" : "[asst]"
    const content = msg.content.slice(0, 80).replace(/\n/g, " ")
    console.log(`│ ${prefix} ${content}${msg.content.length > 80 ? "..." : ""}`)
  }
  console.log(`└${"─".repeat(50)}`)
}

/**
 * Create an Ollama provider.
 */
function createOllamaProvider(model: string): LLMProvider {
  return {
    async complete(messages, systemPrompt) {
      const ollamaMessages = systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }, ...messages]
        : messages

      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${await response.text()}`)
      }

      const data = await response.json()
      return data.message?.content ?? ""
    },
  }
}

/**
 * Create an OpenRouter provider.
 */
function createOpenRouterProvider(model: string): LLMProvider {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set")
  }

  return {
    async complete(messages, systemPrompt) {
      const openRouterMessages = systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }, ...messages]
        : messages

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: openRouterMessages,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content ?? ""
    },
  }
}

function createProvider(type: "ollama" | "openrouter", model: string): LLMProvider {
  switch (type) {
    case "ollama":
      return createOllamaProvider(model)
    case "openrouter":
      return createOpenRouterProvider(model)
  }
}

/** A snapshot of context sent to a model */
interface ContextSnapshot {
  turn: number
  speaker: "user" | "agent"
  model: string
  systemPrompt?: string
  messages: Message[]
  response: string
  timestamp: number
}

export interface SimulationResult {
  name: string
  turns: number
  messages: Message[]
  contextSnapshots: ContextSnapshot[]
  duration: number
}

/**
 * Run a simulation.
 */
export async function runSimulation(config: SimulationConfig): Promise<SimulationResult> {
  const userProvider = withRetry(
    createProvider(config.user.provider, config.user.model),
    `User/${config.user.model}`
  )
  const agentProvider = withRetry(
    createProvider(config.agent.provider, config.agent.model),
    `Agent/${config.agent.model}`
  )

  const messages: Message[] = []
  const contextSnapshots: ContextSnapshot[] = []
  const startTime = Date.now()

  // Opening message (user kicks off)
  const opening = config.opening ?? "Hello! Let's have a conversation."

  if (config.output?.console) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`Simulation: ${config.name ?? "unnamed"}`)
    console.log(`User: ${config.user.provider}/${config.user.model}`)
    console.log(`Agent: ${config.agent.provider}/${config.agent.model}`)
    console.log(`Turns: ${config.turns}`)
    console.log(`${"─".repeat(60)}\n`)
  }

  // First user message
  messages.push({ role: "user", content: opening })
  if (config.output?.console) {
    console.log(`[User] ${opening}\n`)
  }

  for (let turn = 0; turn < config.turns; turn++) {
    // Agent responds
    const agentContext = [...messages] // snapshot before response
    if (config.output?.logContext) {
      logContext("Agent", agentContext, config.agent.systemPrompt)
    }
    const agentResponse = await agentProvider.complete(agentContext, config.agent.systemPrompt)
    messages.push({ role: "assistant", content: agentResponse })

    contextSnapshots.push({
      turn,
      speaker: "agent",
      model: config.agent.model,
      systemPrompt: config.agent.systemPrompt,
      messages: agentContext,
      response: agentResponse,
      timestamp: Date.now(),
    })

    if (config.output?.console) {
      console.log(`[Agent] ${agentResponse}\n`)
    }

    // User responds (except on last turn)
    if (turn < config.turns - 1) {
      // For user LLM, we flip the perspective: agent messages become "user" and vice versa
      const flippedMessages = messages.map((m) => ({
        role: (m.role === "user" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }))

      if (config.output?.logContext) {
        logContext("User", flippedMessages, config.user.systemPrompt)
      }
      const userResponse = await userProvider.complete(flippedMessages, config.user.systemPrompt)
      messages.push({ role: "user", content: userResponse })

      contextSnapshots.push({
        turn,
        speaker: "user",
        model: config.user.model,
        systemPrompt: config.user.systemPrompt,
        messages: flippedMessages,
        response: userResponse,
        timestamp: Date.now(),
      })

      if (config.output?.console) {
        console.log(`[User] ${userResponse}\n`)
      }
    }
  }

  const duration = Date.now() - startTime

  if (config.output?.console) {
    console.log(`${"─".repeat(60)}`)
    console.log(`Completed in ${(duration / 1000).toFixed(1)}s`)
    console.log(`${"─".repeat(60)}\n`)
  }

  // Save context dump if configured
  if (config.output?.contextDump) {
    await saveContextDump(contextSnapshots, config.output.contextDump)
    console.log(`Context dump saved: ${config.output.contextDump}`)
  }

  return {
    name: config.name ?? "unnamed",
    turns: config.turns,
    messages,
    contextSnapshots,
    duration,
  }
}

/**
 * Save full context dump as JSON.
 */
async function saveContextDump(snapshots: ContextSnapshot[], path: string): Promise<void> {
  await Bun.write(path, JSON.stringify(snapshots, null, 2))
}

/**
 * Save transcript to file.
 */
export async function saveTranscript(result: SimulationResult, path: string): Promise<void> {
  const lines = [
    `# Simulation: ${result.name}`,
    ``,
    `**Turns:** ${result.turns}`,
    `**Duration:** ${(result.duration / 1000).toFixed(1)}s`,
    ``,
    `---`,
    ``,
  ]

  for (const msg of result.messages) {
    const speaker = msg.role === "user" ? "User" : "Agent"
    lines.push(`**${speaker}:**`)
    lines.push(msg.content)
    lines.push(``)
  }

  await Bun.write(path, lines.join("\n"))
}
