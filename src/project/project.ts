import { $ } from "bun"
import * as path from "node:path"

export interface ProjectInfo {
  /** Absolute path to project root (git root or provided directory) */
  root: string
  /** Project name (directory name) */
  name: string
  /** Whether this is a git repository */
  isGit: boolean
  /** Current git branch, if applicable */
  branch?: string
}

/**
 * Detect project info from a directory.
 * Walks up to find git root, falls back to the provided directory.
 */
export async function detectProject(directory: string): Promise<ProjectInfo> {
  const absoluteDir = path.resolve(directory)

  // Try to find git root
  const gitRoot = await findGitRoot(absoluteDir)

  if (gitRoot) {
    const branch = await getCurrentBranch(gitRoot)
    return {
      root: gitRoot,
      name: path.basename(gitRoot),
      isGit: true,
      branch: branch ?? undefined,
    }
  }

  // No git repo — use the provided directory
  return {
    root: absoluteDir,
    name: path.basename(absoluteDir),
    isGit: false,
  }
}

async function findGitRoot(startDir: string): Promise<string | null> {
  try {
    // git rev-parse --show-toplevel returns the root of the git repo
    const result = await $`git -C ${startDir} rev-parse --show-toplevel`.quiet()
    return result.text().trim()
  } catch {
    return null
  }
}

async function getCurrentBranch(gitRoot: string): Promise<string | null> {
  try {
    const result = await $`git -C ${gitRoot} branch --show-current`.quiet()
    return result.text().trim() || null
  } catch {
    return null
  }
}
