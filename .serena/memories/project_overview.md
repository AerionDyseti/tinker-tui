# tinker-tui Project Overview

## Purpose
A TUI (Terminal User Interface) for interacting with LLMs (Large Language Models). The project provides a terminal-based chat interface for AI conversations with support for multiple providers.

## Tech Stack
- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **UI Framework**: @opentui/solid (SolidJS-based TUI framework)
- **Embeddings**: @huggingface/transformers, @lancedb/lancedb
- **Validation**: zod for schema validation
- **Logging**: consola

## Architecture
The project follows a layered architecture:

```
src/
├── domain/          # Core domain types (provider, session, context, knowledge)
├── application/     # Application services (conversation)
├── infrastructure/  # External integrations
│   ├── config/      # Configuration loading/resolution
│   ├── provider/    # LLM provider implementations (OpenRouter, debug)
│   ├── persistence/ # SQLite storage
│   ├── embedding/   # Embedding services (MiniLM)
│   ├── project/     # Project state management
│   └── context/     # Context assembly
├── tui/             # Terminal UI components (SolidJS)
├── tools/           # Development tools (debug-server)
├── cli/             # CLI entry points
└── util/            # Shared utilities
```

## Key Design Principles
2. **No Broken Tests**: Always run tests before committing. Never commit if any tests don't pass.

## Data Storage
```
{project-root}/.tinker/
├── sessions.db           # Session metadata
└── sessions/
    └── {sessionID}.db    # Per-session messages, embeddings
```
