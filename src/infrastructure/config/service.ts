import * as path from "node:path"
import { DEFAULT_CONFIG, type Config, type ProviderConfig } from "./config-types.ts"
import { resolveConfig } from "./resolve.ts"

/**
 * Config file locations:
 * - User level: ~/.tinker/config.json (defaults for all projects)
 * - Project level: {projectRoot}/.tinker/config.json (overrides)
 */
const USER_CONFIG_DIR = path.join(process.env.HOME ?? "~", ".tinker")
const USER_CONFIG_FILE = path.join(USER_CONFIG_DIR, "config.json")
const PROJECT_CONFIG_DIR = ".tinker"
const PROJECT_CONFIG_FILE = "config.json"

/**
 * ConfigService - Handles loading and saving configuration files.
 *
 * Supports two levels:
 * - User level (~/.tinker/config.json): Global defaults
 * - Project level ({project}/.tinker/config.json): Project-specific overrides
 *
 * The resolved config merges user defaults with project overrides.
 */
export class ConfigService {
  private projectRoot: string
  private userConfig: Config = DEFAULT_CONFIG
  private projectConfig: Partial<Config> = {}

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  /**
   * Load configuration from disk.
   * Merges user config with project overrides.
   */
  async load(): Promise<Config> {
    this.userConfig = await this.loadUserConfig()
    this.projectConfig = await this.loadProjectConfig()
    return this.getResolved()
  }

  /**
   * Get the resolved (merged) configuration.
   */
  getResolved(): Config {
    return resolveConfig(this.userConfig, this.projectConfig)
  }

  /**
   * Update and save project-level configuration.
   * Only saves the override values, not the full merged config.
   */
  async saveProjectConfig(partial: Partial<Config>): Promise<void> {
    // Merge with existing project config
    this.projectConfig = {
      ...this.projectConfig,
      ...partial,
    }
    await this.writeProjectConfig(this.projectConfig)
  }

  /**
   * Update just the provider configuration at project level.
   */
  async saveProvider(provider: ProviderConfig): Promise<void> {
    await this.saveProjectConfig({ provider })
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private async loadUserConfig(): Promise<Config> {
    try {
      const file = Bun.file(USER_CONFIG_FILE)
      if (await file.exists()) {
        const content = await file.json()
        return resolveConfig(DEFAULT_CONFIG, content as Partial<Config>)
      }
    } catch (error) {
      console.warn("Failed to load user config:", error)
    }
    return DEFAULT_CONFIG
  }

  private async loadProjectConfig(): Promise<Partial<Config>> {
    try {
      const configPath = path.join(this.projectRoot, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE)
      const file = Bun.file(configPath)
      if (await file.exists()) {
        return (await file.json()) as Partial<Config>
      }
    } catch (error) {
      console.warn("Failed to load project config:", error)
    }
    return {}
  }

  private async writeProjectConfig(config: Partial<Config>): Promise<void> {
    const configDir = path.join(this.projectRoot, PROJECT_CONFIG_DIR)
    const configPath = path.join(configDir, PROJECT_CONFIG_FILE)

    // Ensure .tinker directory exists
    await Bun.file(configDir).exists().catch(() => false)
    try {
      await Bun.write(
        configPath,
        JSON.stringify(config, null, 2) + "\n"
      )
    } catch (error) {
      // Directory might not exist, create it
      const { mkdir } = await import("node:fs/promises")
      await mkdir(configDir, { recursive: true })
      await Bun.write(
        configPath,
        JSON.stringify(config, null, 2) + "\n"
      )
    }
  }
}
