import { test, expect } from "bun:test"
import { lazy, defer, LazyPromise } from "@/util/lazy.ts"

test("lazy() computes value once", () => {
  let callCount = 0
  const lazyValue = lazy(() => {
    callCount++
    return 42
  })

  expect(callCount).toBe(0)

  const first = lazyValue()
  expect(first).toBe(42)
  expect(callCount).toBe(1)

  const second = lazyValue()
  expect(second).toBe(42)
  expect(callCount).toBe(1) // still 1, not called again
})

test("defer() creates a deferred promise", async () => {
  const deferred = defer<string>()

  let resolved = false
  deferred.promise.then(() => {
    resolved = true
  })

  expect(resolved).toBe(false)

  deferred.resolve("done")
  await deferred.promise

  expect(resolved).toBe(true)
})

test("LazyPromise executes on .then()", async () => {
  let callCount = 0

  const lazyPromise = new LazyPromise((resolve) => {
    callCount++
    resolve("result")
  })

  expect(callCount).toBe(0)

  const result = await lazyPromise.then((r) => r)
  expect(result).toBe("result")
  expect(callCount).toBe(1)
})
