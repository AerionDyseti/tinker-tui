# Code Style and Conventions

## TypeScript Configuration
- **Strict mode**: Enabled
- **Module**: ESNext with bundler resolution
- **JSX**: preserve with @opentui/solid import source
- **Path aliases**: `@/*` maps to `./src/*`

## Naming Conventions
- **Files**: kebab-case (e.g., `config-types.ts`, `project-storage.ts`)
- **Types/Interfaces**: PascalCase (e.g., `ProviderConfig`, `ConversationService`)
- **Functions**: camelCase (e.g., `createConversationService`, `resolveConfig`)
- **Constants**: SCREAMING_SNAKE_CASE for true constants (e.g., `DEFAULT_CONFIG`)

## Code Organization
- Export types and interfaces from domain layer
- Use barrel exports (`index.ts`) for public APIs
- Keep infrastructure separate from domain logic

## Testing Style
```typescript
import { test, expect } from "bun:test"

test("descriptive test name", () => {
  // Arrange
  const input = ...
  
  // Act
  const result = functionUnderTest(input)
  
  // Assert
  expect(result).toBe(expected)
})
```

## Import Style
- Use path aliases: `import { X } from "@/domain/provider.ts"`
- Include `.ts` extension in imports
- Group imports: external deps, then internal

## Bun-Specific
- Use `Bun.file()` over `node:fs` when possible
- Use `bun:test` for testing
- Use `bun:sqlite` for SQLite
- Bun auto-loads `.env` files

## UI Components (TUI)
- Use SolidJS patterns with @opentui/solid
- Components are `.tsx` files
- Use signals for reactive state
