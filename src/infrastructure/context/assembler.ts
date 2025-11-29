import type { SessionArtifact, ToolUse, ToolResult } from "@/domain/session.ts"
import type {
  Context,
  ContextItem,
  ContextAssemblyOptions,
} from "@/domain/context.ts"
import { createTokenBudget, consumeTokens } from "@/domain/context.ts"

/**
 * Minimal context assembler.
 * - No filtering: includes all artifacts that fit
 * - No RAG: ignores knowledge retrieval
 * - Simple truncation: drops oldest artifacts if over budget
 */
export class ContextAssembler {
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
   * Estimate tokens in system prompt.
   * Simple heuristic: ~4 chars per token.
   */
  private estimateSystemPromptTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4)
  }
}

/**
 * Create a context assembler instance.
 */
export function createContextAssembler(): ContextAssembler {
  return new ContextAssembler()
}
