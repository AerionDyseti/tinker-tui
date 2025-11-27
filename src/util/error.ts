import { z } from "zod"

/**
 * Create a named error class with optional data validation.
 *
 * Usage:
 *   const NotFoundError = createError("NotFoundError", z.object({ id: z.string() }))
 *   throw new NotFoundError("User not found", { id: "123" })
 *
 *   // Later:
 *   if (NotFoundError.is(err)) {
 *     console.log(err.data.id) // typed as string
 *   }
 */
export function createError<T extends z.ZodSchema>(
  name: string,
  schema?: T
) {
  return class extends Error {
    override readonly name = name
    readonly data: z.infer<T> | undefined

    constructor(message: string, data?: z.infer<T>) {
      super(message)
      this.data = schema && data ? schema.parse(data) : data
      Error.captureStackTrace(this, this.constructor)
    }

    static is(error: unknown): error is InstanceType<typeof this> {
      return error instanceof Error && error.name === name
    }
  }
}

// Common errors for the application
export const NotFoundError = createError(
  "NotFoundError",
  z.object({
    resource: z.string(),
    id: z.string().optional(),
  })
)

export const ValidationError = createError(
  "ValidationError",
  z.object({
    field: z.string().optional(),
    expected: z.string().optional(),
    received: z.string().optional(),
  })
)

export const ConfigError = createError(
  "ConfigError",
  z.object({
    path: z.string().optional(),
    key: z.string().optional(),
  })
)

export const StorageError = createError(
  "StorageError",
  z.object({
    operation: z.enum(["read", "write", "delete", "list"]),
    key: z.string().optional(),
  })
)
