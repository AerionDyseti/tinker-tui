import { lazy } from "@/util/lazy.ts"
import type { Project } from "@/domain/project.ts"
import type { Config } from "@/infrastructure/config/index.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"

/**
 * The complete runtime state available within a project scope.
 * All fields defined here — no hidden state.
 *
 * Note: Project (domain) represents identity/metadata.
 * ProjectState (infrastructure) manages runtime resources.
 */
export interface ProjectState {
  /** Project identity and metadata */
  project: Project

  /** Project configuration (partial overrides) */
  config: () => Promise<Partial<Config>>

  /** Project storage (sessions, entries, knowledge) */
  storage: () => Promise<ProjectStorage>
}

/**
 * Create a ProjectState for a given project.
 * Resources are lazy-initialized on first access.
 */
export function createProjectState(project: Project): ProjectState {
  return {
    project,

    // Lazy config loading
    config: lazy(async () => {
      // TODO: Load from {project}/.tinker/config.json
      return {} as Partial<Config>
    }),

    // Lazy storage initialization
    storage: lazy(async () => {
      return ProjectStorage.open(project.root)
    }),
  }
}
