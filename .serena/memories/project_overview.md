# Project Overview: tinker-ui

## Purpose

**tinker-ui** is a web UI for interacting with coding agents — described as "SillyTavern for coders". It provides a conversational interface for working with AI coding assistants, with features like session management, RAG (Retrieval-Augmented Generation), and tool execution.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) v1.3+ |
| Language | TypeScript 5+ (strict mode) |
| Frontend | React 19 (JSX) |
| Storage | LanceDB (vector database) |
| AI Providers | Anthropic SDK, OpenRouter |
| Validation | Zod 4 |
| Logging | consola |
| CLI | yargs |

## Key Dependencies

- `@anthropic-ai/sdk` - Anthropic Claude API
- `@lancedb/lancedb` - Vector database for embeddings
- `@huggingface/transformers` - Local embedding models (MiniLM)
- `react` / `react-dom` - UI framework
- `zod` - Runtime type validation

## Architecture

The project follows clean architecture principles:

```
src/
├── domain/           # Core business types (Session, Artifact, Knowledge, etc.)
├── infrastructure/   # Technical implementations
│   ├── persistence/  # LanceDB storage layer
│   ├── embedding/    # Embedding generation (MiniLM)
│   ├── provider/     # AI provider integrations (OpenRouter, debug)
│   ├── config/       # Configuration management
│   ├── project/      # Project state management
│   └── context/      # Context assembly for prompts
├── application/      # Application services
├── web/              # Web server and React components
├── util/             # Shared utilities
└── tools/            # Development/debug tools
```

## Design Principles

1. **Per-Project Over Global**: Data stored at project level in `.tinker/` (not global `~/.tinker/`)
2. **No Broken Tests**: All tests must pass before committing
3. **Session-Based Storage**: SQLite/LanceDB databases per session for isolation

## Current Status

The project is transitioning from a TUI (terminal UI) to a web frontend. Core infrastructure (storage, embeddings, providers) is functional. UI features like markdown rendering and session management are in development.
