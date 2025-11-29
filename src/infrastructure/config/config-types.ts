// ProviderConfig is defined in domain layer — re-export for config convenience
export type { ProviderConfig, LocalRuntime } from "@/domain/provider.ts"
import type { ProviderConfig } from "@/domain/provider.ts"

/**
 * Config — the complete configuration shape.
 *
 * - User level: fully populated (with defaults)
 * - Project level: Partial<Config> (overrides only)
 * - Resolved: merge of user + project → complete Config
 */
export interface Config {
  provider: ProviderConfig

  theme: {
    name: string // e.g., "dark", "light"
  }

  editor: {
    tabSize: number
    insertSpaces: boolean
  }
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
