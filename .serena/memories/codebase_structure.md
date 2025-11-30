# Codebase Structure

## Root Directory

```
tinker-tui/
├── src/                    # Source code
├── test/                   # Test files
├── .tinker/                # Project-local data (gitignored)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── CLAUDE.md               # AI assistant instructions
├── DESIGN_PHILOSOPHY.md    # Core principles
├── roadmap.md              # Feature roadmap
└── README.md               # Basic setup
```

## Source Structure (`src/`)

### Domain Layer (`src/domain/`)
Pure business types with no infrastructure dependencies.

| File | Purpose |
|------|---------|
| `session.ts` | Session and SessionMetadata interfaces |
| `artifact.ts` | SessionArtifact union (UserInput, AgentResponse, ToolUse, etc.) |
| `knowledge.ts` | Knowledge storage types |
| `project.ts` | Project definition |
| `provider.ts` | AI provider interfaces |
| `context.ts` | Context assembly types |
| `shared.ts` | Shared types (Embedding, constants) |

### Infrastructure Layer (`src/infrastructure/`)
Technical implementations of domain interfaces.

| Directory | Purpose |
|-----------|---------|
| `persistence/` | LanceDB storage (ProjectStorage class) |
| `embedding/` | MiniLM embedding generation |
| `provider/` | AI providers (OpenRouter, debug) |
| `config/` | Configuration loading and validation |
| `project/` | Project state management |
| `context/` | Context assembly for prompts |

### Application Layer (`src/application/`)
Application services and orchestration.

| File | Purpose |
|------|---------|
| `active-session.ts` | Active session management |
| `index.ts` | Service exports |

### Web Layer (`src/web/`)
HTTP server and React components.

| File | Purpose |
|------|---------|
| `server.ts` | Bun HTTP server |
| `app.tsx` | Root React component |
| `components/` | React components (dialogue, etc.) |
| `index.html` | HTML template |
| `styles.css` | Stylesheets |

### Utilities (`src/util/`)
Shared helper functions.

| File | Purpose |
|------|---------|
| `scope.ts` | Scoped resource management |
| `error.ts` | Custom error types |
| `log.ts` | Logging utilities |
| `lazy.ts` | Lazy evaluation helpers |
| `clipboard.ts` | Clipboard operations |

### Tools (`src/tools/`)
Development and debugging tools.

| File | Purpose |
|------|---------|
| `debug-server.ts` | Debug server for testing |

## Test Structure (`test/`)

Tests mirror source structure:
- `storage.test.ts` - ProjectStorage tests
- `config.test.ts` - Configuration tests
- `embedding.test.ts` - Embedding tests
- `openrouter.test.ts` - Provider tests
- `project-state.test.ts` - Project state tests
- `context.test.ts` - Context assembly tests
- `lazy.test.ts` - Utility tests
- `instance.test.ts` - Instance tests

## Key Entry Points

| Entry | Command | Purpose |
|-------|---------|---------|
| `src/web/server.ts` | `bun dev` / `bun start` | Web server |
| `src/cli/poc.ts` | `bun run chat` | CLI chat (PoC) |
| `index.ts` | `bun run index.ts` | Main entry |
