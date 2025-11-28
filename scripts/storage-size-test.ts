/**
 * Quick test to compare LanceDB vs SQLite storage sizes
 */
import { connect } from "@lancedb/lancedb"
import { Database } from "bun:sqlite"
import { mkdirSync, rmSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = "/tmp/storage-test"
const VECTOR_DIM = 384
const NUM_RECORDS = 1000

// Generate random vector
function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random())
}

// Generate test records
function generateRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    sessionId: `session-${i % 10}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `This is message number ${i}. It contains some text that would typically be in a conversation. The quick brown fox jumps over the lazy dog.`,
    embedding: randomVector(VECTOR_DIM),
    createdAt: Date.now(),
  }))
}

// Get directory size recursively
function getDirSize(dir: string): number {
  let size = 0
  for (const file of readdirSync(dir)) {
    const path = join(dir, file)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      size += getDirSize(path)
    } else {
      size += stat.size
    }
  }
  return size
}

async function testLanceDB() {
  const dbPath = join(TEST_DIR, "lancedb")
  mkdirSync(dbPath, { recursive: true })

  const db = await connect(dbPath)
  const records = generateRecords(NUM_RECORDS)

  console.time("LanceDB insert")
  await db.createTable("messages", records)
  console.timeEnd("LanceDB insert")

  db.close()

  const size = getDirSize(dbPath)
  console.log(`LanceDB size: ${(size / 1024).toFixed(2)} KB`)
  return size
}

async function testSQLite() {
  const dbPath = join(TEST_DIR, "sqlite.db")

  const db = new Database(dbPath)
  db.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      role TEXT,
      content TEXT,
      embedding BLOB,
      createdAt INTEGER
    )
  `)

  const records = generateRecords(NUM_RECORDS)
  const insert = db.prepare(`
    INSERT INTO messages (id, sessionId, role, content, embedding, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  console.time("SQLite insert")
  for (const r of records) {
    insert.run(
      r.id,
      r.sessionId,
      r.role,
      r.content,
      Buffer.from(new Float32Array(r.embedding).buffer),
      r.createdAt
    )
  }
  console.timeEnd("SQLite insert")

  db.close()

  const size = statSync(dbPath).size
  console.log(`SQLite size: ${(size / 1024).toFixed(2)} KB`)
  return size
}

// Test multiple record counts
async function runTest(numRecords: number) {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(TEST_DIR, { recursive: true })

  // Regenerate records for this count
  const records = Array.from({ length: numRecords }, (_, i) => ({
    id: `msg-${i}`,
    sessionId: `session-${i % 10}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `This is message number ${i}. It contains some text that would typically be in a conversation. The quick brown fox jumps over the lazy dog.`,
    embedding: randomVector(VECTOR_DIM),
    createdAt: Date.now(),
  }))

  // LanceDB
  const lanceDbPath = join(TEST_DIR, "lancedb")
  mkdirSync(lanceDbPath, { recursive: true })
  const lanceDb = await connect(lanceDbPath)
  await lanceDb.createTable("messages", records)
  lanceDb.close()
  const lanceSize = getDirSize(lanceDbPath)

  // SQLite
  const sqliteDbPath = join(TEST_DIR, "sqlite.db")
  const sqliteDb = new Database(sqliteDbPath)
  sqliteDb.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      role TEXT,
      content TEXT,
      embedding BLOB,
      createdAt INTEGER
    )
  `)
  const insert = sqliteDb.prepare(`
    INSERT INTO messages (id, sessionId, role, content, embedding, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const r of records) {
    insert.run(r.id, r.sessionId, r.role, r.content, Buffer.from(new Float32Array(r.embedding).buffer), r.createdAt)
  }
  sqliteDb.close()
  const sqliteSize = statSync(sqliteDbPath).size

  return { numRecords, lanceSize, sqliteSize, ratio: lanceSize / sqliteSize }
}

console.log(`Vector dimensions: ${VECTOR_DIM}\n`)
console.log("Records | LanceDB   | SQLite    | Ratio")
console.log("--------|-----------|-----------|------")

for (const count of [10, 50, 100, 500, 1000]) {
  const { numRecords, lanceSize, sqliteSize, ratio } = await runTest(count)
  console.log(
    `${numRecords.toString().padStart(7)} | ${(lanceSize / 1024).toFixed(1).padStart(7)} KB | ${(sqliteSize / 1024).toFixed(1).padStart(7)} KB | ${ratio.toFixed(2)}x`
  )
}

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true })
