import { AsyncLocalStorage } from "async_hooks"

/**
 * Creates a scope that passes values through async operations
 * without explicitly passing them as arguments.
 *
 * Usage:
 *   const UserScope = createScope<User>("user")
 *
 *   UserScope.provide(currentUser, async () => {
 *     // anywhere in this async tree:
 *     const user = UserScope.use()
 *   })
 */
export function createScope<T>(name: string) {
  const storage = new AsyncLocalStorage<T>()

  return {
    /**
     * Run a function with the given value available in scope
     */
    provide<R>(value: T, fn: () => R): R {
      return storage.run(value, fn)
    },

    /**
     * Get the current scoped value, throws if not in scope
     */
    use(): T {
      const value = storage.getStore()
      if (value === undefined) {
        throw new Error(`No scope available for "${name}"`)
      }
      return value
    },

    /**
     * Get the current scoped value, or undefined if not in scope
     */
    tryUse(): T | undefined {
      return storage.getStore()
    },
  }
}

export type Scope<T> = ReturnType<typeof createScope<T>>
