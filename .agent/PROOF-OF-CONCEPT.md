# Proof of Concept: Tinker TUI (Hybrid Architecture)

## Goal
Build a minimum viable Terminal User Interface (TUI) for managing conversations with an LLM.
**Architecture**: Python Backend (Logic/State) + TypeScript/Solid.js Frontend (UI/Rendering).

## Feature Scope (POC)
1.  **Single-session management**: One active chat thread.
2.  **Single provider**: Hardcoded adapter (e.g., OpenAI/Anthropic or Mock).
3.  **Ephemeral State**: In-memory storage only (lost on restart).
4.  **Real-time Streaming**: Token-by-token updates in the UI.
5.  **Basic TUI**: Message history list + Input box.
6.  **Configuration**: Simple `.env` or `config.json` for API keys.

---

## Technical Stack

### Backend (Python)
*   **Framework**: FastAPI (lightweight, async support).
*   **Role**: Handles API requests, manages LLM connection, holds session state.
*   **Communication**: WebSocket (for streaming) + HTTP (for actions).

### Frontend (Node.js/TypeScript)
*   **Framework**: OpenTUI + Solid.js (Reactivity).
*   **Role**: Renders the terminal UI, manages user input, connects to backend.
*   **Runtime**: Node.js (likely executing the TUI and spawning/connecting to Python).

---

## Implementation Plan

### Phase 1: Environment & Foundation
1.  **Setup Project Structure**:
    *   `backend/`: Python code.
    *   `frontend/`: TypeScript/Solid code.
2.  **Define API Contract**:
    *   `POST /session`: Start new.
    *   `POST /chat`: Send message.
    *   `WS /stream`: Receive tokens.

### Phase 2: Python Backend
1.  **Core Utils**: Basic logging and config loader (`pydantic-settings`).
2.  **Provider Abstraction**: Minimal class implementing `generate_stream(prompt)`.
3.  **Session Manager**: In-memory dictionary to hold messages `[{"role": "user", "content": "..."}]`.
4.  **Server**: FastAPI app exposing the endpoints.

### Phase 3: Frontend (OpenTUI + Solid)
1.  **TUI Shell**: Initialize `ink` or `OpenTUI` (assuming internal lib) + Solid.js renderer.
2.  **State Management**: Solid `createSignal` for `messages`, `input`, `status`.
3.  **API Client**: Simple wrapper to `fetch` and handle WebSocket messages.
4.  **Components**:
    *   `<App />`: Layout.
    *   `<MessageList />`: Scrollable history.
    *   `<InputArea />`: User typing field.

### Phase 4: Integration & Polish
1.  **Process Management**: Create a launcher script (e.g., `start.sh` or Node script) that starts the Python server in the background and launches the TUI, then kills the server on exit.
2.  **Smoke Test**: Verify sending a message and receiving a streamed response.

## Directory Structure (Proposed)
```text
tinker-tui/
├── backend/
│   ├── main.py          # Server entry
│   ├── session.py       # State
│   ├── provider.py      # LLM logic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── index.tsx    # TUI Entry
│   │   ├── App.tsx      # Solid Root
│   │   └── client.ts    # API adapter
│   ├── package.json
│   └── tsconfig.json
└── start.sh             # Orchestrator
```
