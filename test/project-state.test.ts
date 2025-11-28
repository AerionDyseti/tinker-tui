import { test, expect, afterEach } from "bun:test"
import { createProjectState, type ProjectState } from "@/infrastructure/project/state.ts"
import { detectProject } from "@/infrastructure/project/project.ts"

let state: ProjectState | null = null

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
})

test("createProjectState creates state with project info", async () => {
  const info = await detectProject(process.cwd())
  state = createProjectState(info)

  expect(state.info).toBe(info)
  expect(state.info.name).toBe("tinker-tui")
})

test("lazy config returns empty partial config", async () => {
  const info = await detectProject(process.cwd())
  state = createProjectState(info)

  // Access config lazily
  const config = await state.config()

  // Currently returns empty object (TODO in implementation)
  expect(config).toEqual({})
})

test("lazy config is memoized", async () => {
  const info = await detectProject(process.cwd())
  state = createProjectState(info)

  // Access twice
  const config1 = await state.config()
  const config2 = await state.config()

  // Should be the same object (memoized by lazy())
  expect(config1).toBe(config2)
})

test("lazy storage initializes ProjectStorage", async () => {
  const info = await detectProject(process.cwd())
  state = createProjectState(info)

  // Access storage lazily
  const storage = await state.storage()

  expect(storage).toBeDefined()
  // Can perform basic operations
  const sessions = await storage.listSessions()
  expect(Array.isArray(sessions)).toBe(true)
})

test("lazy storage is memoized", async () => {
  const info = await detectProject(process.cwd())
  state = createProjectState(info)

  // Access twice
  const storage1 = await state.storage()
  const storage2 = await state.storage()

  // Should be the same instance (memoized by lazy())
  expect(storage1).toBe(storage2)
})
