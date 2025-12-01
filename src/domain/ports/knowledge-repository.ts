/**
 * KnowledgeRepository Port — Contract for knowledge persistence and retrieval.
 *
 * This port abstracts the storage and vector search of knowledge items
 * used for RAG (Retrieval Augmented Generation).
 */

import type { Knowledge, KnowledgeSource, KnowledgeSourceMetadata } from "../knowledge.ts"
import type { Embedding } from "../shared.ts"

/**
 * Repository for Knowledge entities.
 */
export interface KnowledgeRepository {
  /**
   * Add a new knowledge item.
   */
  addKnowledge(
    content: string,
    embedding: Embedding,
    source: KnowledgeSource,
    sourceMetadata: KnowledgeSourceMetadata,
    tags?: string[]
  ): Promise<Knowledge>

  /**
   * Get a knowledge item by ID.
   */
  getKnowledge(id: string): Promise<Knowledge | null>

  /**
   * List knowledge items with optional filtering.
   */
  listKnowledge(options?: {
    source?: KnowledgeSource
    tags?: string[]
    limit?: number
  }): Promise<Knowledge[]>

  /**
   * Update a knowledge item.
   */
  updateKnowledge(
    id: string,
    updates: {
      content?: string
      embedding?: Embedding
      tags?: string[]
    }
  ): Promise<Knowledge | null>

  /**
   * Delete a knowledge item.
   */
  deleteKnowledge(id: string): Promise<boolean>

  /**
   * Search knowledge by vector similarity.
   */
  searchKnowledge(
    queryEmbedding: number[],
    options?: {
      limit?: number
      source?: KnowledgeSource
    }
  ): Promise<Array<{ item: Knowledge; distance: number }>>

  /**
   * Count knowledge items, optionally filtered by source.
   */
  countKnowledge(source?: KnowledgeSource): Promise<number>
}
