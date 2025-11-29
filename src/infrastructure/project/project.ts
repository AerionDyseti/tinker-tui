import { $ } from "bun"
import * as path from "node:path"
import type { Project } from "@/domain/project.ts"

// Re-export domain type for convenience
export type { Project } from "@/domain/project.ts"

/**
 * @deprecated Use Project from @/domain/project.ts instead.
 * This alias exists for backward compatibility during migration.
 */
export type ProjectInfo = Project

/**
 * Generate a stable project ID from the root path.
 * Uses a hash to create a deterministic, filesystem-safe identifier.
 */
function generateProjectId(root: string): string {
  const hash = new Bun.CryptoHasher("sha256")
  hash.update(root)
  return hash.digest("hex").slice(0, 16)
}

/**
 * Detect project from a directory.
 * Walks up to find git root, falls back to the provided directory.
 */
export async function detectProject(directory: string): Promise<Project> {
  const absoluteDir = path.resolve(directory)

  // Try to find git root
  const gitRoot = await findGitRoot(absoluteDir)

  if (gitRoot) {
    const branch = await getCurrentBranch(gitRoot)
    return {
      id: generateProjectId(gitRoot),
      root: gitRoot,
      name: path.basename(gitRoot),
      git: {
        branch: branch ?? undefined,
      },
    }
  }

  // No git repo — use the provided directory
  return {
    id: generateProjectId(absoluteDir),
    root: absoluteDir,
    name: path.basename(absoluteDir),
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
