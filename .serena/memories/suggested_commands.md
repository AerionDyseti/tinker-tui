# Suggested Commands

## Development Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun dev` | Start dev server with hot reload (also starts browser-tools-server) |
| `bun start` | Start production server |
| `bun test` | Run all tests |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run chat` | Start CLI chat interface (PoC) |
| `bun run debug-server` | Start debug server |
| `bun run browser-tools` | Start browser tools server separately |

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test test/storage.test.ts

# Run tests matching pattern
bun test --grep "session"
```

## Type Checking

```bash
# Check for TypeScript errors (no emit)
bun run typecheck

# Watch mode (using bunx)
bunx tsc --noEmit --watch
```

## Git Operations

```bash
# Standard workflow
git status
git add <files>
git commit -m "type: description"

# Before committing (REQUIRED)
bun test && bun run typecheck
```

## Common Development Tasks

```bash
# Start development (web + browser tools)
bun dev

# Run the entry point directly
bun run index.ts

# Run specific tool
bun run src/tools/debug-server.ts
```

## System Utilities (Linux)

| Utility | Purpose |
|---------|---------|
| `ls`, `cd`, `pwd` | Directory navigation |
| `find`, `grep`, `rg` | File/content search |
| `git` | Version control |
| `bun` | Package manager and runtime |
