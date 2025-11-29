# Task Completion Checklist

Before considering any task complete, verify the following:

## Required Steps

### 1. Run Tests
```bash
bun test
```
All tests must pass. No exceptions.

### 2. Run Type Check
```bash
bun run typecheck
# or: bunx tsc --noEmit
```
No TypeScript errors allowed.

### 3. Manual Verification
If the change affects the TUI:
```bash
bun run tui
```
Verify the change works as expected.

## Git Commit Guidelines

### Commit Message Format
```
<type>: <short description>

[optional body]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `docs`: Documentation changes
- `chore`: Build/tooling changes

### Pre-Commit Checklist
1. ✅ All tests pass
2. ✅ TypeScript compiles without errors
3. ✅ Changes tested manually if applicable
4. ✅ No debug code left behind
5. ✅ No commented-out code
6. ✅ Imports are clean (no unused)

## Known Issues to Be Aware Of
- Issue #4: `typecheck` script uses global `tsc` - may need `bunx tsc --noEmit`
- Issue #5: ProviderConfig runtime enums are inconsistent across files
