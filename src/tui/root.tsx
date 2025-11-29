/**
 * Root Component - Manages screen navigation and global state
 *
 * Screens:
 * - chat: Main chat interface
 * - settings: Configuration editor
 *
 * Global keybinds:
 * - Ctrl+C: Quit
 * - Ctrl+,: Open settings (standard settings shortcut)
 */

import { createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Chat } from "./chat.tsx"
import { Settings } from "./settings/index.tsx"
import type { ConversationService } from "@/application/index.ts"
import type { ProviderConfig } from "@/infrastructure/config/index.ts"

export type Screen = "chat" | "settings"

export interface RootProps {
  service: ConversationService
  onQuit: () => void
  onProviderChange: (config: ProviderConfig) => void
  currentProviderConfig: ProviderConfig
}

export function Root(props: RootProps) {
  const [screen, setScreen] = createSignal<Screen>("chat")

  // Global keybinds
  useKeyboard((key) => {
    if (key.defaultPrevented) return

    // Ctrl+C to quit (always)
    if (key.ctrl && key.name === "c") {
      props.onQuit()
      return
    }

    // Ctrl+, to open settings (from chat screen)
    if (key.ctrl && key.sequence === ",") {
      if (screen() === "chat") {
        setScreen("settings")
      }
    }
  })

  function handleOpenSettings() {
    setScreen("settings")
  }

  function handleCloseSettings() {
    setScreen("chat")
  }

  function handleProviderChange(config: ProviderConfig) {
    props.onProviderChange(config)
  }

  return (
    <>
      <Show when={screen() === "chat"}>
        <Chat
          service={props.service}
          onOpenSettings={handleOpenSettings}
          onQuit={props.onQuit}
        />
      </Show>
      <Show when={screen() === "settings"}>
        <Settings
          onBack={handleCloseSettings}
          onProviderChange={handleProviderChange}
          currentProviderConfig={props.currentProviderConfig}
        />
      </Show>
    </>
  )
}
