import type { Embedding } from "@/domain/shared.ts"

// Re-export for convenience
export type { Embedding }

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
  embed(text: string): Promise<Embedding>

  /**
   * Generate embeddings for multiple texts (batch).
   * More efficient than calling embed() in a loop.
   */
  embedBatch(texts: string[]): Promise<Embedding[]>
}
