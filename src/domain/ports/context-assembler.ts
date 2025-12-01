/**
 * ContextAssembler Port — Contract for building LLM context.
 *
 * The ContextAssembler is responsible for:
 * 1. Fetching relevant artifacts from the session
 * 2. Optionally retrieving knowledge via vector search
 * 3. Prioritizing and budgeting content to fit token limits
 * 4. Producing a Context object ready for the LLM
 */

import type { Context, ContextAssemblyOptions } from "../context.ts"
import type { SessionArtifact } from "../session.ts"
import type { Knowledge } from "../knowledge.ts"

/**
 * Options for context assembly that may include retrieval.
 */
export interface ContextAssemblyRequest extends ContextAssemblyOptions {
  /** Session ID to fetch artifacts from */
  sessionId: string

  /** Optional query for knowledge retrieval */
  knowledgeQuery?: {
    embedding: number[]
    limit?: number
  }
}

/**
 * Interface for context assembly.
 *
 * Implementations may be:
 * - Simple: just pack artifacts into context
 * - RAG-enabled: also search and include knowledge
 * - Future: include Entity definitions (GraphRAG)
 */
export interface ContextAssembler {
  /**
   * Assemble context from artifacts (basic assembly).
   * Used when artifacts are already available.
   */
  assemble(artifacts: SessionArtifact[], options: ContextAssemblyOptions): Context

  /**
   * Assemble context with optional knowledge retrieval.
   * Used when the assembler should fetch its own data.
   */
  assembleWithRetrieval?(request: ContextAssemblyRequest): Promise<Context>
}

/**
 * Extended assembler that can include knowledge in context.
 */
export interface KnowledgeAwareAssembler extends ContextAssembler {
  /**
   * Assemble context including retrieved knowledge.
   */
  assembleWithKnowledge(
    artifacts: SessionArtifact[],
    knowledge: Knowledge[],
    options: ContextAssemblyOptions
  ): Context
}
