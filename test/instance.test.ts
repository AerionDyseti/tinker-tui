import { test, expect, beforeEach } from "bun:test"
import { Instance } from "@/infrastructure/config/index.ts"

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
  const project1 = await Instance.openProject(process.cwd())

  // Open a second project (parent directory)
  const parentDir = process.cwd() + "/.."
  const project2 = await Instance.openProject(parentDir)

  expect(Instance.projects.size).toBe(2)
  expect(Instance.activeProject).toBe(project2)

  // Switch back to first
  Instance.setActiveProject(project1.info.root)
  expect(Instance.activeProject).toBe(project1)
})
