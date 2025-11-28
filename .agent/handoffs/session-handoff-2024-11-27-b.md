# Session Handoff: tinker-tui

**Date:** 2024-11-27 (Session B)
**Project:** tinker-tui - Terminal UI for LLM interactions

---

## Session Overview

**Primary Goal:** Build infrastructure layer components for tinker-tui - providers, context assembly, and debugging tools.

**Current Status:** Core infrastructure complete. OpenRouter provider, context assembler, and debug server all working. Ready for application layer or TUI.

---

## Key Accomplishments This Session

### 1. Domain Layer Restructured
Flattened domain folders into single files:
```
src/domain/
├── shared.ts      # Embedding, SearchResult, DEFAULT_EMBEDDING_DIMENSIONS
├── session.ts     # Session, Message, MessageType (renamed from conversation.ts)
├── knowledge.ts   # Knowledge (renamed from Memory)
├── context.ts     # TokenBudget, TokenReservations, Context, strategies
└── provider.ts    # Provider interface, streaming types
```
- Removed barrel export (index.ts) - other layers import from specific files
- Renamed "Memory" → "Knowledge" throughout (entity + MessageType)

### 2. TokenBudget with Explicit Slots
```typescript
interface TokenReservations {
  system: number     // System prompt (ceiling)
  tools: number      // MCP tool definitions (ceiling)
  resources: number  // MCP resources (ceiling)
  knowledge: number  // RAG-retrieved (ceiling)
  summary: number    // Compressed history (ceiling)
  response: number   // Model output (FIXED)
}
```
All slots except `response` are ceilings - unused space flows to messages.

### 3. OpenRouterProvider Implementation
`src/infrastructure/provider/openrouter.ts`:
- OpenAI-compatible API format
- SSE streaming with proper chunk parsing
- Tool call accumulation across chunks
- Model capability presets for common models
- Can point `baseUrl` at debug server for testing

### 4. ContextAssembler (Minimal)
`src/infrastructure/context/assembler.ts`:
- Takes all messages (no filtering)
- Truncates oldest if over budget
- Skips RAG for now
- Returns Context ready for provider

### 5. Debug Server + DebugProvider
Two-part debugging tool for testing without API calls:

**Debug Server** (`src/tools/debug-server.ts`):
```bash
bun run debug-server
```
- POST `/complete` - Native DebugProvider format
- POST `/v1/chat/completions` - OpenAI-compatible with SSE
- Shift+Tab toggles JSON/formatted display
- `--raw` flag for raw JSON mode

**DebugProvider** (`src/infrastructure/provider/debug.ts`):
- Implements Provider interface
- Sends to debug server via HTTP

**Testing real providers:**
```typescript
// Point OpenRouterProvider at debug server
const provider = new OpenRouterProvider({
  apiKey: "fake",
  model: "test",
  baseUrl: "http://localhost:7331/v1",  // debug server!
})
```

---

## Project Structure

```
/home/aerion/dev/tinker-tui/
├── src/
│   ├── domain/
│   │   ├── shared.ts        # Embedding, SearchResult
│   │   ├── session.ts       # Session, Message, MessageType
│   │   ├── knowledge.ts     # Knowledge entity
│   │   ├── context.ts       # TokenBudget, Context
│   │   └── provider.ts      # Provider interface
│   ├── infrastructure/
│   │   ├── config/          # Instance + Project config
│   │   ├── persistence/     # ProjectStorage (LanceDB)
│   │   ├── embedding/       # MiniLMEmbedder
│   │   ├── provider/        # OpenRouterProvider, DebugProvider
│   │   ├── context/         # ContextAssembler
│   │   └── project/         # Git detection
│   ├── tools/
│   │   └── debug-server.ts  # Mock LLM endpoint
│   └── util/                # Logging, lazy, error, scope
├── scripts/
│   └── debug-demo.ts        # Demo: bun run scripts/debug-demo.ts [native|openrouter]
├── test/
│   ├── storage.test.ts      # 39 tests
│   ├── openrouter.test.ts   # 17 tests
│   ├── context.test.ts      # 11 tests
│   └── ...
└── package.json
```

---

## Key Commands

```bash
bun test                              # Run all tests (67 pass, 1 skip)
bun run typecheck                     # TypeScript check
bun run debug-server                  # Start debug server
bun run debug-server --raw            # Debug server with raw JSON
bun run scripts/debug-demo.ts         # Test with DebugProvider
bun run scripts/debug-demo.ts openrouter  # Test with real OpenRouterProvider
```

---

## Git Status

```
Branch: master
Latest commits:
- 211ea7f feat: add DebugServer + DebugProvider for manual testing
- 4c2dd80 feat: add ContextAssembler with explicit token budget slots
- 47dc925 refactor: restructure to domain/infrastructure layers + add OpenRouter provider
```

**Uncommitted changes:** Debug server improvements (Shift+Tab toggle, raw JSON mode)

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

---

## What's Next

1. **Commit debug server improvements** - Shift+Tab toggle, simplified keybinds
2. **Application service** - `ConversationService` that orchestrates: user input → assemble context → call provider → store response
3. **TUI** - Start the actual terminal interface with @opentui/solid

### Future Context Assembler Enhancements
1. Summarize instead of truncate (reserve `summary` slot)
2. Filter semantically irrelevant messages before assembly
3. Inject RAG knowledge from vector search

---

## Important Patterns

### Imports (no barrel exports)
```typescript
import type { Message } from "@/domain/session.ts"
import type { Knowledge } from "@/domain/knowledge.ts"
import type { Embedding } from "@/domain/shared.ts"
import { createTokenBudget } from "@/domain/context.ts"
```

### Testing with Debug Server
```typescript
// Terminal 1: bun run debug-server
// Terminal 2:
const provider = new OpenRouterProvider({
  apiKey: "fake",
  model: "test",
  baseUrl: "http://localhost:7331/v1",
})
// See REAL OpenAI payload in debug server!
```

---

## Startup Command

```bash
cd /home/aerion/dev/tinker-tui && claude
```

Then provide context:
> "Continue building tinker-tui. Check the session handoff at `.claude/session-handoff-2024-11-27-b.md`. We completed the infrastructure layer (providers, context assembly, debug server). Ready for application layer or TUI."

---

## Session Artifacts

### Debug Server Usage
```bash
# Start server
bun run debug-server

# Toggle display: Shift+Tab
# Endpoints:
#   POST /complete            - DebugProvider format
#   POST /v1/chat/completions - OpenAI format (SSE)
```

### Context Assembly
```typescript
const assembler = new ContextAssembler()
const context = assembler.assemble(messages, {
  maxTokens: 4096,
  systemPrompt: "You are helpful.",
  reservations: { response: 500, knowledge: 200 },
})
// context ready for provider.complete(context)
```
