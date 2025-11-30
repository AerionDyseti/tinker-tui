/**
 * Simulation config — intentionally loose for rapid iteration.
 * Tighten with Zod later once we know what matters.
 */

export interface SimulationConfig {
  name?: string
  turns: number

  human: {
    provider: "ollama" | "openrouter"
    model: string
    systemPrompt?: string
  }

  llm: {
    provider: "ollama" | "openrouter"
    model: string
    systemPrompt?: string
  }

  /** Opening message to kick off the conversation */
  opening?: string

  /**
   * Integrate with ActiveSession for full domain layer testing.
   * When set, uses ProjectStorage, embeddings, and context assembly.
   */
  integrate?: {
    /** Project directory to use (defaults to cwd) */
    projectDir?: string
    /** Max context tokens for both sessions */
    maxContextTokens?: number
    /**
     * Give the "human" side its own ActiveSession too.
     * Useful for testing roleplay/creative scenarios where both
     * participants build context and persist artifacts.
     */
    dualSession?: boolean
  }

  output?: {
    console?: boolean
    transcript?: string
    /** Log full context sent to each model (truncated to console) */
    logContext?: boolean
    /** Dump full context to this file (JSON, no truncation) */
    contextDump?: string
    /** Dump artifacts from DB after simulation */
    artifactDump?: string
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
  if (!config.human?.provider || !config.human?.model) {
    throw new Error("Config must specify 'human.provider' and 'human.model'")
  }
  if (!config.llm?.provider || !config.llm?.model) {
    throw new Error("Config must specify 'llm.provider' and 'llm.model'")
  }

  return config as SimulationConfig
}
