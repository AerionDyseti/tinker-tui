import pDefer from "p-defer"
import PLazy from "p-lazy"

// Re-export with our naming conventions
export { pDefer as defer, PLazy as LazyPromise }

/**
 * Sync lazy value — computed once on first access.
 * For async, use LazyPromise instead.
 *
 * Usage:
 *   const value = lazy(() => expensiveComputation())
 *   value()  // computed here, cached after
 */
export function lazy<T>(init: () => T): () => T {
  let value: T
  let initialized = false

  return () => {
    if (!initialized) {
      value = init()
      initialized = true
    }
    return value
  }
}
