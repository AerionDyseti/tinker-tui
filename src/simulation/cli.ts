#!/usr/bin/env bun
/**
 * Simulation CLI
 *
 * Usage:
 *   bun run src/simulation/cli.ts simulations/example.json
 *   bun run src/simulation/cli.ts simulations/example.json --turns 5
 */

import { parseArgs } from "util"
import { loadConfig } from "./config.ts"
import { runSimulation, runIntegratedSimulation, saveTranscript } from "./runner.ts"

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      turns: { type: "string", short: "t" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  })

  if (values.help || positionals.length === 0) {
    console.log(`
Tinker Simulation Runner

Usage:
  bun run src/simulation/cli.ts <config.json> [options]

Options:
  -t, --turns <n>   Override number of turns
  --dry-run         Load config and exit (don't run simulation)
  -h, --help        Show this help

Example:
  bun run src/simulation/cli.ts simulations/example.json
  bun run src/simulation/cli.ts simulations/example.json --turns 3
`)
    process.exit(0)
  }

  const configPath = positionals[0]!
  console.log(`Loading config: ${configPath}`)

  const config = await loadConfig(configPath)

  // Apply overrides
  if (values.turns) {
    config.turns = parseInt(values.turns, 10)
  }

  if (values["dry-run"]) {
    console.log("\nConfig loaded (dry-run):")
    console.log(JSON.stringify(config, null, 2))
    process.exit(0)
  }

  // Run it — use integrated runner if config.integrate is set
  const result = config.integrate
    ? await runIntegratedSimulation(config)
    : await runSimulation(config)

  // Save transcript if configured
  if (config.output?.transcript) {
    await saveTranscript(result, config.output.transcript)
    console.log(`Transcript saved: ${config.output.transcript}`)
  }
}

main().catch((err) => {
  console.error("Simulation failed:", err.message)
  process.exit(1)
})
