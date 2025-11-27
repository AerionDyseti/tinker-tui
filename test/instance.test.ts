import { test, expect, beforeEach } from "bun:test"
import { Instance } from "@/instance/index.ts"

beforeEach(() => {
  Instance.reset()
})

test("opens a project and sets it as active", async () => {
  // Open the current project (tinker-tui itself)
  const project = await Instance.openProject(process.cwd())

  expect(project.info.name).toBe("tinker-tui")
  expect(project.info.isGit).toBe(true)
  expect(Instance.activeProject).toBe(project)
  expect(Instance.projects.size).toBe(1)
})

test("opening same project twice returns existing", async () => {
  const first = await Instance.openProject(process.cwd())
  const second = await Instance.openProject(process.cwd())

  expect(first).toBe(second)
  expect(Instance.projects.size).toBe(1)
})

test("can close a project", async () => {
  await Instance.openProject(process.cwd())
  expect(Instance.projects.size).toBe(1)

  Instance.closeProject(Instance.activeProject!.info.root)
  expect(Instance.projects.size).toBe(0)
  expect(Instance.activeProject).toBeNull()
})

test("can set provider config", () => {
  expect(Instance.provider).toBeNull()

  Instance.setProvider({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  })

  expect(Instance.provider?.provider).toBe("anthropic")
  expect(Instance.provider?.model).toBe("claude-sonnet-4-20250514")
})
