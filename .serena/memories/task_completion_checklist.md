# Task Completion Checklist

## Before Committing Any Code

**REQUIRED STEPS** (from DESIGN_PHILOSOPHY.md):

1. **Run Tests**
   ```bash
   bun test
   ```
   - All tests MUST pass
   - If tests fail: fix the code or fix the tests
   - No "probably fine" - investigate failures

2. **Run Type Checking**
   ```bash
   bun run typecheck
   ```
   - No TypeScript errors allowed
   - Fix type issues before committing

3. **Review Changes**
   ```bash
   git diff
   ```
   - Ensure changes match intended scope
   - Check for accidental modifications

## Code Quality Checks

- [ ] New code follows existing patterns (see `style_and_conventions.md`)
- [ ] Interfaces have JSDoc comments
- [ ] Complex functions are documented
- [ ] Type guards provided for discriminated unions
- [ ] No hardcoded values that should be configurable

## Test Requirements

- [ ] New functionality has corresponding tests
- [ ] Edge cases are covered
- [ ] Tests use the project's test patterns (beforeEach/afterEach, helpers)

## Architecture Alignment

- [ ] Data stored per-project (not globally) unless truly global
- [ ] Session-specific data in session databases
- [ ] Follow clean architecture boundaries (domain → infrastructure)

## Anti-Patterns to Avoid

❌ Committing without running tests
❌ Storing project data in global `~/.tinker/`
❌ Ignoring failing tests ("already broken")
❌ Missing type guards for union types
❌ Skipping JSDoc for public APIs

## Quick Pre-Commit Command

```bash
bun test && bun run typecheck && git status
```

Only commit when everything passes!
