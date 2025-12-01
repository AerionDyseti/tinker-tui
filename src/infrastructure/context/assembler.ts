import type { SessionArtifact, ToolUse, ToolResult } from "@/domain/session.ts"
import type {
  Context,
  ContextItem,
  ContextAssemblyOptions,
} from "@/domain/context.ts"
import { createTokenBudget, consumeTokens } from "@/domain/context.ts"
import type {
  KnowledgeAwareAssembler,
  ContextAssemblyRequest,
  ArtifactRepository,
  KnowledgeRepository,
} from "@/domain/ports/index.ts"
import type { Knowledge } from "@/domain/knowledge.ts"

/**
 * Dependencies for context assembler with retrieval capabilities.
 */
export interface ContextAssemblerDependencies {
  artifactRepository?: ArtifactRepository
  knowledgeRepository?: KnowledgeRepository
}

/**
 * Context assembler implementation.
 * - Basic mode: accepts artifacts directly via assemble()
 * - Retrieval mode: fetches from repositories via assembleWithRetrieval()
 * - Optional RAG: includes knowledge when knowledgeRepository is provided
 */
export class ContextAssembler implements KnowledgeAwareAssembler {
  private readonly artifactRepository?: ArtifactRepository
  private readonly knowledgeRepository?: KnowledgeRepository

  constructor(deps: ContextAssemblerDependencies = {}) {
    this.artifactRepository = deps.artifactRepository
    this.knowledgeRepository = deps.knowledgeRepository
  }

  /**
   * Assemble context by fetching from repositories.
   * This is the preferred method when repositories are available.
   */
  async assembleWithRetrieval(request: ContextAssemblyRequest): Promise<Context> {
    if (!this.artifactRepository) {
      throw new Error("assembleWithRetrieval requires artifactRepository dependency")
    }

    // Fetch artifacts from repository
    const artifacts = await this.artifactRepository.getArtifacts(request.sessionId)

    // Optionally fetch knowledge via vector search
    let knowledge: Knowledge[] = []
    if (request.knowledgeQuery && this.knowledgeRepository) {
      const results = await this.knowledgeRepository.searchKnowledge(
        request.knowledgeQuery.embedding,
        { limit: request.knowledgeQuery.limit ?? 5 }
      )
      knowledge = results.map((r) => r.item)
    }

    // Use the base assemble with knowledge included
    return this.assembleWithKnowledge(artifacts, knowledge, request)
  }

  /**
   * Assemble context including retrieved knowledge.
   */
  assembleWithKnowledge(
    artifacts: SessionArtifact[],
    knowledge: Knowledge[],
    options: ContextAssemblyOptions
  ): Context {
    // Calculate system prompt tokens if not explicitly reserved
    const systemTokens =
      options.reservations?.system ??
      (options.systemPrompt ? this.estimateSystemPromptTokens(options.systemPrompt) : 0)

    // Reserve tokens for knowledge (estimate ~4 chars per token)
    const knowledgeTokens = knowledge.reduce(
      (sum, k) => sum + Math.ceil(k.content.length / 4),
      0
    )

    // Initialize budget with reservations
    let budget = createTokenBudget({
      total: options.maxTokens,
      reserved: {
        ...options.reservations,
        system: systemTokens,
        knowledge: knowledgeTokens,
      },
    })

    // Convert artifacts to context items
    const artifactItems = artifacts.map((artifact) => this.artifactToContextItem(artifact))

    // Convert knowledge to context items (high priority)
    const knowledgeItems = knowledge.map((k) => this.knowledgeToContextItem(k))

    // Simple strategy: keep as many recent artifacts as fit
    const includedArtifactItems: ContextItem[] = []
    let tokensUsed = 0

    for (let i = artifactItems.length - 1; i >= 0; i--) {
      const item = artifactItems[i]!
      if (tokensUsed + item.tokens <= budget.available) {
        includedArtifactItems.unshift(item)
        tokensUsed += item.tokens
      }
    }

    // Combine: knowledge first (context), then artifacts (conversation)
    const includedItems = [...knowledgeItems, ...includedArtifactItems]

    // Update budget with actual usage
    budget = consumeTokens(budget, tokensUsed + knowledgeTokens)

    return {
      systemPrompt: options.systemPrompt,
      items: includedItems,
      budget,
      metadata: {
        artifactsIncluded: includedArtifactItems.length,
        artifactsFiltered: artifacts.length - includedArtifactItems.length,
        knowledgeIncluded: knowledge.length,
        assembledAt: new Date(),
      },
    }
  }

  /**
   * Assemble context from session artifacts.
   * Artifacts should be in chronological order (oldest first).
   */
  assemble(artifacts: SessionArtifact[], options: ContextAssemblyOptions): Context {
    // Calculate system prompt tokens if not explicitly reserved
    const systemTokens =
      options.reservations?.system ??
      (options.systemPrompt ? this.estimateSystemPromptTokens(options.systemPrompt) : 0)

    // Initialize budget with reservations
    let budget = createTokenBudget({
      total: options.maxTokens,
      reserved: {
        ...options.reservations,
        system: systemTokens,
      },
    })

    // Convert artifacts to context items
    const allItems = artifacts.map((artifact) => this.artifactToContextItem(artifact))

    // Simple strategy: keep as many recent artifacts as fit
    // Start from the end (most recent) and work backwards
    const includedItems: ContextItem[] = []
    let tokensUsed = 0

    for (let i = allItems.length - 1; i >= 0; i--) {
      const item = allItems[i]!
      if (tokensUsed + item.tokens <= budget.available) {
        includedItems.unshift(item) // Add to front to maintain order
        tokensUsed += item.tokens
      }
      // If it doesn't fit, skip it (simple truncation)
    }

    // Update budget with actual usage
    budget = consumeTokens(budget, tokensUsed)

    return {
      systemPrompt: options.systemPrompt,
      items: includedItems,
      budget,
      metadata: {
        artifactsIncluded: includedItems.length,
        artifactsFiltered: artifacts.length - includedItems.length,
        knowledgeIncluded: 0, // No RAG for now
        assembledAt: new Date(),
      },
    }
  }

  /**
   * Convert a SessionArtifact to a ContextItem.
   */
  private artifactToContextItem(artifact: SessionArtifact): ContextItem {
    // Extract content based on artifact kind
    let content: string
    if (artifact.kind === "tool_use") {
      const tool = artifact as ToolUse
      content = `[Tool Call: ${tool.toolName}] ${JSON.stringify(tool.input)}`
    } else if (artifact.kind === "tool_result") {
      const tool = artifact as ToolResult
      content = `[Tool Result] ${JSON.stringify(tool.result)}`
    } else {
      content = (artifact as { content: string }).content
    }

    return {
      id: artifact.id,
      type: "artifact",
      content,
      tokens: artifact.tokens,
      priority: artifact.pinned ? "high" : "medium",
      source: { type: "artifact", artifact },
    }
  }

  /**
   * Convert a Knowledge item to a ContextItem.
   */
  private knowledgeToContextItem(knowledge: Knowledge): ContextItem {
    return {
      id: knowledge.id,
      type: "knowledge",
      content: knowledge.content,
      tokens: Math.ceil(knowledge.content.length / 4), // Estimate
      priority: "high", // Knowledge is high priority context
      source: { type: "knowledge", knowledge },
    }
  }

  /**
   * Estimate tokens in system prompt.
   * Simple heuristic: ~4 chars per token.
   */
  private estimateSystemPromptTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4)
  }
}

/**
 * Create a context assembler instance.
 * Pass dependencies to enable retrieval mode.
 */
export function createContextAssembler(
  deps: ContextAssemblerDependencies = {}
): ContextAssembler {
  return new ContextAssembler(deps)
}
