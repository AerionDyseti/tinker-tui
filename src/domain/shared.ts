/**
 * An embedding with its metadata.
 * Self-describing vector that tracks its provenance.
 */
export interface Embedding {
  vector: number[]
  model: string // e.g., "all-MiniLM-L6-v2"
  dimensions: number // e.g., 384
  createdAt: Date
}

/**
 * Result from a semantic search.
 */
export interface SearchResult<T> {
  item: T
  distance: number
}

/**
 * Embedding dimensions — configurable per project.
 * Default: 384 (sentence-transformers/all-MiniLM-L6-v2)
 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 384
