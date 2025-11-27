import { lazy } from "@/util/lazy.ts"
import type { ProjectInfo } from "./project.ts"

// Placeholder types — we'll define these properly as we build each system

/** Project configuration (loaded from .tinker/config or similar) */
export interface ProjectConfig {
  // TODO: Define config schema with Zod when we build the config system
}

/** Storage handle for this project (could be SQLite, JSON, etc.) */
export interface ProjectStorage {
  // TODO: Define interface when we build the storage system
}

/**
 * The complete state available within a project scope.
 * All fields defined here — no hidden state.
 */
export interface ProjectState {
  /** Project metadata (root path, name, git info) */
  info: ProjectInfo

  /** Project configuration */
  config: () => Promise<ProjectConfig>

  /** Project storage */
  storage: () => Promise<ProjectStorage>
}

/**
 * Create a ProjectState for a given project.
 * Resources are lazy-initialized on first access.
 */
export function createProjectState(info: ProjectInfo): ProjectState {
  return {
    info,

    // Lazy config loading
    config: lazy(async () => {
      // TODO: Load from .tinker/config.json or similar
      return {} as ProjectConfig
    }),

    // Lazy storage initialization
    storage: lazy(async () => {
      // TODO: Initialize storage backend
      return {} as ProjectStorage
    }),
  }
}
