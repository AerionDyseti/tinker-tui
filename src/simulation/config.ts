/**
 * Simulation config — intentionally loose for rapid iteration.
 * Tighten with Zod later once we know what matters.
 */

export interface SimulationConfig {
  name?: string
  turns: number

  user: {
    provider: "ollama" | "openrouter"
    model: string
    systemPrompt?: string
  }

  agent: {
    provider: "ollama" | "openrouter"
    model: string
    systemPrompt?: string
  }

  /** Opening message to kick off the conversation */
  opening?: string

  output?: {
    console?: boolean
    transcript?: string
    /** Log full context sent to each model (truncated to console) */
    logContext?: boolean
    /** Dump full context to this file (JSON, no truncation) */
    contextDump?: string
  }
}

export async function loadConfig(path: string): Promise<SimulationConfig> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(`Config not found: ${path}`)
  }
  const config = await file.json()

  // Minimal validation
  if (!config.turns || typeof config.turns !== "number") {
    throw new Error("Config must specify 'turns' as a number")
  }
  if (!config.user?.provider || !config.user?.model) {
    throw new Error("Config must specify 'user.provider' and 'user.model'")
  }
  if (!config.agent?.provider || !config.agent?.model) {
    throw new Error("Config must specify 'agent.provider' and 'agent.model'")
  }

  return config as SimulationConfig
}
