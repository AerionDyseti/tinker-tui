# Session Handoff: tinker-tui

**Date:** 2024-11-27
**Project:** tinker-tui - Terminal UI for LLM interactions

---

## Session Overview

**Primary Goal:** Build the foundation architecture for tinker-tui, a TUI application for interacting with LLMs.

**Current Status:** Core architecture complete with Instance/Project/Config model. Ready for next phase (Storage, Event Bus, or Session layer).

---

## Key Architecture Decisions

### Domain Model (Ubiquitous Language)
| Term | Meaning |
|------|---------|
| **Instance** | Running process — holds global state (singleton) |
| **Project** | Directory context — git-detected workspace |
| **Session** | A conversation (not yet implemented) |
| **Config** | Settings — instance-level defaults + project overrides |

### Config Model
- **Instance-level:** Full `Config` with defaults (stored in `~/.tinker/config.json`)
- **Project-level:** `Partial<Config>` overrides (stored in `{project}/.tinker/config.json`)
- **Resolution:** `resolveConfig(instance, project)` merges them

### Provider Configuration (Discriminated Union)
```typescript
type ProviderConfig =
  | { type: "claude-code"; model: string }           // Uses Claude Code auth token
  | { type: "openrouter"; model: string; apiKey: string; baseUrl?: string }
  | { type: "local"; model: string; baseUrl: string; runtime: "ollama" | "lmstudio" | "llamacpp" | "other" }
```

### Why Global Singleton (not AsyncLocalStorage)
- Single-user TUI doesn't need concurrent isolation
- Simpler to read and debug
- Allows future multi-project support
- Abstraction layer allows swap to Solid.js signals/stores for reactivity

---

## Project Structure

```
/home/aerion/dev/tinker-tui/
├── src/
│   ├── config/
│   │   ├── types.ts      # Config, ProviderConfig, DEFAULT_CONFIG
│   │   ├── resolve.ts    # resolveConfig() deep merge
│   │   └── index.ts      # barrel exports
│   ├── instance/
│   │   ├── types.ts      # InstanceState interface
│   │   └── index.ts      # Instance singleton
│   ├── project/
│   │   ├── project.ts    # detectProject() - git root detection
│   │   ├── state.ts      # ProjectState, createProjectState()
│   │   └── index.ts      # barrel exports
│   └── util/
│       ├── scope.ts      # AsyncLocalStorage wrapper (renamed from context)
│       ├── error.ts      # createError() factory
│       ├── log.ts        # consola wrapper
│       ├── lazy.ts       # lazy(), defer, LazyPromise wrappers
│       └── index.ts      # barrel exports
├── test/
│   ├── instance.test.ts  # 7 tests
│   ├── config.test.ts    # 4 tests
│   └── lazy.test.ts      # 3 tests
├── .claude/
│   └── output-styles/
│       └── deliberate.md # Custom output style
├── CLAUDE.md             # Bun-specific instructions
├── package.json
└── tsconfig.json
```

---

## Tech Stack

- **Runtime:** Bun
- **TUI:** @opentui/solid + Solid.js
- **Validation:** Zod
- **CLI:** Yargs
- **Logging:** consola (wrapped)
- **Async utils:** p-defer, p-lazy (wrapped)
- **Testing:** bun test (93.88% coverage)

---

## Key APIs

### Instance (Global State)
```typescript
import { Instance } from "@/instance"

Instance.config                    // Get global config
Instance.setConfig(config)         // Replace entire config
Instance.updateConfig(partial)     // Update specific fields

await Instance.openProject(dir)    // Open & set active
Instance.activeProject             // Get current project
Instance.closeProject(path)        // Close by path
Instance.setActiveProject(path)    // Switch active

Instance.reset()                   // For testing
```

### Config Resolution
```typescript
import { resolveConfig, DEFAULT_CONFIG } from "@/config"

const resolved = resolveConfig(Instance.config, await project.config())
```

### Project Detection
```typescript
import { detectProject } from "@/project"

const info = await detectProject("/path/to/dir")
// { root: "/abs/path", name: "dirname", isGit: true, branch: "main" }
```

---

## User Preferences (from this session)

1. **Libraries over custom code** - Use existing packages (consola, p-defer) with thin wrappers
2. **80%+ test coverage** before commits
3. **No Co-Authored-By** in git commits (keep "Generated with Claude Code")
4. **Partial over DeepPartial** - Simpler, avoids discriminated union issues
5. **"Scope" not "Context"** - Reserved "context" for LLM conversation context
6. **Deliberate output style** - Plan → Implementation → Summary with ★ Insight blocks

---

## Next Steps (Architecture Layers)

Per the original plan, remaining layers to build:

1. ✅ **Foundation** (util) — Complete
2. ✅ **Core Abstractions** (Instance, Project, Config) — Complete
3. ⏳ **Infrastructure** — Storage, Event Bus
4. ⏳ **Session** — Conversations within a project
5. ⏳ **TUI** — The actual interface

**Recommended next:** Storage layer or Session management

---

## Git Status

```
Branch: master
Latest: 4c31dc9 refactor: simplify to Instance + Project config model
```

All tests passing (14/14), 93.88% coverage.

---

## Startup Command

```bash
cd /home/aerion/dev/tinker-tui && claude
```

Then provide context:
> "Continue building tinker-tui. Check the session handoff at `.claude/session-handoff-2024-11-27.md` and memories for context. We completed the Instance/Project/Config architecture. Ready for the next layer (Storage, Event Bus, or Session)."

---

## Session Artifacts

### Custom Output Style
Located at `.claude/output-styles/deliberate.md` - enables Plan/Implementation/Summary structure with ★ Insight blocks.

### Key Commands
```bash
bun run dev          # Run the app
bun test             # Run tests
bun test --coverage  # Coverage report
bun run typecheck    # TypeScript check
```
