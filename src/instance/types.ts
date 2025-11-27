import type { ProjectState } from "@/project/state.ts"

/**
 * LLM provider configuration
 */
export interface ProviderConfig {
  provider: string   // e.g., "anthropic", "openai", "ollama"
  model: string      // e.g., "claude-sonnet-4-20250514", "gpt-4o"
  // TODO: Expand with API keys, base URLs, etc.
}

/**
 * Keybind configuration
 */
export interface KeybindConfig {
  // TODO: Define keybind mappings when we build the TUI
}

/**
 * The complete state of a running Instance.
 * All fields defined here — no hidden global state.
 */
export interface InstanceState {
  /** All open projects, keyed by root path */
  projects: Map<string, ProjectState>

  /** The currently active project (path), or null if none */
  activeProjectPath: string | null

  /** LLM provider and model configuration */
  provider: ProviderConfig | null

  /** Global keybind configuration */
  keybinds: KeybindConfig
}
