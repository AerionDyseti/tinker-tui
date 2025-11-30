/**
 * Settings Panel
 *
 * Dropdown panel for configuring the session.
 */

import React, { useState, useEffect, useRef } from "react"

interface ProviderConfig {
  type: "openrouter" | "local" | "claude-code"
  model: string
  baseUrl?: string
  apiKey?: string
}

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [systemPrompt, setSystemPrompt] = useState("")
  const [providerType, setProviderType] = useState<ProviderConfig["type"]>("local")
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const mouseDownOnOverlay = useRef(false)

  // Load settings on mount
  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch("/api/settings")
      const data = await res.json()
      setSystemPrompt(data.systemPrompt ?? "")
      if (data.provider) {
        setProviderType(data.provider.type ?? "local")
        setModel(data.provider.model ?? "")
        setBaseUrl(data.provider.baseUrl ?? "")
        setApiKey(data.provider.apiKey ?? "")
      }
    } catch (err) {
      console.error("Failed to load settings:", err)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const provider: ProviderConfig = {
        type: providerType,
        model,
        ...(baseUrl && { baseUrl }),
        ...(apiKey && { apiKey }),
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, provider }),
      })
      onClose()
    } catch (err) {
      console.error("Failed to save settings:", err)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Track mousedown origin to prevent drag-to-close
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget
  }

  const handleClick = (e: React.MouseEvent) => {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="settings-overlay"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <span>settings</span>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="settings-loading">loading...</div>
        ) : (
          <div className="settings-content">
            <div className="settings-section">
              <div className="settings-section-title">provider</div>

              <div className="settings-field">
                <label htmlFor="provider-type">type</label>
                <select
                  id="provider-type"
                  value={providerType}
                  onChange={e => setProviderType(e.target.value as ProviderConfig["type"])}
                >
                  <option value="local">local (lm studio / ollama)</option>
                  <option value="openrouter">openrouter</option>
                  <option value="claude-code">debug server</option>
                </select>
              </div>

              <div className="settings-field">
                <label htmlFor="model">model</label>
                <input
                  type="text"
                  id="model"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. qwen/qwen3-coder-30b"
                />
              </div>

              {(providerType === "local" || providerType === "openrouter") && (
                <div className="settings-field">
                  <label htmlFor="base-url">base url</label>
                  <input
                    type="text"
                    id="base-url"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder="e.g. http://192.168.4.247:1234/v1"
                  />
                </div>
              )}

              {providerType === "openrouter" && (
                <div className="settings-field">
                  <label htmlFor="api-key">api key</label>
                  <input
                    type="password"
                    id="api-key"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
              )}
            </div>

            <div className="settings-section">
              <div className="settings-section-title">system prompt</div>
              <div className="settings-field">
                <textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={8}
                  placeholder="Enter system prompt..."
                />
              </div>
            </div>

            <div className="settings-actions">
              <button onClick={onClose} disabled={saving}>
                cancel
              </button>
              <button onClick={saveSettings} disabled={saving}>
                {saving ? "saving..." : "save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
