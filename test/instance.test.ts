import { test, expect, beforeEach } from "bun:test"
import { Instance } from "@/infrastructure/config/index.ts"

beforeEach(() => {
  Instance.reset()
})

test("opens a project and sets it as active", async () => {
  // Open the current project (tinker-tui itself)
  const state = await Instance.openProject(process.cwd())

  expect(state.project.name).toBe("tinker-tui")
  expect(state.project.git).toBeDefined()
  expect(Instance.activeProject).toBe(state)
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

  Instance.closeProject(Instance.activeProject!.project.root)
  expect(Instance.projects.size).toBe(0)
  expect(Instance.activeProject).toBeNull()
})

test("can update config", () => {
  // Starts with default config
  expect(Instance.config.provider.type).toBe("claude-code")

  // Update provider
  Instance.updateConfig({
    provider: {
      type: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      apiKey: "sk-test-123",
    },
  })

  expect(Instance.config.provider.type).toBe("openrouter")
  if (Instance.config.provider.type === "openrouter") {
    expect(Instance.config.provider.model).toBe("anthropic/claude-3.5-sonnet")
    expect(Instance.config.provider.apiKey).toBe("sk-test-123")
  }
})

test("can set entire config", () => {
  const newConfig = {
    provider: {
      type: "local" as const,
      model: "llama3",
      baseUrl: "http://localhost:11434",
      runtime: "ollama" as const,
    },
    theme: {
      name: "light",
    },
    editor: {
      tabSize: 4,
      insertSpaces: false,
    },
  }

  Instance.setConfig(newConfig)

  expect(Instance.config.provider.type).toBe("local")
  expect(Instance.config.theme.name).toBe("light")
  expect(Instance.config.editor.tabSize).toBe(4)
})

test("loadConfig returns default config", async () => {
  const config = await Instance.loadConfig()
  expect(config.provider.type).toBe("claude-code")
})

test("can switch active project", async () => {
  const state1 = await Instance.openProject(process.cwd())

  // Open a second project (parent directory)
  const parentDir = process.cwd() + "/.."
  const state2 = await Instance.openProject(parentDir)

  expect(Instance.projects.size).toBe(2)
  expect(Instance.activeProject).toBe(state2)

  // Switch back to first
  Instance.setActiveProject(state1.project.root)
  expect(Instance.activeProject).toBe(state1)
})
