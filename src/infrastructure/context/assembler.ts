import type { Message } from "@/domain/session.ts"
import type {
  Context,
  ContextItem,
  ContextAssemblyOptions,
  TokenBudget,
} from "@/domain/context.ts"
import { createTokenBudget, consumeTokens } from "@/domain/context.ts"

/**
 * Minimal context assembler.
 * - No filtering: includes all messages that fit
 * - No RAG: ignores knowledge retrieval
 * - Simple truncation: drops oldest messages if over budget
 */
export class ContextAssembler {
  /**
   * Assemble context from messages.
   * Messages should be in chronological order (oldest first).
   */
  assemble(messages: Message[], options: ContextAssemblyOptions): Context {
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

    // Convert messages to context items
    const allItems = messages.map((msg) => this.messageToContextItem(msg))

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
        messagesFiltered: messages.length - includedItems.length,
        knowledgeIncluded: 0, // No RAG for now
        assembledAt: new Date(),
      },
    }
  }

  /**
   * Convert a Message to a ContextItem.
   */
  private messageToContextItem(message: Message): ContextItem {
    return {
      id: message.id,
      type: "message",
      content: message.content,
      tokens: message.tokens,
      priority: message.pinned ? "high" : "medium",
      source: { type: "message", message },
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
