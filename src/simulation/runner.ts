/**
 * Simulation runner — two LLMs chatting.
 * Supports both raw mode and integrated mode (with ActiveSession).
 */

import type { SimulationConfig } from "./config.ts"
import type { SessionArtifact } from "@/domain/artifact.ts"
import type { Context } from "@/domain/context.ts"

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
  speaker: "human" | "llm"
  model: string
  systemPrompt?: string
  messages: Message[]
  response: string
  timestamp: number
}

/** Context assembly metadata for integrated mode */
interface ContextMetadata {
  turn: number
  artifactsIncluded: number
  artifactsFiltered: number
  tokensUsed: number
  tokensAvailable: number
}

export interface SimulationResult {
  name: string
  turns: number
  messages: Message[]
  contextSnapshots: ContextSnapshot[]
  /** Only populated in integrated mode */
  artifacts?: {
    llm: SessionArtifact[]
    human?: SessionArtifact[]
  }
  /** Only populated in integrated mode */
  contextMetadata?: ContextMetadata[]
  sessionId?: {
    llm: string
    human?: string
  }
  duration: number
}

/**
 * Run a simulation.
 */
export async function runSimulation(config: SimulationConfig): Promise<SimulationResult> {
  const humanProvider = withRetry(
    createProvider(config.human.provider, config.human.model),
    `Human/${config.human.model}`
  )
  const llmProvider = withRetry(
    createProvider(config.llm.provider, config.llm.model),
    `LLM/${config.llm.model}`
  )

  const messages: Message[] = []
  const contextSnapshots: ContextSnapshot[] = []
  const startTime = Date.now()

  // Opening message (human kicks off)
  const opening = config.opening ?? "Hello! Let's have a conversation."

  if (config.output?.console) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`Simulation: ${config.name ?? "unnamed"}`)
    console.log(`Human: ${config.human.provider}/${config.human.model}`)
    console.log(`LLM: ${config.llm.provider}/${config.llm.model}`)
    console.log(`Turns: ${config.turns}`)
    console.log(`${"─".repeat(60)}\n`)
  }

  // First human message
  messages.push({ role: "user", content: opening })
  if (config.output?.console) {
    console.log(`______HUMAN______\n${opening}\n`)
  }

  for (let turn = 0; turn < config.turns; turn++) {
    // LLM responds
    const llmContext = [...messages] // snapshot before response
    if (config.output?.logContext) {
      logContext("LLM", llmContext, config.llm.systemPrompt)
    }
    const llmResponse = await llmProvider.complete(llmContext, config.llm.systemPrompt)
    messages.push({ role: "assistant", content: llmResponse })

    contextSnapshots.push({
      turn,
      speaker: "llm",
      model: config.llm.model,
      systemPrompt: config.llm.systemPrompt,
      messages: llmContext,
      response: llmResponse,
      timestamp: Date.now(),
    })

    if (config.output?.console) {
      console.log(`______LLM______\n${llmResponse}\n`)
    }

    // Human responds (except on last turn)
    if (turn < config.turns - 1) {
      // For human LLM, we flip the perspective: llm messages become "user" and vice versa
      const flippedMessages = messages.map((m) => ({
        role: (m.role === "user" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }))

      if (config.output?.logContext) {
        logContext("Human", flippedMessages, config.human.systemPrompt)
      }
      const humanResponse = await humanProvider.complete(flippedMessages, config.human.systemPrompt)
      messages.push({ role: "user", content: humanResponse })

      contextSnapshots.push({
        turn,
        speaker: "human",
        model: config.human.model,
        systemPrompt: config.human.systemPrompt,
        messages: flippedMessages,
        response: humanResponse,
        timestamp: Date.now(),
      })

      if (config.output?.console) {
        console.log(`______HUMAN______\n${humanResponse}\n`)
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
    result.sessionId ? `**Session ID:** ${result.sessionId}` : "",
    ``,
    `---`,
    ``,
  ]

  for (const msg of result.messages) {
    const marker = msg.role === "user" ? "______HUMAN______" : "______LLM______"
    lines.push(marker)
    lines.push(msg.content)
    lines.push(``)
  }

  // Add context metadata if available
  if (result.contextMetadata?.length) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## Context Assembly Metrics`)
    lines.push(``)
    lines.push(`| Turn | Included | Filtered | Tokens Used | Available |`)
    lines.push(`|------|----------|----------|-------------|-----------|`)
    for (const meta of result.contextMetadata) {
      lines.push(`| ${meta.turn} | ${meta.artifactsIncluded} | ${meta.artifactsFiltered} | ${meta.tokensUsed} | ${meta.tokensAvailable} |`)
    }
    lines.push(``)
  }

  // Add artifact summary if available
  if (result.artifacts?.llm?.length) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## LLM Artifacts`)
    lines.push(``)
    lines.push(`| # | Kind | Tokens | Content Preview |`)
    lines.push(`|---|------|--------|-----------------|`)
    for (let i = 0; i < result.artifacts.llm.length; i++) {
      const a = result.artifacts.llm[i]!
      const preview = ('content' in a ? (a as { content: string }).content : JSON.stringify(a)).slice(0, 40).replace(/\n/g, " ")
      lines.push(`| ${i + 1} | ${a.kind} | ${a.tokens} | ${preview}... |`)
    }
    lines.push(``)
  }

  if (result.artifacts?.human?.length) {
    lines.push(`## Human Artifacts`)
    lines.push(``)
    lines.push(`| # | Kind | Tokens | Content Preview |`)
    lines.push(`|---|------|--------|-----------------|`)
    for (let i = 0; i < result.artifacts.human.length; i++) {
      const a = result.artifacts.human[i]!
      const preview = ('content' in a ? (a as { content: string }).content : JSON.stringify(a)).slice(0, 40).replace(/\n/g, " ")
      lines.push(`| ${i + 1} | ${a.kind} | ${a.tokens} | ${preview}... |`)
    }
    lines.push(``)
  }

  await Bun.write(path, lines.join("\n"))
}

/**
 * Run an integrated simulation using ActiveSession.
 * This exercises the full domain layer: storage, embeddings, context assembly.
 *
 * With dualSession=true, both human and llm have their own sessions,
 * useful for testing roleplay/creative scenarios.
 */
export async function runIntegratedSimulation(config: SimulationConfig): Promise<SimulationResult> {
  // Dynamic imports to avoid circular dependencies
  const { ActiveSession } = await import("@/application/active-session.ts")
  const { ProjectStorage } = await import("@/infrastructure/persistence/project-storage.ts")
  const { getDefaultEmbedder } = await import("@/infrastructure/embedding/index.ts")
  const { OpenRouterProvider } = await import("@/infrastructure/provider/openrouter.ts")
  const { detectProject } = await import("@/infrastructure/project/project.ts")

  const projectDir = config.integrate?.projectDir ?? process.cwd()
  const project = await detectProject(projectDir)
  const dualSession = config.integrate?.dualSession ?? false

  console.log(`\n${"─".repeat(60)}`)
  console.log(`Integrated Simulation: ${config.name ?? "unnamed"}`)
  console.log(`Project: ${project.name} (${project.id.slice(0, 8)})`)
  console.log(`Mode: ${dualSession ? "Dual Session (both sides)" : "Single Session (llm only)"}`)
  console.log(`Human: ${config.human.provider}/${config.human.model}`)
  console.log(`LLM: ${config.llm.provider}/${config.llm.model}`)
  console.log(`Turns: ${config.turns}`)
  console.log(`${"─".repeat(60)}\n`)

  // Initialize infrastructure
  const storage = await ProjectStorage.open(projectDir)

  const embedder = await getDefaultEmbedder()
  const maxContextTokens = config.integrate?.maxContextTokens ?? 4000

  // Create llm provider and session (with retry for rate limits)
  const llmProvider = new OpenRouterProvider({
    model: config.llm.model,
    apiKey: process.env.OPENROUTER_API_KEY!,
    retry: { maxAttempts: 5, initialDelayMs: 2000, maxDelayMs: 32000 },
  })

  const llmSession = new ActiveSession({
    projectId: project.id,
    provider: llmProvider,
    storage,
    embedder,
    systemPrompt: config.llm.systemPrompt ?? "You are a helpful assistant.",
    maxContextTokens,
  })

  await llmSession.start(`Simulation [LLM]: ${config.name ?? "unnamed"}`)

  // Create human session if dual mode
  let humanSession: InstanceType<typeof ActiveSession> | null = null
  if (dualSession) {
    const humanProvider = new OpenRouterProvider({
      model: config.human.model,
      apiKey: process.env.OPENROUTER_API_KEY!,
      retry: { maxAttempts: 5, initialDelayMs: 2000, maxDelayMs: 32000 },
    })

    humanSession = new ActiveSession({
      projectId: project.id,
      provider: humanProvider,
      storage,
      embedder,
      systemPrompt: config.human.systemPrompt ?? "You are a curious human.",
      maxContextTokens,
    })

    await humanSession.start(`Simulation [Human]: ${config.name ?? "unnamed"}`)
  }

  // Fallback to raw LLM for human if not dual session
  const humanLLM = !dualSession
    ? withRetry(
        createProvider(config.human.provider, config.human.model),
        `Human/${config.human.model}`
      )
    : null

  const messages: Message[] = []
  const contextSnapshots: ContextSnapshot[] = []
  const contextMetadata: ContextMetadata[] = []
  const startTime = Date.now()

  // Opening message
  const opening = config.opening ?? "Hello! Let's have a conversation."
  messages.push({ role: "user", content: opening })

  if (config.output?.console) {
    console.log(`______HUMAN______\n${opening}\n`)
  }

  for (let turn = 0; turn < config.turns; turn++) {
    // ─── LLM Turn ───────────────────────────────────────────────
    let llmResponse = ""
    let llmContextForTurn: Context | null = null

    for await (const event of llmSession.send(messages[messages.length - 1]!.content)) {
      switch (event.type) {
        case "context_assembled":
          llmContextForTurn = event.context
          contextMetadata.push({
            turn,
            artifactsIncluded: event.context.metadata.artifactsIncluded,
            artifactsFiltered: event.context.metadata.artifactsFiltered,
            tokensUsed: event.context.budget.total - event.context.budget.available,
            tokensAvailable: event.context.budget.available,
          })
          if (config.output?.console) {
            console.log(`  [LLM Context] ${event.context.metadata.artifactsIncluded} artifacts, ${event.context.metadata.artifactsFiltered} filtered`)
          }
          break
        case "stream_chunk":
          llmResponse += event.content
          break
        case "error":
          throw event.error
      }
    }

    messages.push({ role: "assistant", content: llmResponse })

    contextSnapshots.push({
      turn,
      speaker: "llm",
      model: config.llm.model,
      systemPrompt: config.llm.systemPrompt,
      messages: llmContextForTurn?.items.map(i => ({
        role: "user" as const,
        content: i.content,
      })) ?? [],
      response: llmResponse,
      timestamp: Date.now(),
    })

    if (config.output?.console) {
      console.log(`______LLM______\n${llmResponse}\n`)
    }

    // ─── Human Turn (except on last turn) ──────────────────────────
    if (turn < config.turns - 1) {
      let humanResponse = ""

      if (humanSession) {
        // Dual session: human has their own ActiveSession
        // From human's perspective, llm messages are the "user input"
        let humanContextForTurn: Context | null = null

        for await (const event of humanSession.send(llmResponse)) {
          switch (event.type) {
            case "context_assembled":
              humanContextForTurn = event.context
              contextMetadata.push({
                turn,
                artifactsIncluded: event.context.metadata.artifactsIncluded,
                artifactsFiltered: event.context.metadata.artifactsFiltered,
                tokensUsed: event.context.budget.total - event.context.budget.available,
                tokensAvailable: event.context.budget.available,
              })
              if (config.output?.console) {
                console.log(`  [Human Context] ${event.context.metadata.artifactsIncluded} artifacts, ${event.context.metadata.artifactsFiltered} filtered`)
              }
              break
            case "stream_chunk":
              humanResponse += event.content
              break
            case "error":
              throw event.error
          }
        }

        contextSnapshots.push({
          turn,
          speaker: "human",
          model: config.human.model,
          systemPrompt: config.human.systemPrompt,
          messages: humanContextForTurn?.items.map(i => ({
            role: "user" as const,
            content: i.content,
          })) ?? [],
          response: humanResponse,
          timestamp: Date.now(),
        })
      } else {
        // Single session: human is raw LLM
        const flippedMessages = messages.map((m) => ({
          role: (m.role === "user" ? "assistant" : "user") as "user" | "assistant",
          content: m.content,
        }))

        humanResponse = await humanLLM!.complete(flippedMessages, config.human.systemPrompt)

        contextSnapshots.push({
          turn,
          speaker: "human",
          model: config.human.model,
          systemPrompt: config.human.systemPrompt,
          messages: flippedMessages,
          response: humanResponse,
          timestamp: Date.now(),
        })
      }

      messages.push({ role: "user", content: humanResponse })

      if (config.output?.console) {
        console.log(`______HUMAN______\n${humanResponse}\n`)
      }
    }
  }

  const duration = Date.now() - startTime
  const llmArtifacts = [...llmSession.currentArtifacts]
  const humanArtifacts = humanSession ? [...humanSession.currentArtifacts] : undefined
  const llmSessionId = llmSession.currentSession?.id
  const humanSessionId = humanSession?.currentSession?.id

  if (config.output?.console) {
    console.log(`${"─".repeat(60)}`)
    console.log(`Completed in ${(duration / 1000).toFixed(1)}s`)
    console.log(`LLM artifacts: ${llmArtifacts.length}`)
    if (humanArtifacts) {
      console.log(`Human artifacts: ${humanArtifacts.length}`)
    }
    console.log(`LLM Session ID: ${llmSessionId}`)
    if (humanSessionId) {
      console.log(`Human Session ID: ${humanSessionId}`)
    }
    console.log(`${"─".repeat(60)}\n`)
  }

  // Save context dump if configured
  if (config.output?.contextDump) {
    await saveContextDump(contextSnapshots, config.output.contextDump)
    console.log(`Context dump saved: ${config.output.contextDump}`)
  }

  // Save artifact dump if configured
  if (config.output?.artifactDump) {
    const artifactData = {
      llm: llmArtifacts,
      human: humanArtifacts,
    }
    await Bun.write(config.output.artifactDump, JSON.stringify(artifactData, null, 2))
    console.log(`Artifact dump saved: ${config.output.artifactDump}`)
  }

  return {
    name: config.name ?? "unnamed",
    turns: config.turns,
    messages,
    contextSnapshots,
    artifacts: {
      llm: llmArtifacts,
      human: humanArtifacts,
    },
    contextMetadata,
    sessionId: {
      llm: llmSessionId!,
      human: humanSessionId,
    },
    duration,
  }
}
