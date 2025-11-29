/**
 * Settings Screen - Configuration editor for tinker-tui
 *
 * UI Pattern:
 * - Provider type selector at top
 * - Dynamic fields below based on provider type
 * - Up/Down navigates between fields
 * - Enter opens selector dialog OR focuses text input
 * - ESC saves and returns to chat
 *
 * Provider-specific fields:
 * - Claude Code: model
 * - OpenRouter: model, apiKey, baseUrl (optional)
 * - Local: model, baseUrl, runtime
 */

import { createSignal, createMemo, For, Show, createEffect } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { theme } from "../theme.ts"
import type { ProviderConfig, LocalRuntime } from "@/infrastructure/config/index.ts"
import type { FieldDefinition } from "./types.ts"
import { TextRowControl } from "./text-row.tsx"
import { SelectRowControl } from "./select-row.tsx"
// import { Clipboard } from "@/util/clipboard.ts" // Temporarily unused while relying on bracketed paste

// ============================================================================
// Types
// ============================================================================

type ProviderType = ProviderConfig["type"]

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_TYPE_OPTIONS = [
  { label: "Claude Code", value: "claude-code" },
  { label: "OpenRouter", value: "openrouter" },
  { label: "Local", value: "local" },
]

const RUNTIME_OPTIONS = [
  { label: "Ollama", value: "ollama" },
  { label: "LM Studio", value: "lmstudio" },
  { label: "llama.cpp", value: "llamacpp" },
  { label: "Other", value: "other" },
]

// Default values for each provider type
const PROVIDER_DEFAULTS: Record<ProviderType, ProviderConfig> = {
  "claude-code": { type: "claude-code", model: "claude-sonnet-4-20250514" },
  openrouter: { type: "openrouter", model: "anthropic/claude-3.5-sonnet", apiKey: "" },
  local: { type: "local", model: "llama3", baseUrl: "http://localhost:11434/v1", runtime: "ollama" },
}

// ============================================================================
// Props
// ============================================================================

export interface SettingsProps {
  onBack: () => void
  onProviderChange: (config: ProviderConfig) => void
  currentProviderConfig: ProviderConfig
}

// ============================================================================
// Component
// ============================================================================

export function Settings(props: SettingsProps) {
  // ─── Local State for Editing ─────────────────────────────────────────────
  // We track changes locally and only save when leaving the screen

  const [providerType, setProviderType] = createSignal<ProviderType>(props.currentProviderConfig.type)
  const [model, setModel] = createSignal(props.currentProviderConfig.model)
  const [apiKey, setApiKey] = createSignal(
    props.currentProviderConfig.type === "openrouter" ? props.currentProviderConfig.apiKey : ""
  )
  const [baseUrl, setBaseUrl] = createSignal(
    props.currentProviderConfig.type === "openrouter"
      ? props.currentProviderConfig.baseUrl ?? ""
      : props.currentProviderConfig.type === "local"
        ? props.currentProviderConfig.baseUrl
        : ""
  )
  const [runtime, setRuntime] = createSignal<LocalRuntime>(
    props.currentProviderConfig.type === "local" ? props.currentProviderConfig.runtime : "ollama"
  )

  // ─── UI State ────────────────────────────────────────────────────────────

  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [editingField, setEditingField] = createSignal<string | null>(null)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [dialogOptions, setDialogOptions] = createSignal<{ label: string; value: string }[]>([])
  const [dialogSelectedIndex, setDialogSelectedIndex] = createSignal(0)
  const [dialogOnSelect, setDialogOnSelect] = createSignal<((value: string) => void) | null>(null)
  const [textInputValue, setTextInputValue] = createSignal("")

  // ─── Dynamic Field List ──────────────────────────────────────────────────

  const fields = createMemo<FieldDefinition[]>(() => {
    const type = providerType()
    const baseFields: FieldDefinition[] = [
      {
        id: "providerType",
        label: "Provider",
        type: "select",
        options: PROVIDER_TYPE_OPTIONS,
        getValue: () => PROVIDER_TYPE_OPTIONS.find((o) => o.value === providerType())?.label ?? "Unknown",
        setValue: (value) => {
          const newType = value as ProviderType
          setProviderType(newType)
          // Reset to defaults for the new provider type
          const defaults = PROVIDER_DEFAULTS[newType]
          setModel(defaults.model)
          if (defaults.type === "openrouter") {
            setApiKey(defaults.apiKey)
            setBaseUrl(defaults.baseUrl ?? "")
          } else if (defaults.type === "local") {
            setBaseUrl(defaults.baseUrl)
            setRuntime(defaults.runtime)
          }
        },
      },
      {
        id: "model",
        label: "Model",
        type: "text",
        placeholder: "Model name or ID",
        getValue: () => model(),
        setValue: setModel,
      },
    ]

    // Add provider-specific fields
    if (type === "openrouter") {
      baseFields.push(
        {
          id: "apiKey",
          label: "API Key",
          type: "text",
          placeholder: "sk-or-...",
          getValue: () => (apiKey() ? "••••••••" + apiKey().slice(-4) : "(not set)"),
          setValue: setApiKey,
        },
        {
          id: "baseUrl",
          label: "Base URL",
          type: "text",
          placeholder: "https://openrouter.ai/api/v1 (optional)",
          getValue: () => baseUrl() || "(default)",
          setValue: setBaseUrl,
        }
      )
    } else if (type === "local") {
      baseFields.push(
        {
          id: "baseUrl",
          label: "Base URL",
          type: "text",
          placeholder: "http://localhost:11434/v1",
          getValue: () => baseUrl(),
          setValue: setBaseUrl,
        },
        {
          id: "runtime",
          label: "Runtime",
          type: "select",
          options: RUNTIME_OPTIONS,
          getValue: () => RUNTIME_OPTIONS.find((o) => o.value === runtime())?.label ?? "Other",
          setValue: (value) => setRuntime(value as typeof runtime extends () => infer R ? R : never),
        }
      )
    }

    return baseFields
  })

  // ─── Build Config from Current State ─────────────────────────────────────

  function buildConfig(): ProviderConfig {
    const type = providerType()
    switch (type) {
      case "claude-code":
        return { type: "claude-code", model: model() }
      case "openrouter":
        return {
          type: "openrouter",
          model: model(),
          apiKey: apiKey(),
          ...(baseUrl() ? { baseUrl: baseUrl() } : {}),
        }
      case "local":
        return {
          type: "local",
          model: model(),
          baseUrl: baseUrl(),
          runtime: runtime(),
        }
    }
  }

  // ─── Check if Config Changed ─────────────────────────────────────────────

  function hasChanges(): boolean {
    const current = buildConfig()
    const original = props.currentProviderConfig
    return JSON.stringify(current) !== JSON.stringify(original)
  }

  // ─── Save and Exit ───────────────────────────────────────────────────────

  function saveAndExit() {
    if (hasChanges()) {
      props.onProviderChange(buildConfig())
    }
    props.onBack()
  }

  // ─── Dialog Helpers ──────────────────────────────────────────────────────

  function openSelectDialog(field: FieldDefinition) {
    if (field.type !== "select" || !field.options) return
    const currentLabel = field.getValue()
    const currentIndex = field.options.findIndex((o) => o.label === currentLabel)
    setDialogOptions(field.options)
    setDialogSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    setDialogOnSelect(() => field.setValue)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setDialogOnSelect(null)
  }

  // ─── Text Input Helpers ──────────────────────────────────────────────────

  function startTextEdit(field: FieldDefinition) {
    if (field.type !== "text") return
    // For API key, start fresh; for others, show current value
    const currentValue = field.id === "apiKey" ? "" : field.getValue()
    setTextInputValue(currentValue === "(not set)" || currentValue === "(default)" ? "" : currentValue)
    setEditingField(field.id)
  }

  function finishTextEdit(save: boolean) {
    if (save && editingField()) {
      const field = fields().find((f) => f.id === editingField())
      if (field) {
        field.setValue(textInputValue())
      }
    }
    setEditingField(null)
    setTextInputValue("")
  }

  // ─── Keyboard Navigation ─────────────────────────────────────────────────

  useKeyboard(async (key) => {
    if (key.defaultPrevented) return

    // Text input mode - handle escape/enter here; bracketed paste is handled
    // via the inline input's onPaste handler in TextRowControl.
    if (editingField()) {
      if (key.name === "escape") {
        finishTextEdit(false)
        key.preventDefault?.()
        return
      }
      if (key.name === "return") {
        finishTextEdit(true)
        key.preventDefault?.()
        return
      }
      // Let the input handle all other keys
      return
    }

    // Dialog mode
    if (dialogOpen()) {
      if (key.name === "escape") {
        closeDialog()
        return
      }
      if (key.name === "up") {
        setDialogSelectedIndex((i) => (i > 0 ? i - 1 : dialogOptions().length - 1))
        return
      }
      if (key.name === "down") {
        setDialogSelectedIndex((i) => (i < dialogOptions().length - 1 ? i + 1 : 0))
        return
      }
      if (key.name === "return") {
        const option = dialogOptions()[dialogSelectedIndex()]
        if (option) {
          const onSelect = dialogOnSelect()
          if (onSelect) onSelect(option.value)
          closeDialog()
        }
        return
      }
      return
    }

    // Main navigation
    if (key.name === "escape") {
      saveAndExit()
      return
    }
    if (key.name === "up") {
      setSelectedIndex((i) => (i > 0 ? i - 1 : fields().length - 1))
      return
    }
    if (key.name === "down") {
      setSelectedIndex((i) => (i < fields().length - 1 ? i + 1 : 0))
      return
    }
    if (key.name === "return") {
      const field = fields()[selectedIndex()]
      if (field) {
        if (field.type === "select") {
          openSelectDialog(field)
        } else {
          startTextEdit(field)
        }
      }
      return
    }
  })

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        height={3}
        borderStyle="rounded"
        borderColor={theme.accent}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        alignItems="center"
      >
        <text fg={theme.accent} attributes={1}>
          Settings
        </text>
        <text fg={theme.textMuted}>{" | ESC to save & return"}</text>
        <Show when={hasChanges()}>
          <text fg={theme.warning}>{" (unsaved)"}</text>
        </Show>
      </box>

      {/* Settings list */}
      <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}>
        <text fg={theme.textMuted} attributes={2}>
          ↑↓ Navigate | Enter to edit
        </text>

        <box flexDirection="column" marginTop={1}>
          <For each={fields()}>
            {(field, index) => {
              const isSelected = () => index() === selectedIndex()
              const isEditing = () => editingField() === field.id

              return field.type === "text" ? (
                <TextRowControl
                  label={field.label}
                  value={field.getValue()}
                  editValue={textInputValue()}
                  placeholder={field.placeholder}
                  isSelected={isSelected()}
                  isEditing={isEditing()}
                  onTextInput={setTextInputValue}
                />
              ) : (
                <SelectRowControl
                  label={field.label}
                  value={field.getValue()}
                  isSelected={isSelected()}
                  dialogOpen={dialogOpen()}
                  options={dialogOptions()}
                  selectedIndex={dialogSelectedIndex()}
                />
              )
            }}
          </For>
        </box>
      </box>

      {/* Footer */}
      <box position="absolute" bottom={0} left={0} right={0} height={1} paddingLeft={1}>
        <text fg={theme.textMuted} attributes={2}>
          Provider: {providerType()}
        </text>
      </box>
    </box>
  )
}
