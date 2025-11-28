import {
  Schema,
  Field,
  Utf8,
  Int64,
  Int32,
  Float32,
  Bool,
  FixedSizeList,
  List,
} from "apache-arrow"

import { DEFAULT_EMBEDDING_DIMENSIONS } from "./types.ts"

/**
 * Arrow schema for the sessions table.
 * Stored per-project.
 */
export const sessionsSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("created_at", new Int64(), false),
  new Field("updated_at", new Int64(), false),
  // SessionMetadata stored as JSON string
  new Field("metadata", new Utf8(), true),
])

/**
 * Arrow schema for the messages table.
 * Stored per-project with inline embeddings.
 *
 * Note: Domain uses "type" and "timestamp", but we store as "message_type" and "created_at"
 * to avoid SQL reserved words and maintain backward compatibility.
 */
export const messagesSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("session_id", new Utf8(), false),
  new Field("message_type", new Utf8(), false), // MessageType (user, assistant, etc.)
  new Field("content", new Utf8(), false),
  new Field("tokens", new Int32(), false),
  new Field("pinned", new Bool(), false),
  // Embedding vector (for vector search)
  new Field(
    "embedding_vector",
    new FixedSizeList(
      DEFAULT_EMBEDDING_DIMENSIONS,
      new Field("item", new Float32(), false)
    ),
    false // required now
  ),
  // Embedding metadata
  new Field("embedding_model", new Utf8(), false),
  new Field("embedding_dimensions", new Int32(), false),
  new Field("embedding_created_at", new Int64(), false),
  // Message timestamp and metadata
  new Field("timestamp", new Int64(), false),
  new Field("metadata", new Utf8(), true), // MessageMetadata as JSON
])

/**
 * Arrow schema for the knowledge table.
 * Stored facts for RAG retrieval.
 */
export const knowledgeSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("content", new Utf8(), false),
  // Embedding vector (for vector search)
  new Field(
    "embedding_vector",
    new FixedSizeList(
      DEFAULT_EMBEDDING_DIMENSIONS,
      new Field("item", new Float32(), false)
    ),
    false // required - knowledge always has embeddings
  ),
  // Embedding metadata
  new Field("embedding_model", new Utf8(), false),
  new Field("embedding_dimensions", new Int32(), false),
  new Field("embedding_created_at", new Int64(), false),
  // Source info
  new Field("source", new Utf8(), false),
  new Field("source_metadata", new Utf8(), false), // KnowledgeSourceMetadata as JSON
  new Field("tags", new List(new Field("item", new Utf8(), false)), false),
  new Field("created_at", new Int64(), false),
  new Field("updated_at", new Int64(), false),
])
