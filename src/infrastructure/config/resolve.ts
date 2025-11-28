import type { Config } from "./config-types.ts"

/**
 * Deep merge two objects. Source values override target values.
 * Handles nested objects recursively.
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null
    ) {
      // Recursively merge objects
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T]
    } else if (sourceValue !== undefined) {
      // Override with source value
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * Resolve final config by merging user defaults with project overrides.
 * Project values take precedence where defined.
 *
 * Usage:
 *   const resolved = resolveConfig(userConfig, projectConfig)
 */
export function resolveConfig(user: Config, project: Partial<Config>): Config {
  return deepMerge(user, project)
}
