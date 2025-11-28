import { test, expect } from "bun:test"
import { resolveConfig } from "@/infrastructure/config/resolve.ts"
import { DEFAULT_CONFIG, type Config } from "@/infrastructure/config/index.ts"

test("resolveConfig merges partial config over defaults", () => {
  const base: Config = DEFAULT_CONFIG

  const override: Partial<Config> = {
    theme: {
      name: "light",
    },
  }

  const resolved = resolveConfig(base, override)

  expect(resolved.theme.name).toBe("light")
  expect(resolved.provider.type).toBe("claude-code") // unchanged
  expect(resolved.editor.tabSize).toBe(2) // unchanged
})

test("resolveConfig handles nested overrides", () => {
  const base: Config = DEFAULT_CONFIG

  const override: Partial<Config> = {
    editor: {
      tabSize: 4,
      insertSpaces: false,
    },
  }

  const resolved = resolveConfig(base, override)

  expect(resolved.editor.tabSize).toBe(4)
  expect(resolved.editor.insertSpaces).toBe(false)
  expect(resolved.theme.name).toBe("dark") // unchanged
})

test("resolveConfig handles provider override", () => {
  const base: Config = DEFAULT_CONFIG

  const override: Partial<Config> = {
    provider: {
      type: "local",
      model: "llama3",
      baseUrl: "http://localhost:11434",
      runtime: "ollama",
    },
  }

  const resolved = resolveConfig(base, override)

  expect(resolved.provider.type).toBe("local")
  if (resolved.provider.type === "local") {
    expect(resolved.provider.model).toBe("llama3")
    expect(resolved.provider.baseUrl).toBe("http://localhost:11434")
  }
})

test("resolveConfig with empty override returns base", () => {
  const base: Config = DEFAULT_CONFIG
  const resolved = resolveConfig(base, {})

  expect(resolved).toEqual(base)
})
