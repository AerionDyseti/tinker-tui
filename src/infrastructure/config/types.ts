import type { ProjectState } from "@/infrastructure/project/state.ts"
import type { Config } from "./config-types.ts"

/**
 * The complete state of a running Instance.
 * All fields defined here — no hidden global state.
 */
export interface InstanceState {
  /** Instance-level configuration (defaults for all projects) */
  config: Config

  /** All open projects, keyed by root path */
  projects: Map<string, ProjectState>

  /** The currently active project (path), or null if none */
  activeProjectPath: string | null
}

// Re-export config types for convenience
export type { Config, ProviderConfig } from "./config-types.ts"
export { DEFAULT_CONFIG } from "./config-types.ts"
