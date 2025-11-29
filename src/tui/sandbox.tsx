#!/usr/bin/env bun
/**
 * Sandbox TUI - minimal app for experimenting with shared components.
 *
 * Usage:
 *   bun run src/tui/sandbox.tsx
 */

import { render } from "@opentui/solid"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { theme } from "./theme.ts"
import { TinkerTextInput } from "./shared/tinker-text-input.tsx"

function SandboxApp() {
  const [value1, setValue1] = createSignal("")
  const [value2, setValue2] = createSignal("")
  const [value3, setValue3] = createSignal("")
  const [value4, setValue4] = createSignal("")
  const [activeFocus, setActiveFocus] =
    createSignal<"tti1" | "tti2" | "tti3" | "tti4">("tti1")
  let tti1Ref: any
  let tti2Ref: any
  let tti3Ref: any
  let tti4Ref: any

  // Minimal keyboard handling: Tab cycles focus between the four TinkerTextInputs.
  useKeyboard((key) => {
    const raw = key.sequence ?? ""

    // Filter out Warp's initial weird "4;" handshake sequence from affecting
    // empty input, but otherwise do nothing special.
    if (!key.name && raw && raw.startsWith("\u001b[4;")) {
      key.preventDefault()
    }
    if (value1() === "" && (key.name === "4" || key.name === ";")) {
      key.preventDefault()
    }

    if (key.name === "tab") {
      const order: Array<"tti1" | "tti2" | "tti3" | "tti4"> = ["tti1", "tti2", "tti3", "tti4"]
      const current = activeFocus()
      const idx = order.indexOf(current)
      const next = (
        idx === -1 ? "tti1" : order[(idx + 1) % order.length]
      ) as "tti1" | "tti2" | "tti3" | "tti4"
      setActiveFocus(next)
      if (next === "tti1" && tti1Ref && typeof tti1Ref.focus === "function") {
        tti1Ref.focus()
      } else if (next === "tti2" && tti2Ref && typeof tti2Ref.focus === "function") {
        tti2Ref.focus()
      } else if (next === "tti3" && tti3Ref && typeof tti3Ref.focus === "function") {
        tti3Ref.focus()
      } else if (next === "tti4" && tti4Ref && typeof tti4Ref.focus === "function") {
        tti4Ref.focus()
      }
      key.preventDefault()
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        height={3}
        borderStyle="rounded"
        borderColor={theme.info}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        alignItems="center"
      >
        <text fg={theme.info} attributes={1}>
          Sandbox Input
        </text>
        <text fg={theme.textMuted}>{" | Ctrl+V / terminal paste to test"}</text>
      </box>

      {/* Body */}
      <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}>
        <box marginTop={2}>
          <text fg={theme.textMuted}>
            TinkerTextInput variants (stripNewlines, maxHeight = 1/2/3/4)
          </text>
        </box>

        {/* Height 1 */}
        <box
          marginTop={1}
          height={3}
          borderStyle="rounded"
          borderColor={theme.borderFocus}
          paddingLeft={1}
          paddingRight={1}
        >
          <TinkerTextInput
            value={value1()}
            onChange={setValue1}
            maxChars={2048}
            stripNewlines
            minHeight={1}
            maxHeight={1}
            placeholder="TTI height 1 (stripNewlines)"
            textColor={theme.text}
            focusedTextColor={theme.text}
            backgroundColor={theme.background}
            focusedBackgroundColor={theme.backgroundPanel}
            focused={activeFocus() === "tti1"}
            textareaRef={(r: any) => {
              tti1Ref = r
            }}
          />
        </box>

        {/* Height 2 */}
        <box
          marginTop={1}
          height={4}
          borderStyle="rounded"
          borderColor={theme.borderFocus}
          paddingLeft={1}
          paddingRight={1}
        >
          <TinkerTextInput
            value={value2()}
            onChange={setValue2}
            maxChars={2048}
            stripNewlines
            minHeight={2}
            maxHeight={2}
            placeholder="TTI height 2 (stripNewlines)"
            textColor={theme.text}
            focusedTextColor={theme.text}
            backgroundColor={theme.background}
            focusedBackgroundColor={theme.backgroundPanel}
            focused={activeFocus() === "tti2"}
            textareaRef={(r: any) => {
              tti2Ref = r
            }}
          />
        </box>

        {/* Height 3 */}
        <box
          marginTop={1}
          height={5}
          borderStyle="rounded"
          borderColor={theme.borderFocus}
          paddingLeft={1}
          paddingRight={1}
        >
          <TinkerTextInput
            value={value3()}
            onChange={setValue3}
            maxChars={2048}
            stripNewlines
            minHeight={3}
            maxHeight={3}
            placeholder="TTI height 3 (stripNewlines)"
            textColor={theme.text}
            focusedTextColor={theme.text}
            backgroundColor={theme.background}
            focusedBackgroundColor={theme.backgroundPanel}
            focused={activeFocus() === "tti3"}
            textareaRef={(r: any) => {
              tti3Ref = r
            }}
          />
        </box>

        {/* Height 4 */}
        <box
          marginTop={1}
          height={6}
          borderStyle="rounded"
          borderColor={theme.borderFocus}
          paddingLeft={1}
          paddingRight={1}
        >
          <TinkerTextInput
            value={value4()}
            onChange={setValue4}
            maxChars={2048}
            stripNewlines
            minHeight={4}
            maxHeight={4}
            placeholder="TTI height 4 (stripNewlines)"
            textColor={theme.text}
            focusedTextColor={theme.text}
            backgroundColor={theme.background}
            focusedBackgroundColor={theme.backgroundPanel}
            focused={activeFocus() === "tti4"}
            textareaRef={(r: any) => {
              tti4Ref = r
            }}
          />
        </box>
      </box>
    </box>
  )
}

async function main() {
  await render(() => <SandboxApp />)
}

main().catch((err) => {
  console.error("Sandbox fatal error:", err)
  process.exit(1)
})
