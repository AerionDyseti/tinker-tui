/**
 * API credentials for various providers.
 * Stored securely at user level (~/.tinker/credentials or similar).
 */
export interface Credentials {
  anthropic?: {
    apiKey: string
  }
  openai?: {
    apiKey: string
  }
  // TODO: Add more providers, OAuth tokens, etc.
}

/**
 * UserConfig — the superset of all configurable settings.
 * User config provides defaults; Project config (Partial<UserConfig>) overrides.
 */
export interface UserConfig {
  // ─── LLM Provider ─────────────────────────────────────────
  provider: {
    default: string          // e.g., "anthropic", "openai"
    model: string            // e.g., "claude-sonnet-4-20250514"
  }

  // ─── UI Settings ──────────────────────────────────────────
  theme: {
    name: string             // e.g., "dark", "light", "dracula"
  }

  // ─── Editor Settings ──────────────────────────────────────
  editor: {
    tabSize: number
    insertSpaces: boolean
  }

  // TODO: Add more settings as needed:
  // - keybinds
  // - telemetry opt-in/out
  // - default system prompts
  // - etc.
}

/**
 * A User — holds credentials and global config.
 */
export interface User {
  /** User identifier (could be email, username, or local ID) */
  id: string

  /** API keys and OAuth tokens */
  credentials: Credentials

  /** User-level configuration (defaults for all projects) */
  config: UserConfig
}

/**
 * Default user config — used when no config file exists.
 */
export const DEFAULT_USER_CONFIG: UserConfig = {
  provider: {
    default: "anthropic",
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
