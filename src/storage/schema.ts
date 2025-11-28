import {
  Schema,
  Field,
  Utf8,
  Int64,
  Float32,
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
  new Field("title", new Utf8(), true),
  new Field("created_at", new Int64(), false),
  new Field("updated_at", new Int64(), false),
])

/**
 * Arrow schema for the messages table.
 * Stored per-project with inline embeddings.
 */
export const messagesSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("session_id", new Utf8(), false),
  new Field("role", new Utf8(), false),
  new Field("content", new Utf8(), false),
  new Field(
    "embedding",
    new FixedSizeList(
      DEFAULT_EMBEDDING_DIMENSIONS,
      new Field("item", new Float32(), false)
    ),
    true // nullable until embedding is generated
  ),
  new Field("created_at", new Int64(), false),
])

/**
 * Arrow schema for the memories table.
 * Stored at instance level (~/.tinker/).
 */
export const memoriesSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("content", new Utf8(), false),
  new Field(
    "embedding",
    new FixedSizeList(
      DEFAULT_EMBEDDING_DIMENSIONS,
      new Field("item", new Float32(), false)
    ),
    false // required - memories always have embeddings
  ),
  new Field("source", new Utf8(), false),
  new Field("source_id", new Utf8(), true),
  new Field("tags", new List(new Field("item", new Utf8(), false)), false),
  new Field("created_at", new Int64(), false),
  new Field("updated_at", new Int64(), false),
])
