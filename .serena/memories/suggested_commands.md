# Suggested Commands

## Development

### Run the TUI
```bash
bun run tui
# or with watch mode:
bun run dev
```

### Run Tests
```bash
bun test
# Run specific test file:
bun test test/config.test.ts
```

### Type Checking
```bash
bun run typecheck
# Note: Currently broken - see Issue #4
# Should use: bunx tsc --noEmit
```

### Debug Server
```bash
bun run debug-server
```

## Package Management

### Install Dependencies
```bash
bun install
```

### Add a Dependency
```bash
bun add <package>
bun add -d <package>  # dev dependency
```

## Git Workflow
```bash
# Before committing:
bun test && bun run typecheck
git add .
git commit -m "feat: description"
```

## System Utilities (Linux/WSL)
- `git` - Version control
- `gh` - GitHub CLI
- `ls`, `cd`, `grep`, `find` - Standard Unix tools
