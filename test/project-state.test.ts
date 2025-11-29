import { test, expect, afterEach } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { createProjectState, type ProjectState } from "@/infrastructure/project/state.ts"
import { detectProject } from "@/infrastructure/project/project.ts"
import type { Project } from "@/domain/project.ts"

let state: ProjectState | null = null
let tempDir: string | null = null

/** Create an isolated Project for storage tests */
function createTestProject(): Project {
  tempDir = `/tmp/tinker-test-${crypto.randomUUID()}`
  mkdirSync(tempDir, { recursive: true })
  return {
    id: `test-${crypto.randomUUID().slice(0, 8)}`,
    root: tempDir,
    name: "test-project",
  }
}

afterEach(async () => {
  // Clean up storage if it was initialized
  if (state) {
    try {
      const storage = await state.storage()
      storage.close()
    } catch {
      // Storage may not have been initialized
    }
    state = null
  }
  // Clean up temp directory
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

test("createProjectState creates state with project", async () => {
  const project = await detectProject(process.cwd())
  state = createProjectState(project)

  expect(state.project).toBe(project)
  expect(state.project.name).toBe("tinker-tui")
  expect(state.project.id).toBeDefined()
})

test("lazy config returns empty partial config", async () => {
  const project = await detectProject(process.cwd())
  state = createProjectState(project)

  // Access config lazily
  const config = await state.config()

  // Currently returns empty object (TODO in implementation)
  expect(config).toEqual({})
})

test("lazy config is memoized", async () => {
  const project = await detectProject(process.cwd())
  state = createProjectState(project)

  // Access twice
  const config1 = await state.config()
  const config2 = await state.config()

  // Should be the same object (memoized by lazy())
  expect(config1).toBe(config2)
})

test("lazy storage initializes ProjectStorage", async () => {
  const project = createTestProject()
  state = createProjectState(project)

  // Access storage lazily
  const storage = await state.storage()

  expect(storage).toBeDefined()
  // Can perform basic operations
  const sessions = await storage.listSessions()
  expect(Array.isArray(sessions)).toBe(true)
})

test("lazy storage is memoized", async () => {
  const project = createTestProject()
  state = createProjectState(project)

  // Access twice
  const storage1 = await state.storage()
  const storage2 = await state.storage()

  // Should be the same instance (memoized by lazy())
  expect(storage1).toBe(storage2)
})
