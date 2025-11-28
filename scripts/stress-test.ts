/**
 * Stress test: Realistic repo usage simulation
 *
 * Scenario:
 * - 300 sessions
 * - 200 messages per session (60,000 total)
 * - 1.5 memories per message avg (90,000 total)
 */
import { connect, type Table } from "@lancedb/lancedb"
import { mkdirSync, rmSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = "/tmp/stress-test"
const VECTOR_DIM = 384

const NUM_SESSIONS = 300
const MESSAGES_PER_SESSION = 200
const MEMORIES_PER_MESSAGE = 1.5 // average

const TOTAL_MESSAGES = NUM_SESSIONS * MESSAGES_PER_SESSION
const TOTAL_MEMORIES = Math.floor(TOTAL_MESSAGES * MEMORIES_PER_MESSAGE)

// Generate random vector
function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random())
}

// Get directory size recursively
function getDirSize(dir: string): number {
  let size = 0
  try {
    for (const file of readdirSync(dir)) {
      const path = join(dir, file)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        size += getDirSize(path)
      } else {
        size += stat.size
      }
    }
  } catch {
    // ignore
  }
  return size
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function runStressTest() {
  console.log("=== Stress Test: Realistic Repo Usage ===\n")
  console.log(`Sessions: ${NUM_SESSIONS}`)
  console.log(`Messages per session: ${MESSAGES_PER_SESSION}`)
  console.log(`Total messages: ${TOTAL_MESSAGES.toLocaleString()}`)
  console.log(`Memories (avg ${MEMORIES_PER_MESSAGE}/msg): ${TOTAL_MEMORIES.toLocaleString()}`)
  console.log(`Vector dimensions: ${VECTOR_DIM}`)
  console.log("")

  // Cleanup
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "lancedb")
  const db = await connect(dbPath)

  // === SESSIONS ===
  console.log("Creating sessions...")
  const sessions = Array.from({ length: NUM_SESSIONS }, (_, i) => ({
    id: `session-${i}`,
    title: `Session ${i}: Working on feature ${i % 50}`,
    createdAt: Date.now() - (NUM_SESSIONS - i) * 86400000, // spread over days
    updatedAt: Date.now() - (NUM_SESSIONS - i) * 3600000,
  }))

  console.time("Insert sessions")
  await db.createTable("sessions", sessions)
  console.timeEnd("Insert sessions")

  const sessionsSize = getDirSize(dbPath)
  console.log(`Sessions table size: ${formatSize(sessionsSize)}\n`)

  // === MESSAGES ===
  console.log("Creating messages (this may take a while)...")

  // Generate in batches to avoid memory issues
  const BATCH_SIZE = 10000
  let messagesTable: Table | null = null

  console.time("Insert messages")
  for (let batch = 0; batch < Math.ceil(TOTAL_MESSAGES / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, TOTAL_MESSAGES)

    const messages = Array.from({ length: end - start }, (_, i) => {
      const idx = start + i
      const sessionIdx = Math.floor(idx / MESSAGES_PER_SESSION)
      const msgInSession = idx % MESSAGES_PER_SESSION
      return {
        id: `msg-${idx}`,
        sessionId: `session-${sessionIdx}`,
        role: msgInSession % 2 === 0 ? "user" : "assistant",
        content: `Message ${msgInSession} in session ${sessionIdx}. This is a typical conversation message with some code discussion, debugging thoughts, and implementation details. The assistant might include code snippets or explanations here.`,
        embedding: randomVector(VECTOR_DIM),
        createdAt: Date.now() - (TOTAL_MESSAGES - idx) * 1000,
      }
    })

    if (batch === 0) {
      messagesTable = await db.createTable("messages", messages)
    } else {
      await messagesTable!.add(messages)
    }

    process.stdout.write(`  Batch ${batch + 1}/${Math.ceil(TOTAL_MESSAGES / BATCH_SIZE)} (${end.toLocaleString()} messages)\r`)
  }
  console.timeEnd("\nInsert messages")

  const messagesSize = getDirSize(dbPath) - sessionsSize
  console.log(`Messages table size: ${formatSize(messagesSize)}\n`)

  // === MEMORIES ===
  console.log("Creating memories...")

  let memoriesTable: Table | null = null

  console.time("Insert memories")
  for (let batch = 0; batch < Math.ceil(TOTAL_MEMORIES / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, TOTAL_MEMORIES)

    const memories = Array.from({ length: end - start }, (_, i) => {
      const idx = start + i
      const sourceMessageIdx = Math.floor(idx / MEMORIES_PER_MESSAGE)
      return {
        id: `mem-${idx}`,
        content: `Learned fact #${idx}: The user prefers using TypeScript with strict mode. They like functional patterns and avoid classes when possible. This codebase uses Bun as the runtime.`,
        embedding: randomVector(VECTOR_DIM),
        source: idx % 3 === 0 ? "conversation" : idx % 3 === 1 ? "user" : "code",
        sourceId: `msg-${sourceMessageIdx}`,
        tags: ["typescript", "preference", `tag-${idx % 20}`],
        createdAt: Date.now() - (TOTAL_MEMORIES - idx) * 500,
        updatedAt: Date.now() - (TOTAL_MEMORIES - idx) * 100,
      }
    })

    if (batch === 0) {
      memoriesTable = await db.createTable("memories", memories)
    } else {
      await memoriesTable!.add(memories)
    }

    process.stdout.write(`  Batch ${batch + 1}/${Math.ceil(TOTAL_MEMORIES / BATCH_SIZE)} (${end.toLocaleString()} memories)\r`)
  }
  console.timeEnd("\nInsert memories")

  const totalSize = getDirSize(dbPath)
  const memoriesSize = totalSize - messagesSize - sessionsSize
  console.log(`Memories table size: ${formatSize(memoriesSize)}\n`)

  // === QUERY PERFORMANCE ===
  console.log("=== Query Performance ===\n")

  // Vector search on messages
  const queryVector = randomVector(VECTOR_DIM)

  console.time("Vector search (messages, top 10)")
  const msgResults = await messagesTable!.vectorSearch(queryVector).limit(10).toArray()
  console.timeEnd("Vector search (messages, top 10)")
  console.log(`  Found ${msgResults.length} results`)

  // Vector search on memories
  console.time("Vector search (memories, top 10)")
  const memResults = await memoriesTable!.vectorSearch(queryVector).limit(10).toArray()
  console.timeEnd("Vector search (memories, top 10)")
  console.log(`  Found ${memResults.length} results`)

  // Filtered search (note: LanceDB is case-sensitive, use double quotes)
  console.time("Vector search + filter (session-50)")
  const filteredResults = await messagesTable!
    .vectorSearch(queryVector)
    .where(`"sessionId" = 'session-50'`)
    .limit(10)
    .toArray()
  console.timeEnd("Vector search + filter (session-50)")
  console.log(`  Found ${filteredResults.length} results`)

  // Get all messages in a session
  console.time("Get session messages (session-100)")
  const sessionMsgs = await messagesTable!
    .query()
    .where(`"sessionId" = 'session-100'`)
    .toArray()
  console.timeEnd("Get session messages (session-100)")
  console.log(`  Found ${sessionMsgs.length} messages`)

  // === SUMMARY ===
  console.log("\n=== Storage Summary ===\n")
  console.log(`Sessions (${NUM_SESSIONS}):        ${formatSize(sessionsSize)}`)
  console.log(`Messages (${TOTAL_MESSAGES.toLocaleString()}):      ${formatSize(messagesSize)}`)
  console.log(`Memories (${TOTAL_MEMORIES.toLocaleString()}):      ${formatSize(memoriesSize)}`)
  console.log(`─────────────────────────────`)
  console.log(`TOTAL:                   ${formatSize(totalSize)}`)
  console.log(`Per message avg:         ${formatSize(totalSize / TOTAL_MESSAGES)}`)

  db.close()

  // Cleanup
  rmSync(TEST_DIR, { recursive: true, force: true })
}

await runStressTest()
