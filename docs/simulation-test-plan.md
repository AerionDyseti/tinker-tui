# Simulation Test Plan

## Goal

Use the simulation harness to thoroughly test the domain layer:
- **Artifact creation & persistence** — all 6 artifact types form correctly
- **Context assembly** — token budgeting, truncation, prioritization
- **Provider integration** — context → LLM → response flow
- **Retrieval quality** — does the right context get included?

## Current Artifact Types

| Kind | When Created | Key Fields |
|------|--------------|------------|
| `user_input` | Human sends message | `content` |
| `agent_response` | LLM responds | `content`, `provider`, `model`, `status` |
| `system_instruction` | Session setup | `content`, `priority` |
| `knowledge_reference` | RAG/file read | `content` |
| `tool_use` | LLM invokes tool | `toolUseId`, `toolId`, `toolName`, `input` |
| `tool_result` | Tool completes | `toolUseId`, `result`, `isError` |

## Test Scenarios

### Scenario 1: Basic Conversation (Smoke Test)
**Goal:** Verify `user_input` → `agent_response` cycle works

```json
{
  "name": "basic-conversation",
  "turns": 5,
  "human": { "provider": "openrouter", "model": "mistralai/mistral-small-3.1-24b-instruct:free" },
  "llm": { "provider": "openrouter", "model": "meta-llama/llama-3.2-3b-instruct:free" },
  "opening": "Hello, I'm starting a new coding project.",
  "hooks": {
    "afterTurn": "verifyArtifactCount"
  }
}
```

**Assertions:**
- [ ] Each turn creates exactly 2 artifacts (human + llm)
- [ ] Artifacts have valid embeddings
- [ ] Artifacts have reasonable token counts
- [ ] Context includes all prior messages

---

### Scenario 2: Context Overflow (Truncation)
**Goal:** Verify oldest messages drop when context exceeds budget

```json
{
  "name": "context-overflow",
  "turns": 20,
  "maxContextTokens": 2000,
  "human": { "systemPrompt": "Write long, detailed responses about programming concepts." },
  "llm": { "systemPrompt": "Give thorough explanations with code examples." },
  "opening": "Explain the visitor pattern in detail with examples."
}
```

**Assertions:**
- [ ] After N turns, `artifactsFiltered > 0`
- [ ] Most recent messages always included
- [ ] Oldest messages dropped first
- [ ] Context never exceeds `maxContextTokens`

---

### Scenario 3: Tool Use Cycle
**Goal:** Verify `tool_use` → `tool_result` artifact pairs

This requires extending the simulation to support mock tools:

```json
{
  "name": "tool-use-cycle",
  "turns": 3,
  "llm": {
    "systemPrompt": "You have access to a `read_file` tool. Use it when asked about file contents."
  },
  "tools": [
    {
      "name": "read_file",
      "description": "Read contents of a file",
      "mock_response": "function hello() { return 'world'; }"
    }
  ],
  "opening": "What's in the file main.ts?"
}
```

**Assertions:**
- [ ] `tool_use` artifact created with correct `toolName`, `input`
- [ ] `tool_result` artifact created with matching `toolUseId`
- [ ] Both appear in context for subsequent turns
- [ ] Context formatting: `[Tool Call: read_file]` and `[Tool Result]`

---

### Scenario 4: System Instructions
**Goal:** Verify `system_instruction` artifacts persist and affect behavior

```json
{
  "name": "system-instructions",
  "systemInstructions": [
    { "content": "Always respond in haiku format.", "priority": 10 },
    { "content": "Never use the word 'the'.", "priority": 5 }
  ],
  "turns": 3,
  "opening": "Describe a sunset."
}
```

**Assertions:**
- [ ] System instructions included in context
- [ ] Higher priority instructions survive truncation
- [ ] LLM behavior reflects instructions

---

### Scenario 5: Knowledge Injection
**Goal:** Verify `knowledge_reference` artifacts are retrieved and included

```json
{
  "name": "knowledge-injection",
  "knowledge": [
    { "content": "The SessionArtifact type is a union of 6 kinds...", "source": "artifact.ts" },
    { "content": "ContextAssembler drops oldest messages first...", "source": "assembler.ts" }
  ],
  "turns": 3,
  "opening": "How does context assembly work in this project?"
}
```

**Assertions:**
- [ ] Relevant knowledge retrieved by embedding similarity
- [ ] Knowledge appears in context
- [ ] LLM response references injected knowledge

---

### Scenario 6: Long Conversation (Stress Test)
**Goal:** Verify system handles extended conversations

```json
{
  "name": "stress-test",
  "turns": 50,
  "maxContextTokens": 4000,
  "human": { "systemPrompt": "Ask follow-up questions about previous topics." },
  "opening": "Let's have a long conversation about software architecture."
}
```

**Assertions:**
- [ ] No memory leaks (monitor process memory)
- [ ] Embedding generation stays fast
- [ ] Context assembly time stays constant
- [ ] DB operations don't slow down

---

### Scenario 7: Multi-Artifact Turn (Complex)
**Goal:** Single turn produces multiple artifact types

```json
{
  "name": "multi-artifact",
  "llm": {
    "systemPrompt": "When asked to analyze code, first read the file, then explain it."
  },
  "tools": [{ "name": "read_file", "mock_response": "..." }],
  "knowledge": [{ "content": "Code style guide..." }],
  "turns": 1,
  "opening": "Analyze the main module and explain its patterns."
}
```

**Expected artifact sequence:**
1. `user_input` — "Analyze the main module..."
2. `knowledge_reference` — Retrieved code style guide
3. `tool_use` — read_file(main.ts)
4. `tool_result` — file contents
5. `agent_response` — LLM analysis

---

## Implementation Plan

### Phase 1: Instrumented Runner
Extend `runner.ts` to:
- [ ] Integrate with `ActiveSession` instead of raw LLM calls
- [ ] Capture all artifacts created during simulation
- [ ] Log context assembly metadata (tokens, filtered count)
- [ ] Support mock tools

### Phase 2: Assertion Framework
Add `assertions.ts`:
- [ ] `assertArtifactCount(session, expected)`
- [ ] `assertContextFits(context, maxTokens)`
- [ ] `assertToolPairComplete(artifacts)` — every tool_use has tool_result
- [ ] `assertNoOrphans(artifacts)` — all artifacts have valid sessions

### Phase 3: Scenario Library
Create `simulations/scenarios/`:
- [ ] `basic-conversation.json`
- [ ] `context-overflow.json`
- [ ] `tool-use-cycle.json`
- [ ] `stress-test.json`

### Phase 4: CI Integration
- [ ] `bun run simulate:test` — runs all scenarios
- [ ] Fails if any assertion fails
- [ ] Outputs summary report

---

## Quick Wins (Tonight)

1. **Add `--integrate` flag** — Use `ActiveSession` instead of raw LLM
2. **Log context metadata** — Show `artifactsIncluded`, `artifactsFiltered`, `tokensUsed`
3. **Create basic-conversation.json** — First real test case
4. **Add DB inspection** — Dump artifacts table after simulation

---

## Open Questions

1. **Mock tools** — How do we simulate tool calls without real tools?
   - Option A: Agent declares intent, we inject mock result
   - Option B: Regex detection of tool patterns
   - Option C: Function calling with fake executor

2. **Embedding cost** — Running embeddings for every artifact is slow
   - Option A: Cache embeddings by content hash
   - Option B: Use smaller/faster embedding model for tests
   - Option C: Mock embeddings for pure logic tests

3. **Determinism** — LLM responses are non-deterministic
   - Option A: Seed if model supports it
   - Option B: Focus on structural assertions (counts, types)
   - Option C: Record/replay mode

---

## Metrics to Track

| Metric | Target |
|--------|--------|
| Artifacts created per turn | 2 (basic: human + llm), 4+ (with tools) |
| Context assembly time | < 50ms |
| Embedding time per artifact | < 200ms |
| DB write latency | < 10ms |
| Memory usage after 50 turns | < 100MB |
