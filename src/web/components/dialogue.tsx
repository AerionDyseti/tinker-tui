/**
 * Dialogue Component
 *
 * Main chat interface for human-agent conversation.
 * This is a spike — wiring to backend comes next.
 */

import React, { useState, useRef, useEffect } from "react"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export function Dialogue() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState("")
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return

    setInput("")

    // Add user message
    setMessages(prev => [...prev, { role: "user", content: text }])
    setIsStreaming(true)
    setStatus("Thinking...")

    try {
      // Call backend API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let assistantContent = ""

      // Add empty assistant message to update
      setMessages(prev => [...prev, { role: "assistant", content: "" }])

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
              if (event.type === "chunk") {
                assistantContent += event.content
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: assistantContent }
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      <header className="header">
        <h1>Tinker</h1>
        <span className="provider-info">Web UI Spike</span>
      </header>

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
                {msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System"}
              </div>
              <div className="message-content">
                {msg.content || (isStreaming && msg.role === "assistant" ? "..." : "")}
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
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
      </form>
    </>
  )
}
