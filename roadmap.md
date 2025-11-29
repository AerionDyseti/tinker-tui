# Roadmap

## Backlog (Future / Nice to Have)

- **[Feature] /edit Command**
  - Open current prompt in `$EDITOR` (vim/nano/code) for complex input.
- **[Feature] Export Session**
  - `/save` or `/export` command to dump chat history to a JSON/Markdown file.
- **[Feature] Model Registry UI**
  - Richer UI for managing local models vs remote APIs (beyond the current simple selector).
- **[Feature] Tool Use / Plugins**
  - Allow the agent to execute shell commands or search the web (foundation exists in `openrouter.ts` for tool calls).
- **[Investigation] Serena-like Named Memories for RAG Working Memory**
  - Explore using explicitly named/identified memories (à la Serena MCP server pattern) for "working memory" in the RAG system, rather than purely vector-based retrieval.
  - Could enable more structured recall and deliberate memory management.

## To Do (Prioritized)

### High Priority (Tablestakes)

- **[UI] Markdown Rendering & Syntax Highlighting**
  - **Goal:** Render chat messages with proper formatting (bold, italics, headers) and syntax highlighting for code blocks.
  - **Context:** Currently outputs raw text. Hard to read code snippets.

- **[UI] Session Management (List/Load/Delete)**
  - **Goal:** Interface to view past conversations (`/history`?), load them to resume context, and delete old ones.
  - **Context:** `ProjectStorage` supports this, but UI is missing. Currently stuck in a single ephemeral session loop (or random new ones).

- **[Config] System Prompt Editor**
  - **Goal:** Allow users to edit the system prompt in the Settings screen (e.g., "You are a Senior Typescript Engineer").
  - **Context:** Currently hardcoded to "You are a helpful assistant."

### Medium Priority

- **[UX] Multiline Input**
  - **Goal:** Support `Shift+Enter` or auto-expansion for typing multi-line prompts (essential for pasting code).
  - **Context:** Input field is single-line only.

- **[Feature] File Ingestion (RAG)**
  - **Goal:** Command (e.g., `/add src/file.ts`) to read, embed, and add files to context.
  - **Context:** `lancedb` and `embedding` infrastructure exists. `ContextAssembler` needs to be updated to actually use retrieved knowledge.

### Low Priority / Polish

- **[UX] Visual Polish**
  - **Goal:** Add a spinner/progress bar during generation. Improve command discovery (type `/` to see help).
  - **Context:** Current "Thinking..." text is minimal.

## In Progress

- **[Infra] TypeScript/Bun Migration**
  - (Implicitly active) The project has moved from the .NET plan to a Bun + SolidJS + OpenTUI stack.
  - **Next Step:** Solidify the TUI components (Chat, Settings) to match the new stack's capabilities.