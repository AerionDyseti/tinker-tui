import { consola, type ConsolaInstance } from "consola"

// Configure consola defaults
consola.options.formatOptions = {
  date: true,
  colors: true,
  compact: false,
}

/**
 * Create a scoped logger for a specific module/component.
 *
 * Usage:
 *   const log = createLogger("Storage")
 *   log.info("Connected")  // outputs: [Storage] Connected
 */
export function createLogger(tag: string): ConsolaInstance {
  return consola.withTag(tag)
}

/**
 * Main logger instance. Use createLogger() for scoped logging.
 */
export const Log = consola
