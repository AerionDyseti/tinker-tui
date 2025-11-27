/**
 * Provider configuration — discriminated union for type safety.
 */
export type ProviderConfig =
  | {
      type: "claude-code"
      model: string              // e.g., "claude-sonnet-4-20250514"
      // Uses Claude Code's auth token — no API key needed
      // TODO: Figure out how OpenCode extracts this
    }
  | {
      type: "openrouter"
      model: string              // e.g., "anthropic/claude-3.5-sonnet"
      apiKey: string             // OpenRouter API key
      baseUrl?: string           // defaults to https://openrouter.ai/api/v1
    }
  | {
      type: "local"
      model: string              // e.g., "llama3", "mistral"
      baseUrl: string            // e.g., "http://localhost:11434"
      runtime: "ollama" | "lmstudio" | "llamacpp" | "other"
    }

/**
 * Config — the complete configuration shape.
 *
 * - User level: fully populated (with defaults)
 * - Project level: PartialConfig (overrides only)
 * - Resolved: merge of user + project → complete Config
 */
export interface Config {
  provider: ProviderConfig

  theme: {
    name: string             // e.g., "dark", "light"
  }

  editor: {
    tabSize: number
    insertSpaces: boolean
  }

  // TODO: Expand as needed:
  // - keybinds
  // - telemetry
  // - system prompts
}

/**
 * Default configuration — uses Claude Code token by default.
 */
export const DEFAULT_CONFIG: Config = {
  provider: {
    type: "claude-code",
    model: "claude-sonnet-4-20250514",
  },
  theme: {
    name: "dark",
  },
  editor: {
    tabSize: 2,
    insertSpaces: true,
  },
}

/**
 * Deep partial type — all fields optional, recursively.
 * Used for project-level overrides.
 */
export type PartialConfig = DeepPartial<Config>

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
