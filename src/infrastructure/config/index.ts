import { detectProject } from "@/infrastructure/project/project.ts"
import { createProjectState, type ProjectState } from "@/infrastructure/project/state.ts"
import { DEFAULT_CONFIG, type Config } from "./types.ts"
import type { InstanceState } from "./types.ts"

/**
 * Global state for the running instance.
 */
const state: InstanceState = {
  config: DEFAULT_CONFIG,
  projects: new Map(),
  activeProjectPath: null,
}

/**
 * Instance — the running process singleton.
 * Holds global state: config, open projects, active project.
 */
export const Instance = {
  // ─── Config ───────────────────────────────────────────────

  /** Get instance-level config */
  get config(): Config {
    return state.config
  },

  /** Set instance-level config */
  setConfig(config: Config): void {
    state.config = config
  },

  /** Update specific config fields */
  updateConfig(partial: Partial<Config>): void {
    state.config = { ...state.config, ...partial }
  },

  /** Load config from storage (TODO: implement actual loading) */
  async loadConfig(): Promise<Config> {
    // TODO: Load from ~/.tinker/config.json or similar
    // For now, return defaults
    return DEFAULT_CONFIG
  },

  // ─── Projects ─────────────────────────────────────────────

  /** Get all open projects */
  get projects(): ReadonlyMap<string, ProjectState> {
    return state.projects
  },

  /** Get the currently active project, or null */
  get activeProject(): ProjectState | null {
    if (!state.activeProjectPath) return null
    return state.projects.get(state.activeProjectPath) ?? null
  },

  /** Open a project (detects info, creates state, sets as active) */
  async openProject(directory: string): Promise<ProjectState> {
    const info = await detectProject(directory)

    // Check if already open
    const existing = state.projects.get(info.root)
    if (existing) {
      state.activeProjectPath = info.root
      return existing
    }

    // Create and register new project
    const project = createProjectState(info)
    state.projects.set(info.root, project)
    state.activeProjectPath = info.root

    return project
  },

  /** Close a project by path */
  closeProject(path: string): boolean {
    const deleted = state.projects.delete(path)
    if (state.activeProjectPath === path) {
      // Switch to another project or null
      const remaining = state.projects.keys().next()
      state.activeProjectPath = remaining.done ? null : remaining.value
    }
    return deleted
  },

  /** Set the active project by path */
  setActiveProject(path: string): boolean {
    if (!state.projects.has(path)) return false
    state.activeProjectPath = path
    return true
  },

  // ─── Utilities ────────────────────────────────────────────

  /** Reset all state (useful for testing) */
  reset(): void {
    state.config = DEFAULT_CONFIG
    state.projects.clear()
    state.activeProjectPath = null
  },
}

// Re-export types
export type { InstanceState, Config, ProviderConfig } from "./types.ts"
export { DEFAULT_CONFIG } from "./types.ts"
export { ConfigService } from "./service.ts"
