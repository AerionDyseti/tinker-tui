# Building OpenCode From Scratch

A comprehensive guide to understanding and rebuilding the OpenCode architecture, including dependencies, design patterns, and implementation order.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Design Patterns](#core-design-patterns)
3. [Dependency Graph](#dependency-graph)
4. [Build Order Guide](#build-order-guide)
5. [Implementation Steps](#implementation-steps)
6. [Key Design Decisions](#key-design-decisions)
7. [Improvement Opportunities](#improvement-opportunities)
8. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

OpenCode is built as a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│         CLI & TUI Interface             │  <- User-facing layer
├─────────────────────────────────────────┤
│         Session Management              │  <- Business logic
├─────────────────────────────────────────┤
│    Tools │ Agents │ Providers │ Format │  <- Feature layer
├─────────────────────────────────────────┤
│   Config │ Plugin │ Auth │ Permission  │  <- Service layer
├─────────────────────────────────────────┤
│    Storage │ Bus │ LSP │ MCP │ IDE     │  <- Infrastructure
├─────────────────────────────────────────┤
│    Instance │ State │ Project          │  <- Core abstractions
├─────────────────────────────────────────┤
│    Context │ Log │ Error │ Utils       │  <- Foundation
└─────────────────────────────────────────┘
```

### Tech Stack

- **Runtime**: Bun (fast, native TypeScript support)
- **CLI Framework**: Yargs
- **TUI Framework**: OpenTUI + Solid.js
- **Database**: SQLite (with future sqlite-vec for embeddings)
- **AI SDK**: Vercel AI SDK
- **Protocols**: LSP, MCP, ACP
- **Testing**: Bun test runner
- **Build**: TypeScript with Turbo

---

## Core Design Patterns

### 1. Instance/Context Pattern (Most Important!)

The cornerstone of OpenCode's architecture. Provides project isolation and context propagation.

```typescript
// Every operation runs within an Instance context
await Instance.provide({
  directory: "/path/to/project",
  fn: async () => {
    // All code here has access to Instance.directory, Instance.project, etc.
    const config = await Config.load() // Automatically uses Instance context
  }
})
```

**Why it matters:**
- Enables multi-project support
- Provides automatic cleanup
- Prevents state leakage between projects
- Makes testing deterministic

### 2. Lazy State Pattern

Components initialize state only when needed, reducing startup time.

```typescript
const state = Instance.state(async () => {
  // Expensive initialization only happens once per instance
  return await loadExpensiveResource()
})

// Later...
const resource = await state() // Cached after first call
```

### 3. Event Bus Pattern

Decoupled communication between components.

```typescript
// Define typed event
const ConfigUpdated = Bus.event("config.updated", z.object({
  path: z.string()
}))

// Subscribe
Bus.on(ConfigUpdated, (data) => {
  console.log(`Config updated at ${data.path}`)
})

// Emit
Bus.emit(ConfigUpdated, { path: "/home/user/project" })
```

### 4. Registry Pattern

Dynamic registration of tools, providers, and plugins.

```typescript
ToolRegistry.register("bash", BashTool)
const tool = await ToolRegistry.get("bash")
```

### 5. Permission System

Fine-grained control over what operations are allowed.

```typescript
await Permission.check("file.write", { path: "/etc/passwd" }) // Throws if denied
```

---

## Dependency Graph

```mermaid
graph TD
    Utils[Utils/Foundation] --> Context[Context System]
    Context --> Instance[Instance Management]
    Instance --> State[State Management]
    Instance --> Project[Project Detection]
    
    Instance --> Storage[Storage Layer]
    Instance --> Bus[Event Bus]
    Instance --> Config[Configuration]
    
    Config --> Auth[Authentication]
    Config --> Plugin[Plugin System]
    
    Plugin --> Provider[AI Providers]
    Plugin --> Tool[Tool System]
    Plugin --> Agent[Agent System]
    
    Tool --> Permission[Permissions]
    
    Provider --> Session[Session Management]
    Tool --> Session
    Agent --> Session
    
    Session --> CLI[CLI Interface]
    Session --> TUI[TUI Interface]
```

### Critical Dependencies

1. **Instance depends on**: Context, Project, State
2. **Storage depends on**: Instance (for project directory)
3. **Config depends on**: Instance, Storage, Auth
4. **Session depends on**: Almost everything
5. **CLI/TUI depends on**: Session

---

## Build Order Guide

### Phase 1: Foundation (Week 1)

Start with zero dependencies, pure utilities.

```bash
packages/opencode/src/util/
├── error.ts       # Named errors with Zod
├── log.ts         # Logging system
├── context.ts     # AsyncLocalStorage wrapper
├── lazy.ts        # Lazy initialization
├── defer.ts       # Deferred promises
├── queue.ts       # Async queue
├── lock.ts        # Mutex/semaphore
├── timeout.ts     # Timeout utilities
└── filesystem.ts  # File system helpers
```

### Phase 2: Core Abstractions (Week 1-2)

Build the Instance/State system that everything else depends on.

```bash
packages/opencode/src/
├── global/        # Global paths and constants
└── project/
    ├── state.ts   # State management
    ├── instance.ts # Instance context
    └── project.ts  # Project detection (Git)
```

### Phase 3: Infrastructure (Week 2-3)

Add persistence and communication layers.

```bash
packages/opencode/src/
├── bus/           # Event system
│   ├── index.ts   # Instance-scoped bus
│   └── global.ts  # Global bus
├── storage/       # Data persistence
│   ├── backend.ts # Abstract interface
│   ├── storage.ts # Main storage API
│   └── multi-sqlite-backend.ts
└── auth/          # Authentication
```

### Phase 4: Service Layer (Week 3-4)

Configuration and plugin systems.

```bash
packages/opencode/src/
├── config/        # Configuration loading
├── plugin/        # Plugin system
└── permission/    # Permission checks
```

### Phase 5: Features (Week 4-5)

AI providers, tools, and agents.

```bash
packages/opencode/src/
├── provider/      # AI model providers
├── tool/          # Tool implementations
│   ├── bash.ts
│   ├── edit.ts
│   ├── read.ts
│   └── registry.ts
└── agent/         # Agent configurations
```

### Phase 6: Business Logic (Week 5-6)

Core session management.

```bash
packages/opencode/src/session/
├── index.ts       # Session lifecycle
├── message-v2.ts  # Message handling
├── processor.ts   # AI processing
├── prompt.ts      # Prompt construction
└── system.ts      # System prompts
```

### Phase 7: User Interface (Week 6-7)

CLI and TUI.

```bash
packages/opencode/src/cli/
├── cmd/           # CLI commands
│   ├── run.ts
│   ├── serve.ts
│   └── tui/       # TUI components
└── ui.ts          # UI utilities
```

---

## Implementation Steps

### Step 1: Project Setup

```bash
# Initialize monorepo
mkdir opencode-new && cd opencode-new
bun init

# Setup workspace structure
mkdir -p packages/{opencode,sdk,plugin,script}

# Configure TypeScript
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
EOF

# Setup Turbo for builds
bun add -d turbo
```

### Step 2: Foundation Layer

```typescript
// src/util/context.ts
import { AsyncLocalStorage } from "async_hooks"

export function createContext<T>(name: string) {
  const storage = new AsyncLocalStorage<T>()
  
  return {
    provide<R>(value: T, fn: () => R): R {
      return storage.run(value, fn)
    },
    use(): T {
      const value = storage.getStore()
      if (!value) throw new Error(`No context for ${name}`)
      return value
    }
  }
}
```

### Step 3: Instance System

```typescript
// src/project/instance.ts
import { createContext } from "../util/context"

interface InstanceContext {
  directory: string
  project: ProjectInfo
}

const context = createContext<InstanceContext>("instance")

export const Instance = {
  async provide<R>(opts: {
    directory: string
    fn: () => R
  }): Promise<R> {
    const project = await detectProject(opts.directory)
    return context.provide(
      { directory: opts.directory, project },
      opts.fn
    )
  },
  
  get directory() {
    return context.use().directory
  },
  
  state<S>(init: () => S): () => S {
    // Lazy state implementation
  }
}
```

### Step 4: Storage Layer

```typescript
// src/storage/storage.ts
export namespace Storage {
  const state = Instance.state(async () => {
    const dir = path.join(Instance.directory, ".opencode")
    const backend = new MultiSqliteBackend(dir)
    return { backend }
  })
  
  export async function read<T>(key: string[]): Promise<T> {
    const { backend } = await state()
    return backend.read(key)
  }
  
  // write, update, remove, list...
}
```

### Step 5: Event Bus

```typescript
// src/bus/index.ts
export namespace Bus {
  const state = Instance.state(() => new EventEmitter())
  
  export function event<T>(name: string, schema: z.ZodSchema<T>) {
    return { name, schema }
  }
  
  export function on<T>(event: Event<T>, handler: (data: T) => void) {
    const bus = state()
    bus.on(event.name, handler)
  }
  
  export function emit<T>(event: Event<T>, data: T) {
    const bus = state()
    bus.emit(event.name, event.schema.parse(data))
  }
}
```

### Step 6: Configuration

```typescript
// src/config/config.ts
export namespace Config {
  const state = Instance.state(async () => {
    // Load from multiple sources
    const global = await loadGlobal()
    const project = await loadProject()
    const local = await loadLocal()
    
    // Merge with precedence
    return merge(global, project, local)
  })
  
  export async function get() {
    return await state()
  }
}
```

### Step 7: Session Management

```typescript
// src/session/index.ts
export class Session {
  constructor(
    private id: string,
    private config: Config
  ) {}
  
  async send(message: string) {
    // Process user message
    const response = await this.processor.process(message)
    await Storage.write(["message", this.id, messageId], response)
    return response
  }
}
```

### Step 8: CLI Interface

```typescript
// src/index.ts
import yargs from "yargs"

const cli = yargs(process.argv.slice(2))
  .command({
    command: "chat [message]",
    handler: async (args) => {
      await Instance.provide({
        directory: process.cwd(),
        fn: async () => {
          const session = await Session.current()
          const response = await session.send(args.message)
          console.log(response)
        }
      })
    }
  })
  
await cli.parse()
```

---

## Key Design Decisions

### 1. Per-Project Storage

**Decision**: Store all data in `{project}/.opencode/` instead of global `~/.opencode/`

**Rationale**:
- Projects are self-contained
- Easy to share/backup/delete
- No conflicts between projects
- Natural for version control

**Trade-offs**:
- ✅ Better isolation
- ✅ Easier collaboration
- ❌ Some duplication across projects
- ❌ Need to handle `.gitignore`

### 2. Instance/Context Pattern

**Decision**: Use AsyncLocalStorage for context propagation

**Rationale**:
- Automatic context in async operations
- No need to pass context explicitly
- Clean API surface
- Works with concurrent operations

**Trade-offs**:
- ✅ Cleaner code
- ✅ Automatic propagation
- ❌ Harder to debug
- ❌ Performance overhead

### 3. SQLite Over JSON

**Decision**: Use SQLite databases instead of JSON files

**Rationale**:
- Better performance at scale
- Atomic operations
- Future embedding support (sqlite-vec)
- Single file per session vs thousands of JSON files

**Trade-offs**:
- ✅ Much faster queries
- ✅ Better concurrency
- ❌ Binary format (not human-readable)
- ❌ Requires SQLite dependency

### 4. Lazy State Management

**Decision**: Initialize expensive resources only when needed

**Rationale**:
- Faster startup time
- Lower memory usage
- Resources only loaded for used features

**Trade-offs**:
- ✅ Better performance
- ✅ Lower resource usage
- ❌ More complex code
- ❌ Potential for initialization races

### 5. Solid.js for TUI

**Decision**: Use Solid.js reactive framework for terminal UI

**Rationale**:
- Fine-grained reactivity perfect for TUI updates
- Small bundle size
- Good TypeScript support
- Familiar component model

**Trade-offs**:
- ✅ Excellent performance
- ✅ Reactive updates
- ❌ Smaller ecosystem than React
- ❌ Learning curve for React developers

---

## Improvement Opportunities

### 1. Simplify State Management

**Current Issue**: Three overlapping systems (Instance, State, Context)

**Improvement**:
```typescript
// Unified state system
export const AppState = {
  instance: createState<Instance>(),
  config: createState<Config>(),
  session: createState<Session>(),
}

// Usage
AppState.instance.use().directory
```

### 2. Better Storage Abstraction

**Current Issue**: Storage backends are tightly coupled to implementation

**Improvement**:
```typescript
interface StorageAdapter {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

// Implementations
class SqliteAdapter implements StorageAdapter { }
class RedisAdapter implements StorageAdapter { }
class S3Adapter implements StorageAdapter { }
```

### 3. Simplify Provider Loading

**Current Issue**: Complex dynamic loading with multiple config sources

**Improvement**:
```typescript
// Single source of truth for providers
const providers = {
  openai: () => import("./providers/openai"),
  anthropic: () => import("./providers/anthropic"),
  local: () => import("./providers/local"),
}

// Simple loading
const provider = await providers[name]()
```

### 4. Type-Safe Event Bus

**Current Issue**: Events use strings, potential for typos

**Improvement**:
```typescript
// Type-safe events
const events = createEventBus({
  configUpdated: z.object({ path: z.string() }),
  sessionStarted: z.object({ id: z.string() }),
})

// Autocomplete and type checking
events.on("configUpdated", (data) => {
  // data is typed as { path: string }
})
```

### 5. Plugin System Improvements

**Current Issue**: Plugins need complex registration

**Improvement**:
```typescript
// Plugin manifest
interface PluginManifest {
  name: string
  version: string
  exports: {
    tools?: Tool[]
    providers?: Provider[]
    commands?: Command[]
  }
}

// Auto-discovery
const plugins = await discoverPlugins("./plugins")
plugins.forEach(p => registerPlugin(p))
```

### 6. Better Error Recovery

**Current Issue**: Errors can leave system in inconsistent state

**Improvement**:
```typescript
// Transactional operations
await Transaction.run(async (tx) => {
  await tx.storage.write(key1, value1)
  await tx.storage.write(key2, value2)
  // Automatically rolled back on error
})
```

### 7. Streaming Improvements

**Current Issue**: Complex streaming implementation

**Improvement**:
```typescript
// Unified streaming interface
class StreamProcessor {
  async *process(input: AsyncIterable<Chunk>) {
    for await (const chunk of input) {
      yield await this.transform(chunk)
    }
  }
}
```

---

## Testing Strategy

### Unit Testing

Test individual components in isolation.

```typescript
// test/util/context.test.ts
test("context propagates through async operations", async () => {
  const ctx = createContext<number>("test")
  
  const result = await ctx.provide(42, async () => {
    await sleep(10)
    return ctx.use()
  })
  
  expect(result).toBe(42)
})
```

### Integration Testing

Test component interactions.

```typescript
// test/storage/storage.test.ts
test("storage persists across instance restarts", async () => {
  const dir = await tmpdir()
  
  // First instance
  await Instance.provide({ directory: dir, fn: async () => {
    await Storage.write(["test"], { value: 42 })
  }})
  
  // Second instance
  await Instance.provide({ directory: dir, fn: async () => {
    const data = await Storage.read(["test"])
    expect(data.value).toBe(42)
  }})
})
```

### End-to-End Testing

Test complete workflows.

```typescript
// test/e2e/session.test.ts
test("complete chat session", async () => {
  await Instance.provide({ directory: tmpdir(), fn: async () => {
    const session = new Session()
    const response = await session.send("Hello")
    expect(response).toContain("Hi")
  }})
})
```

### Performance Testing

Ensure system meets performance requirements.

```typescript
// test/perf/storage.bench.ts
bench("storage write performance", async () => {
  for (let i = 0; i < 1000; i++) {
    await Storage.write(["test", String(i)], { data: "x".repeat(1000) })
  }
})
```

---

## Project Timeline

### Week 1: Foundation
- Set up monorepo structure
- Implement core utilities
- Create context system
- Add logging and errors

### Week 2: Core Systems  
- Build Instance/State management
- Add project detection
- Implement storage layer
- Create event bus

### Week 3: Services
- Configuration system
- Authentication
- Permission system
- Plugin architecture

### Week 4: Features
- AI provider integration
- Tool implementations
- Agent system
- Format/LSP/MCP integration

### Week 5: Business Logic
- Session management
- Message processing
- Prompt construction
- System prompts

### Week 6: User Interface
- CLI commands
- TUI components
- Theme system
- Keybind management

### Week 7: Polish
- Testing
- Documentation
- Performance optimization
- Error handling

---

## Summary

Building OpenCode from scratch requires careful attention to the layered architecture and dependency management. The Instance/Context pattern is the cornerstone that enables multi-project support and proper isolation. 

**Key takeaways:**

1. **Start with foundations** - Utils and context system first
2. **Build incrementally** - Each layer depends only on layers below
3. **Test as you go** - Unit tests for each component
4. **Focus on the Instance pattern** - It's the key to everything
5. **Keep it simple** - Many current complexities can be simplified

The architecture is sound but has grown organically. A rebuild would be an opportunity to simplify state management, improve type safety, and create cleaner abstractions while maintaining the core strengths of project isolation and extensibility.

**Estimated effort**: 6-7 weeks for a small team, 10-12 weeks for solo developer

**Critical success factors:**
- Understanding the Instance/Context pattern
- Maintaining clean layer separation  
- Comprehensive testing at each layer
- Gradual migration strategy if replacing existing system