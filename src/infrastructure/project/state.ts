import { lazy } from "@/util/lazy.ts"
import type { ProjectInfo } from "./project.ts"
import type { Config } from "@/infrastructure/config/index.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"

/**
 * The complete state available within a project scope.
 * All fields defined here — no hidden state.
 */
export interface ProjectState {
  /** Project metadata (root path, name, git info) */
  info: ProjectInfo

  /** Project configuration (partial overrides) */
  config: () => Promise<Partial<Config>>

  /** Project storage (sessions, messages) */
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
      // TODO: Load from {project}/.tinker/config.json
      return {} as Partial<Config>
    }),

    // Lazy storage initialization
    storage: lazy(async () => {
      return ProjectStorage.open(info.root)
    }),
  }
}
