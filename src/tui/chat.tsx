/**
 * Chat Screen - Main chat interface
 *
 * Features:
 * - Message history display
 * - Input field at bottom
 * - Commands: /quit, /exit, /clear, /info, /settings
 * - Streaming responses
 */

import { createSignal, For } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { ConversationService } from "@/application/index.ts"
import { theme, chatColors } from "./theme.ts"
import { TinkerTextInput } from "./shared/tinker-text-input.tsx"

/** A message in the chat history */
interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

/** Props for the Chat component */
export interface ChatProps {
  service: ConversationService
  onOpenSettings: () => void
  onQuit: () => void
}

export function Chat(props: ChatProps) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [input, setInput] = createSignal("")
  const [isStreaming, setIsStreaming] = createSignal(false)
  const [statusText, setStatusText] = createSignal("")
  const dimensions = useTerminalDimensions()

  // NOTE: We previously had an explicit Ctrl+V handler here that read from
  // the system clipboard. For now we're relying on terminal bracketed paste
  // and the input's onPaste handler instead.

  /** Process a chat message or command */
  async function handleSubmit(value: string) {
    const text = value.trim()
    if (!text || isStreaming()) return

    setInput("")

    // Handle commands
    if (text === "/settings") {
      props.onOpenSettings()
      return
    }

    if (text === "/clear") {
      await props.service.startSession()
      setMessages([])
      setStatusText("Started new session")
      setTimeout(() => setStatusText(""), 2000)
      return
    }

    if (text === "/info") {
      const session = props.service.currentSession
      const msgCount = props.service.currentMessages.length
      setStatusText(`Session: ${session?.id.slice(0, 8) ?? "none"} | Messages: ${msgCount}`)
      setTimeout(() => setStatusText(""), 3000)
      return
    }

    if (text === "/quit" || text === "/exit") {
      props.onQuit()
      return
    }

    // Add user message to display
    setMessages((prev) => [...prev, { role: "user", content: text }])

    // Process chat
    setIsStreaming(true)
    let assistantContent = ""

    try {
      for await (const event of props.service.chat(text)) {
        switch (event.type) {
          case "stream_start":
            // Add empty assistant message that we'll update
            setMessages((prev) => [...prev, { role: "assistant", content: "" }])
            break

          case "stream_chunk":
            assistantContent += event.content
            // Update the last message (assistant's response)
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: assistantContent }
              }
              return updated
            })
            break

          case "stream_end":
            if (event.usage) {
              setStatusText(
                `${event.usage.promptTokens} prompt + ${event.usage.completionTokens} completion = ${event.usage.totalTokens} tokens`
              )
              setTimeout(() => setStatusText(""), 5000)
            }
            break

          case "error":
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Error: ${event.error.message}` },
            ])
            break
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${(err as Error).message}` },
      ])
    } finally {
      setIsStreaming(false)
    }
  }

  // Calculate layout dimensions
  const headerHeight = 3
  const inputHeight = 6 // accommodate a 4-row TinkerTextInput plus borders
  const statusHeight = 1
  const messagesHeight = () =>
    Math.max(1, dimensions().height - headerHeight - inputHeight - statusHeight)

  /** Get color for message role */
  const getRoleColor = (role: ChatMessage["role"]) => {
    switch (role) {
      case "user": return chatColors.userMessage
      case "assistant": return chatColors.assistantMessage
      case "system": return chatColors.systemMessage
    }
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        height={headerHeight}
        borderStyle="rounded"
        borderColor={theme.info}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        alignItems="center"
      >
        <text fg={theme.info} attributes={1}>
          tinker-tui
        </text>
        <text fg={theme.textMuted}>
          {" | "}{props.service.providerInfo.name} ({props.service.providerInfo.model})
        </text>
      </box>

      {/* Messages area */}
      <scrollbox height={messagesHeight()} flexGrow={1} stickyScroll stickyStart="bottom">
        <box flexDirection="column" paddingLeft={1} paddingRight={1}>
          <For each={messages()}>
            {(msg) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={getRoleColor(msg.role)} attributes={1}>
                  {msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System"}:
                </text>
                <text fg={theme.text} wrapMode="word">
                  {msg.content || (isStreaming() ? "..." : "")}
                </text>
              </box>
            )}
          </For>
          {messages().length === 0 && (
            <text fg={theme.textMuted}>
              Type a message to start chatting. Commands: /settings, /clear, /info | Ctrl+, for settings
            </text>
          )}
        </box>
      </scrollbox>

      {/* Status bar */}
      <box height={statusHeight} paddingLeft={1}>
        <text fg={theme.textMuted} attributes={2}>
          {statusText() || (isStreaming() ? "Thinking..." : "Ready | Ctrl+C to quit")}
        </text>
      </box>

      {/* Input area */}
      <box
        height={inputHeight}
        borderStyle="rounded"
        borderColor={isStreaming() ? chatColors.inputBorderDisabled : chatColors.inputBorder}
        paddingLeft={1}
        paddingRight={1}
      >
        <TinkerTextInput
          value={input()}
          onChange={setInput}
          maxChars={4096}
          stripNewlines={false}
          minHeight={4}
          maxHeight={4}
          placeholder={isStreaming() ? "Waiting for response..." : "Type a message..."}
          textColor={theme.text}
          focusedTextColor={theme.text}
          backgroundColor={theme.background}
          focusedBackgroundColor={theme.backgroundPanel}
          placeholderColor={theme.textMuted}
          focused
          // Submit on Enter when not streaming; let the textarea handle the
          // actual key events via onContentChange and chat's keyboard handler.
          // For now, we keep submission logic in handleSubmit and keyboard in
          // the surrounding TUI.
        />
      </box>
    </box>
  )
}
