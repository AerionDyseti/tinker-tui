# Design Philosophy

This document outlines the core principles and design decisions that guide development of opencode-custom.

---

## Core Principles

### 1. Per-Project Over Global

**Rule:** Default to storing data and configuration at the project level. Reserve global storage only for truly global data (user preferences, credentials, etc.).

**Rationale:**
- Projects are self-contained and portable
- Team collaboration is easier (share project, share context)
- Multi-project workflows don't create conflicts
- Easier to backup, archive, and delete projects
- Natural organization matches how developers think
- Enables project-specific features (embeddings, project-specific models, etc.)

**Examples:**
- ✅ **Per-Project**: Session data, message history, embeddings, project-specific settings
- ✅ **Global**: User authentication tokens, default model preferences, UI theme
- ❌ **Anti-pattern**: Storing all sessions in `~/.opencode/data/` indexed by project hash

**Implementation:**
```
/home/user/my-project/
  .opencode/              <- Project-specific OpenCode data
    sessions.db           <- Session metadata
    sessions/             <- Per-session databases
      {sessionID}.db
  .git/
  src/
```

**Note:** Add `.opencode/` to `.gitignore` by default, but users can commit if they want to track AI assistance history.

---

### 2. No Broken Tests

**Rule:** We do not commit or push code with failing tests. Period.

**Process:**
1. Make changes
2. Run `bun test` (all 243+ tests must pass)
3. Run `bun run typecheck` (no TypeScript errors)
4. If tests fail:
   - If we broke them: fix the code
   - If tests are wrong: fix the tests
   - If tests are flaky: fix the tests
5. Only commit when everything passes

**Rationale:**
- Broken tests indicate broken assumptions
- "It's probably fine" leads to cascading failures
- Test failures catch regressions early
- Clean test runs enable confident refactoring
- Professional engineering standards

**No Exceptions:**
- "Tests were already failing" → Fix them before your changes
- "Only one test failing" → Fix it
- "Test is unrelated to my changes" → Fix it anyway or investigate why it's failing

---

## Future Principles

As we establish more patterns, we'll document them here:

- **Principle 3:** TBD
- **Principle 4:** TBD
- **Principle 5:** TBD

---

## Decision Log

This section tracks major design decisions and their justifications.

### SQLite Storage Backend (2025-11-24)

**Decision:** Use per-project, per-session SQLite databases instead of JSON files or single global DB.

**Structure:**
```
{project-root}/.opencode/
  sessions.db              <- Session metadata
  sessions/
    {sessionID}.db         <- Messages, parts, embeddings per session
```

**Rationale:**
- Aligns with "per-project" principle
- Enables future embedding support (sqlite-vec)
- No write contention between sessions
- Easy to export/share individual sessions
- Better performance than JSON files
- Single file per session vs 1000s of JSON files

**Considered Alternatives:**
1. ~~Single global SQLite DB~~ - Violates per-project principle
2. ~~JSON files~~ - Slow, hard to query, many files
3. ~~Per-project single DB~~ - Write contention, harder to isolate sessions

---

### Settings Panel UI (2025-11-23)

**Decision:** Build TUI-based settings panel instead of only config file editing.

**Rationale:**
- Lower barrier to entry for users
- Visual feedback (theme preview, model selection)
- Discoverability of features
- Agent-aware configuration (show current agent's model)

**Trade-offs:**
- More code to maintain vs simple config file
- TUI rendering bugs are harder to debug
- But: Better UX wins for most users

---

## Anti-Patterns to Avoid

### ❌ Global State When Project State Would Work

Don't default to `~/.opencode/` for data that logically belongs to a project.

**Bad:**
```typescript
const sessionPath = path.join(os.homedir(), ".opencode", "sessions", projectID, sessionID)
```

**Good:**
```typescript
const sessionPath = path.join(projectRoot, ".opencode", "sessions", sessionID)
```

### ❌ Committing Without Testing

Don't skip tests "just this once" or because you're confident.

**Bad:**
```bash
git commit -m "quick fix"
git push
# Oh no, tests fail in CI...
```

**Good:**
```bash
bun test && bun run typecheck
git commit -m "fix: whatever"
git push
```

### ❌ "Tests Were Already Broken"

Don't ignore pre-existing test failures. Fix them or track them down.

**Bad:**
```
207 tests passing
1 test failing (pre-existing)
*commits new code*
```

**Good:**
```
*investigates failing test*
*fixes root cause OR fixes test*
208 tests passing
*commits new code*
```

---

## Applying These Principles

When adding new features:

1. **Ask:** Should this be per-project or global?
   - If you're not sure, default to per-project
   - Only go global if it must be shared across all projects

2. **Test:** Before committing:
   ```bash
   bun test           # Must pass
   bun run typecheck  # Must pass
   ```

3. **Document:** If you establish a new pattern, add it to this file

---

## Contributing

When contributing to opencode-custom:

- Read this document first
- Follow these principles in your PRs
- If you disagree with a principle, discuss it (these aren't set in stone)
- If you establish a new pattern, document it here

**Remember:** These principles exist to make the codebase better, not to create bureaucracy. If something doesn't make sense, let's discuss it.
