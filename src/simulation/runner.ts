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

export interface SimulationResult {
  name: string
  turns: number
  messages: Message[]
  duration: number
}

/**
 * Run a simulation.
 */
export async function runSimulation(config: SimulationConfig): Promise<SimulationResult> {
  const userProvider = createProvider(config.user.provider, config.user.model)
  const agentProvider = createProvider(config.agent.provider, config.agent.model)

  const messages: Message[] = []
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
    const agentResponse = await agentProvider.complete(messages, config.agent.systemPrompt)
    messages.push({ role: "assistant", content: agentResponse })

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

      const userResponse = await userProvider.complete(flippedMessages, config.user.systemPrompt)
      messages.push({ role: "user", content: userResponse })

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

  return {
    name: config.name ?? "unnamed",
    turns: config.turns,
    messages,
    duration,
  }
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
