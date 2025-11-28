/**
 * An embedding with its metadata.
 * More than just a vector — tracks provenance and context.
 */
export interface Embedding {
  /** The vector itself */
  vector: number[]

  /** Which embedder created this (e.g., "minilm-l6-v2") */
  embedder: string

  /** What kind of content this embeds (e.g., "message", "memory", "query") */
  type?: string

  /** When the embedding was created */
  createdAt: number
}

/**
 * Core embedder interface.
 * Simple contract: text in, Embedding out.
 */
export interface Embedder {
  /**
   * Unique identifier for this embedder (e.g., "minilm-l6-v2").
   */
  readonly name: string

  /**
   * Embedding dimensions (e.g., 384 for MiniLM).
   */
  readonly dimensions: number

  /**
   * Generate embedding for a single text.
   */
  embed(text: string, type?: string): Promise<Embedding>

  /**
   * Generate embeddings for multiple texts (batch).
   * More efficient than calling embed() in a loop.
   */
  embedBatch(texts: string[], type?: string): Promise<Embedding[]>
}
