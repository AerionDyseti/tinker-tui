import { detectProject } from "@/project/project.ts"
import { createProjectState, type ProjectState } from "@/project/state.ts"
import type { InstanceState, ProviderConfig, KeybindConfig } from "./types.ts"

/**
 * Global state for the running instance.
 */
const state: InstanceState = {
  projects: new Map(),
  activeProjectPath: null,
  provider: null,
  keybinds: {},
}

/**
 * Instance — the running process singleton.
 * Holds global state: open projects, active project, provider config, keybinds.
 */
export const Instance = {
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

  // ─── Provider ─────────────────────────────────────────────

  /** Get current provider config */
  get provider(): ProviderConfig | null {
    return state.provider
  },

  /** Set provider config */
  setProvider(config: ProviderConfig): void {
    state.provider = config
  },

  // ─── Keybinds ─────────────────────────────────────────────

  /** Get keybind config */
  get keybinds(): KeybindConfig {
    return state.keybinds
  },

  /** Set keybind config */
  setKeybinds(config: KeybindConfig): void {
    state.keybinds = config
  },

  // ─── Utilities ────────────────────────────────────────────

  /** Reset all state (useful for testing) */
  reset(): void {
    state.projects.clear()
    state.activeProjectPath = null
    state.provider = null
    state.keybinds = {}
  },
}

// Re-export types
export type { InstanceState, ProviderConfig, KeybindConfig } from "./types.ts"
