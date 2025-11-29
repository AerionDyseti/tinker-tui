/**
 * Git repository information.
 * Optional - a project may not be in a git repo.
 */
export interface GitInfo {
  /** Current branch name */
  branch?: string
  /** Remote URL (future: for identifying shared projects) */
  remote?: string
}

/**
 * A Project - the top-level aggregate.
 *
 * A project represents a workspace context (typically a directory/repo)
 * that contains sessions, knowledge, and entity references.
 */
export interface Project {
  /** Unique identifier (derived from root path) */
  id: string
  /** Human-readable name (typically directory name) */
  name: string
  /** Absolute path to project root */
  root: string
  /** Git information, if this is a git repository */
  git?: GitInfo
}
