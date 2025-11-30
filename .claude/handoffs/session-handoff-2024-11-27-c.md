# Session Handoff: tinker-tui

**Date:** 2024-11-27 (Session C)
**Project:** tinker-tui - Terminal UI for LLM interactions

---

## Session Overview

**Primary Goal:** Build the application layer (ConversationService) and a POC CLI to test the end-to-end flow.

**Current Status:** Application layer complete. ConversationService orchestrates chat flow. POC CLI working with debug server. Test coverage at 94.54% lines / 91.92% functions (both above 90% target).

---

## Key Accomplishments This Session

### 1. ConversationService (`src/application/conversation.ts`)
The main orchestrator that ties infrastructure together:
- Creates/loads sessions via ProjectStorage
- Processes user input → embeds with MiniLMEmbedder → stores in DB
- Assembles context using ContextAssembler with token budget
- Calls provider for streaming completion
- Stores assistant response back to DB

```typescript
// Event-based streaming pattern for TUI integration
export type ConversationEvent =
  | { type: "user_message"; message: Message }
  | { type: "context_assembled"; context: Context }
  | { type: "stream_start" }
  | { type: "stream_chunk"; content: string }
  | { type: "stream_end"; usage?: StreamChunk["usage"] }
  | { type: "assistant_message"; message: Message }
  | { type: "error"; error: Error }
```

### 2. POC CLI (`src/cli/poc.ts`)
Minimal readline-based chat interface:
```bash
bun run chat                              # Uses debug provider
bun run chat --provider openrouter        # Uses OpenRouter
bun run chat --provider openrouter --model anthropic/claude-3.5-sonnet
```

Commands: `/quit`, `/clear`, `/info`

### 3. Debug Server Simplification
- Removed Shift+Tab toggle (wasn't working reliably)
- Now just use `--raw` flag: `bun run debug-server --raw`

### 4. Test Coverage Improvements
- Added `test/project-state.test.ts` for lazy initialization
- Line coverage: 94.54% ✅
- Function coverage: 91.92% ✅
- DebugProvider intentionally excluded (manual testing tool)

---

## Project Structure

```
/home/aerion/dev/tinker-tui/
├── src/
│   ├── domain/                  # Domain types
│   │   ├── shared.ts            # Embedding, SearchResult
│   │   ├── session.ts           # Session, Message, MessageType
│   │   ├── knowledge.ts         # Knowledge entity
│   │   ├── context.ts           # TokenBudget, Context
│   │   └── provider.ts          # Provider interface
│   ├── infrastructure/
│   │   ├── config/              # Instance + Project config
│   │   ├── persistence/         # ProjectStorage (LanceDB)
│   │   ├── embedding/           # MiniLMEmbedder
│   │   ├── provider/            # OpenRouterProvider, DebugProvider
│   │   ├── context/             # ContextAssembler
│   │   └── project/             # Git detection, ProjectState
│   ├── application/             # NEW: Application layer
│   │   ├── conversation.ts      # ConversationService
│   │   └── index.ts
│   ├── cli/                     # NEW: CLI
│   │   └── poc.ts               # POC readline chat
│   └── tools/
│       └── debug-server.ts      # Mock LLM endpoint
├── test/
│   ├── project-state.test.ts    # NEW: Lazy init tests
│   └── ...                      # 73 tests total
└── package.json
```

---

## Key Commands

```bash
bun test                              # Run all tests (73 pass)
bun test --coverage                   # With coverage report
bun run typecheck                     # TypeScript check
bun run debug-server                  # Start debug server (formatted)
bun run debug-server --raw            # Debug server (raw JSON)
bun run chat                          # POC CLI (debug provider)
bun run chat --provider openrouter    # POC CLI (OpenRouter)
```

---

## Git Status

```
Branch: master
Latest commits:
- 4bd4224 test: add project state lazy initialization tests
- 11cd9b4 feat: add ConversationService and POC CLI
- 9b174f1 feat: enhance debug server with OpenAI-compatible endpoint
```

All changes committed and pushed.

---

## What's Complete ✓

| Component | Location | Status |
|-----------|----------|--------|
| Domain types | `src/domain/` | ✅ |
| Persistence (LanceDB) | `src/infrastructure/persistence/` | ✅ |
| Embedding (MiniLM) | `src/infrastructure/embedding/` | ✅ |
| OpenRouter provider | `src/infrastructure/provider/openrouter.ts` | ✅ |
| Debug provider | `src/infrastructure/provider/debug.ts` | ✅ |
| Debug server | `src/tools/debug-server.ts` | ✅ |
| Context assembler | `src/infrastructure/context/assembler.ts` | ✅ |
| Config resolution | `src/infrastructure/config/` | ✅ |
| **ConversationService** | `src/application/conversation.ts` | ✅ NEW |
| **POC CLI** | `src/cli/poc.ts` | ✅ NEW |
| Test coverage >90% | `test/` | ✅ |

---

## What's Next

1. **TUI** - Start the actual terminal interface with `@opentui/solid`
2. **Context Assembler Enhancements** (future):
   - Summarize instead of truncate (use `summary` slot)
   - Filter semantically irrelevant messages
   - Inject RAG knowledge from vector search

---

## Important Patterns

### Imports (no barrel exports in domain)
```typescript
import type { Message } from "@/domain/session.ts"
import type { Context } from "@/domain/context.ts"
import { ConversationService } from "@/application/index.ts"
```

### Using ConversationService
```typescript
const service = new ConversationService({
  provider,
  storage,
  embedder,
  systemPrompt: "You are helpful.",
  responseReserve: 1024,
})

await service.startSession()

for await (const event of service.chat("Hello!")) {
  if (event.type === "stream_chunk") {
    process.stdout.write(event.content)
  }
}
```

### Git Commit Preference
- Include `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Do NOT include `Co-Authored-By: Claude <noreply@anthropic.com>`

---

## Startup Command

```bash
cd /home/aerion/dev/tinker-tui && claude
```

Then provide context:
> "Continue building tinker-tui. Check the session handoff at `.claude/session-handoff-2024-11-27-c.md`. Application layer complete (ConversationService + POC CLI). Test coverage >90%. Ready for TUI implementation."

---

## Test Coverage Summary

```
All files: 91.92% funcs | 94.54% lines

Key files at 100%:
- domain/*.ts
- infrastructure/config/*.ts
- infrastructure/context/*.ts
- infrastructure/persistence/*.ts
- infrastructure/project/state.ts
- util/lazy.ts

Intentionally low (manual testing tool):
- provider/debug.ts: 0% funcs | 3.25% lines
```
