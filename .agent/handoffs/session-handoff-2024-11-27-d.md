# Session Handoff - 2024-11-27-d

## Session Overview

**Primary Goal:** Build a minimal TUI for tinker-tui using @opentui/solid that mirrors the POC CLI functionality, then add a settings screen with provider selection.

**Current Status:** TUI is functional with chat and settings screens. Theme system created. Ready for testing provider switching with actual LLM.

## Key Learnings & Insights

### OpenTUI Patterns
- `useKeyboard` is global - check `key.defaultPrevented` before acting
- Built-in `<select>` has focus issues - OpenCode builds custom select UIs with manual state
- Text styling: `fg`/`bg` props, `attributes` bitmask (1=bold, 2=dim, 4=italic)
- Multiple `<text>` in a `<box>` need `flexDirection="row"` to avoid overlap
- Use `backgroundColor` for boxes, not `bg`

### Dev Workflow
- `bun run dev` uses `--watch` but only watches entry point
- To trigger reload: edit `src/tui/index.tsx` (has `@dev N` comment to bump)
- `touch` doesn't work - Bun checks content hash, not mtime

## Decisions Made

1. **Screen architecture**: Root component manages navigation, Chat and Settings are separate screens
2. **Key scoping**: Only global keybind is Ctrl+C (quit). ESC is screen-specific.
3. **Theme system**: Semantic color tokens in `src/tui/theme.ts` rather than hardcoded hex values
4. **Config scope**: Project-level only for now (user-level deferred to CLI)
5. **Provider options**: Debug Provider and OpenAI-compatible pointed at debug server

## Progress Accomplished

### Files Created
- `src/tui/index.tsx` - Entry point with provider switching logic
- `src/tui/root.tsx` - Screen navigation, global keybinds
- `src/tui/chat.tsx` - Main chat interface (renamed from app.tsx)
- `src/tui/settings.tsx` - Settings screen with modal dialog pattern
- `src/tui/theme.ts` - Theme system with semantic color tokens
- `bunfig.toml` - OpenTUI preload configuration

### Files Modified
- `tsconfig.json` - jsx: "preserve", jsxImportSource: "@opentui/solid"
- `package.json` - Added scripts: `dev`, `tui`
- `src/application/conversation.ts` - Added `providerInfo` getter

### Package.json Scripts
```json
"dev": "bun --watch run src/tui/index.tsx",
"tui": "bun run src/tui/index.tsx",
"debug-server": "bun run src/tools/debug-server.ts"
```

## Current Context

### Working Directory
`/home/aerion/dev/tinker-tui`

### Key Files
```
src/tui/
├── index.tsx    # Entry point, provider creation, signals
├── root.tsx     # Screen nav (chat/settings), global Ctrl+C
├── chat.tsx     # Chat UI, message streaming, commands
├── settings.tsx # Settings list + modal dialog for options
└── theme.ts     # Theme tokens (darkTheme, chatColors)
```

### Theme Structure
```typescript
// Base theme tokens
theme.background, theme.backgroundPanel, theme.backgroundHighlight
theme.text, theme.textMuted, theme.textOnAccent
theme.accent, theme.accentMuted
theme.border, theme.borderFocus
theme.success, theme.error, theme.warning, theme.info

// Chat-specific
chatColors.userMessage, chatColors.assistantMessage, chatColors.systemMessage
chatColors.inputBorder, chatColors.inputBorderDisabled
```

### Navigation
- **Chat → Settings**: `/settings` command or Ctrl+,
- **Settings → Chat**: ESC
- **Quit**: Ctrl+C (global)

### Provider Types
- `"debug"` - DebugProvider at localhost:7331
- `"openai-debug"` - OpenRouterProvider pointed at localhost:7331/v1

## Next Steps

### Immediate
1. Test provider switching end-to-end (change provider in settings, verify chat uses it)
2. Connect to actual LLM via OpenRouter (user was about to provide API key)

### Future Enhancements
- Make theme system reactive/configurable (currently static export)
- Add more settings (model selection, system prompt, etc.)
- User-level config via CLI
- More themes

## Session Artifacts

### Dev Commands
```bash
# Terminal 1: Debug server
bun run debug-server

# Terminal 2: TUI with auto-reload
bun run dev

# To trigger reload after editing non-entry files:
# Edit src/tui/index.tsx - bump the @dev comment number
```

### Reference Codebases
- `~/dev/opencode-custom` - OpenCode TUI patterns, DialogSelect implementation

## Working Memory

### Conventions
- OpenTUI JSX elements: `<box>`, `<text>`, `<input>`, `<scrollbox>`
- Keyboard handler pattern: check `key.defaultPrevented`, then `key.name`
- Modal dialogs: use `position="absolute"` with `top`/`left`

### Known Issues
- Bun --watch only watches entry point, not imports (workaround: edit index.tsx)
