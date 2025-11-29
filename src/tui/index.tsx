#!/usr/bin/env bun
/** @dev 2 - bump to trigger reload */
/**
 * TUI Entry Point - Initializes services and renders the terminal UI.
 *
 * Usage:
 *   bun run tui
 *
 * For debug mode, run the debug server first:
 *   bun run debug-server
 */

import { render } from "@opentui/solid"
import { createSignal } from "solid-js"
import { ConversationService } from "@/application/index.ts"
import { ProjectStorage } from "@/infrastructure/persistence/index.ts"
import { detectProject } from "@/infrastructure/project/index.ts"
import { getDefaultEmbedder } from "@/infrastructure/embedding/index.ts"
import { OpenRouterProvider, DebugProvider } from "@/infrastructure/provider/index.ts"
import { ConfigService, type ProviderConfig, type Config } from "@/infrastructure/config/index.ts"
import type { Provider } from "@/domain/provider.ts"
import { Root } from "./root.tsx"

/**
 * Create a provider instance from ProviderConfig.
 */
function createProvider(config: ProviderConfig): Provider {
  switch (config.type) {
    case "openrouter":
      return new OpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })

    case "local":
      // Local providers use OpenAI-compatible API
      return new OpenRouterProvider({
        apiKey: "not-needed",
        model: config.model,
        baseUrl: config.baseUrl,
      })

    case "claude-code":
    default:
      // For now, claude-code falls back to debug provider for testing
      // TODO: Implement actual Claude Code token reuse
      return new DebugProvider({
        host: "localhost",
        port: 7331,
      })
  }
}

/**
 * Main entry point.
 */
async function main() {
  const projectRoot = process.cwd()

  // Detect project info
  const project = await detectProject(projectRoot)

  // Load configuration from disk
  const configService = new ConfigService(projectRoot)
  const config = await configService.load()

  // Initialize storage and embedder (these don't change)
  const storage = await ProjectStorage.open(projectRoot)
  const embedder = getDefaultEmbedder()

  // Track current provider config
  let currentProviderConfig: ProviderConfig = config.provider
  let currentProvider = createProvider(currentProviderConfig)

  // Create initial conversation service
  let service = new ConversationService({
    projectId: project.id,
    provider: currentProvider,
    storage,
    embedder,
    systemPrompt: "You are a helpful assistant. Be concise and clear.",
    responseReserve: 1024,
  })

  // Start initial session
  await service.startSession()

  // Cleanup handler
  const cleanup = () => {
    storage.close()
    process.exit(0)
  }

  // Provider change handler - recreates the service with new provider and persists
  const handleProviderChange = async (providerConfig: ProviderConfig) => {
    // Skip if same provider type (simple comparison for now)
    if (providerConfig.type === currentProviderConfig.type) return

    currentProviderConfig = providerConfig
    currentProvider = createProvider(providerConfig)

    // Persist to config file
    await configService.saveProvider(providerConfig)

    // Create new service with new provider
    service = new ConversationService({
      projectId: project.id,
      provider: currentProvider,
      storage,
      embedder,
      systemPrompt: "You are a helpful assistant. Be concise and clear.",
      responseReserve: 1024,
    })

    // Start fresh session with new provider
    await service.startSession()
  }

  // Render the TUI with reactive provider config
  const [providerConfig, setProviderConfig] = createSignal<ProviderConfig>(currentProviderConfig)
  const [serviceSignal, setServiceSignal] = createSignal(service)

  const onProviderChange = async (newProviderConfig: ProviderConfig) => {
    await handleProviderChange(newProviderConfig)
    setProviderConfig(newProviderConfig)
    setServiceSignal(service)
  }

  await render(() => (
    <Root
      service={serviceSignal()}
      onQuit={cleanup}
      onProviderChange={onProviderChange}
      currentProviderConfig={providerConfig()}
    />
  ))
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
