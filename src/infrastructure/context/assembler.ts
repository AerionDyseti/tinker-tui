import type { SessionEntry, ToolInvocation } from "@/domain/session.ts"
import type {
  Context,
  ContextItem,
  ContextAssemblyOptions,
  TokenBudget,
} from "@/domain/context.ts"
import { createTokenBudget, consumeTokens } from "@/domain/context.ts"

// Legacy alias
type Message = SessionEntry

/**
 * Minimal context assembler.
 * - No filtering: includes all entries that fit
 * - No RAG: ignores knowledge retrieval
 * - Simple truncation: drops oldest entries if over budget
 */
export class ContextAssembler {
  /**
   * Assemble context from session entries.
   * Entries should be in chronological order (oldest first).
   */
  assemble(entries: SessionEntry[], options: ContextAssemblyOptions): Context {
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

    // Convert entries to context items
    const allItems = entries.map((entry) => this.entryToContextItem(entry))

    // Simple strategy: keep as many recent messages as fit
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
        messagesIncluded: includedItems.length,
        messagesFiltered: entries.length - includedItems.length,
        knowledgeIncluded: 0, // No RAG for now
        assembledAt: new Date(),
      },
    }
  }

  /**
   * Convert a SessionEntry to a ContextItem.
   */
  private entryToContextItem(entry: SessionEntry): ContextItem {
    // Extract content - ToolInvocation stores data differently
    let content: string
    if (entry.kind === "tool_invocation") {
      const tool = entry as ToolInvocation
      content = tool.result !== undefined
        ? `[Tool Result: ${tool.toolName}] ${JSON.stringify(tool.result)}`
        : `[Tool Call: ${tool.toolName}] ${JSON.stringify(tool.input)}`
    } else {
      content = (entry as { content: string }).content
    }

    return {
      id: entry.id,
      type: "message",
      content,
      tokens: entry.tokens,
      priority: entry.pinned ? "high" : "medium",
      source: { type: "message", entry },
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
