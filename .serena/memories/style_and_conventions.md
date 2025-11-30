# Code Style and Conventions

## TypeScript Configuration

- **Strict mode enabled**: All strict checks active
- **No emit**: Uses bundler mode (no tsc output)
- **Path aliases**: `@/*` → `./src/*`
- **JSX**: React JSX transform

## Naming Conventions

### Files
- `kebab-case.ts` for all files
- Test files: `*.test.ts` in `test/` directory
- Index files: `index.ts` for module re-exports

### Code
- `PascalCase` for interfaces, types, and classes
- `camelCase` for functions, variables, and methods
- `SCREAMING_SNAKE_CASE` for constants
- `snake_case` for discriminator values (e.g., `"user_input"`, `"agent_response"`)

## Type Patterns

### Interfaces vs Types
- **Interfaces** for domain objects (Session, Knowledge, etc.)
- **Types** for unions, utilities, and aliases

### Discriminated Unions
```typescript
// Good: Use discriminated unions for variants
export type ArtifactKind = "user_input" | "agent_response" | "tool_use" | "tool_result"

interface ArtifactBase {
  kind: ArtifactKind
  // ...
}

export type SessionArtifact = UserInput | AgentResponse | ToolUse | ToolResult
```

### Type Guards
```typescript
// Provide type guards for runtime narrowing
export function isConversationArtifact(
  artifact: SessionArtifact
): artifact is UserInput | AgentResponse {
  return artifact.kind === "user_input" || artifact.kind === "agent_response"
}
```

## Documentation

### JSDoc
- Required for public interfaces and exported functions
- Include `@param` and `@returns` for complex functions
- Use inline `/** comment */` for properties

```typescript
/**
 * A conversation session.
 *
 * Sessions belong to a Project and contain SessionArtifacts.
 */
export interface Session {
  /** Unique identifier */
  id: string
  /** Project this session belongs to */
  projectId: string
}
```

### Section Dividers
Use comment dividers to organize code sections:
```typescript
// ─── Sessions ──────────────────────────────────────────────────
// ─── Entries (Messages) ─────────────────────────────────────────
```

## Module Organization

### Index Files
Use `index.ts` for clean re-exports:
```typescript
// src/util/index.ts
export { createScope, type Scope } from "./scope.ts"
export { createError, NotFoundError } from "./error.ts"
```

### Import Style
- Use path aliases: `import { foo } from "@/domain/session.ts"`
- Include `.ts` extension in imports
- Group imports: external → internal → types

## Testing Conventions

- Use Bun's test runner: `import { test, expect } from "bun:test"`
- Test files mirror source structure
- Use `beforeEach`/`afterEach` for setup/teardown
- Helper functions at top of test file
- Descriptive test names: `"creates a session with metadata"`

## No Linter/Formatter

The project does not use ESLint, Prettier, or Biome. Code style is enforced through:
- TypeScript strict mode
- Code review
- Consistent patterns in existing code
