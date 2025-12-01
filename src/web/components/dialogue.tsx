/**
 * Dialogue Component
 *
 * Main chat interface for human-agent conversation.
 * This is a spike — wiring to backend comes next.
 */

import React, { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import "highlight.js/styles/github-dark.css"
import { Settings } from "./settings.tsx"

interface Message {
  role: "user" | "agent" | "system"
  content: string
}

interface SessionInfo {
  id: string
  title: string
  updatedAt: string
}

export function Dialogue() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  async function sendMessage(text: string, addUserMessage = true) {
    if (!text || isStreaming) return

    if (addUserMessage) {
      setMessages(prev => [...prev, { role: "user", content: text }])
    }
    setIsStreaming(true)
    setStatus("Thinking...")

    try {
      // Call backend API with session ID
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (sessionId) {
        headers["X-Session-ID"] = sessionId
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: text, sessionId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let agentContent = ""

      // Add empty agent message to update
      setMessages(prev => [...prev, { role: "agent", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        // Parse SSE events
        const lines = chunk.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const event = JSON.parse(data)
              if (event.type === "session") {
                // Capture session ID from server
                setSessionId(event.sessionId)
              } else if (event.type === "chunk") {
                agentContent += event.content
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === "agent") {
                    updated[updated.length - 1] = { ...last, content: agentContent }
                  }
                  return updated
                })
              } else if (event.type === "usage") {
                setStatus(`${event.total} tokens`)
              }
            } catch {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      setStatus("")
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: "system", content: `Error: ${(err as Error).message}` }
      ])
      setStatus("")
    } finally {
      setIsStreaming(false)
    }
  }

  // Start a new session
  async function startNewSession() {
    setSessionId(null)
    setMessages([])
    setStatus("")
    setMessages([{ role: "system", content: "Started new session." }])
  }

  // Load available sessions for picker
  async function loadSessions() {
    try {
      const response = await fetch("/api/sessions")
      if (response.ok) {
        const data = await response.json()
        setAvailableSessions(data.sessions || [])
      }
    } catch (err) {
      console.error("Failed to load sessions:", err)
    }
  }

  // Resume a specific session
  async function resumeSession(id: string) {
    setSessionPickerOpen(false)
    setSessionId(id)
    setMessages([{ role: "system", content: `Loading session ${id.slice(0, 8)}...` }])

    try {
      const response = await fetch(`/api/session/messages?id=${id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        } else {
          setMessages([{ role: "system", content: `Resumed session ${id.slice(0, 8)} (empty)` }])
        }
      } else {
        setMessages([{ role: "system", content: `Failed to load session history` }])
      }
    } catch (err) {
      console.error("Failed to load session:", err)
      setMessages([{ role: "system", content: `Error loading session: ${(err as Error).message}` }])
    }
  }

  // Handle slash commands
  function handleCommand(text: string): boolean {
    const command = text.toLowerCase()

    if (command === "/new") {
      startNewSession()
      return true
    }

    if (command === "/resume") {
      loadSessions()
      setSessionPickerOpen(true)
      return true
    }

    if (command === "/help") {
      setMessages(prev => [...prev, {
        role: "system",
        content: `**Available Commands**
- \`/new\` — Start a new session
- \`/resume\` — Resume a previous session
- \`/help\` — Show this help`
      }])
      return true
    }

    return false
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput("")

    // Check for slash commands
    if (text.startsWith("/")) {
      if (handleCommand(text)) return
    }

    sendMessage(text)
  }

  async function regenerate() {
    if (isStreaming || messages.length === 0) return

    // Find last user message
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg && msg.role === "user") {
        lastUserIndex = i
        break
      }
    }

    if (lastUserIndex === -1) return

    const lastUserMsg = messages[lastUserIndex]
    if (!lastUserMsg) return

    const lastUserContent = lastUserMsg.content

    // Truncate backend session to remove agent response
    if (sessionId) {
      try {
        await fetch("/api/session/truncate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, afterIndex: lastUserIndex }),
        })
      } catch (err) {
        console.error("Failed to truncate session:", err)
      }
    }

    // Remove everything after the last user message (frontend)
    setMessages(prev => prev.slice(0, lastUserIndex + 1))

    // Re-send without adding user message again
    sendMessage(lastUserContent, false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      <header className="header">
        <h1>tinker</h1>
        <span className="session-indicator">
          {sessionId ? `session: ${sessionId.slice(0, 8)}` : "new session"}
        </span>
        <button className="settings-button" onClick={() => setSettingsOpen(true)}>
          settings
        </button>
      </header>

      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Session Picker Modal */}
      {sessionPickerOpen && (
        <div className="modal-overlay" onClick={() => setSessionPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resume Session</h2>
              <button className="close-button" onClick={() => setSessionPickerOpen(false)}>×</button>
            </div>
            <div className="modal-content">
              {availableSessions.length === 0 ? (
                <p className="empty-sessions">No previous sessions found.</p>
              ) : (
                <ul className="session-list">
                  {availableSessions.map(session => (
                    <li key={session.id}>
                      <button
                        className="session-item"
                        onClick={() => resumeSession(session.id)}
                      >
                        <span className="session-title">{session.title}</span>
                        <span className="session-meta">
                          {session.id.slice(0, 8)} · {new Date(session.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>Start a conversation</p>
            <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Type a message below to begin
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="message-role">
                {msg.role === "user" ? "You" : msg.role === "agent" ? "Agent" : "System"}
              </div>
              <div className="message-content">
                {msg.role === "agent" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {msg.content || (isStreaming ? "..." : "")}
                  </ReactMarkdown>
                ) : (
                  msg.content || ""
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {status && <div className="status-bar">{status}</div>}

      <form className="input-area" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Waiting for response..." : "Type a message... (Enter to send, Shift+Enter for newline)"}
          disabled={isStreaming}
          rows={1}
        />
        <button
          type="button"
          onClick={regenerate}
          disabled={isStreaming || messages.length === 0}
          title="Regenerate last response"
        >
          regen
        </button>
        <button type="submit" disabled={isStreaming || !input.trim()}>
          send
        </button>
      </form>
    </>
  )
}
