# Plan: .NET 8 Single-Executable TUI PoC (Spectre.Console + LlamaSharp)

## Goal
Build a local, single-binary TUI for LLM conversations using only C#/.NET. No Node.js or Python processes. Support local generation and (optionally) embeddings.

## Stack
- UI: Spectre.Console (rich TUI, live streaming updates)
- LLM (generation): LlamaSharp with a local GGUF model (CPU or GPU backend)
- Embeddings (pick one):
  - A) LlamaSharp with an embedding GGUF model
  - B) ONNX Runtime running a BERT-like embedding model (e.g., MiniLM) in ONNX
- Hosting/Infra: .NET 8 Console App, Microsoft.Extensions.Configuration + Logging
- Persistence: SQLite database in `data/tinker.db` (transcripts now; embeddings later via sqlite-vec)

## Project Layout
```
./
├─ src/
│  └─ TinkerTui/                 # .NET 8 console app
├─ models/                       # GGUF/ONNX models (gitignored)
├─ data/                         # transcripts, settings (gitignored)
└─ README.md
```

## NuGet Packages
- Spectre.Console
- LlamaSharp (+ native backend package for CPU/CUDA/Metal as appropriate)
- Microsoft.Extensions.Configuration, Microsoft.Extensions.Configuration.Json, Microsoft.Extensions.Logging.Console, Microsoft.Data.Sqlite
- Optional (if ONNX path for embeddings): Microsoft.ML.OnnxRuntime
- Optional: Dapper (lightweight mapping over raw SQL, if needed later)

## Configuration
- `appsettings.json` with:
  - `ModelPaths: { generation: "models/llama-3-*-Q4_K_M.gguf", embeddings: "models/all-minilm.onnx" }`
  - `Runtime: { backend: "cpu" | "cuda", threads: 4 }`
- Allow overrides via environment variables and command-line switches.

## Milestones
1) Bootstrap (Day 0-1)
   - Create `.NET 8` console app, wire Spectre.Console and configuration
   - Layout: top area = chat transcript (Panel), bottom = input prompt, right = status panel

2) Local Generation (Day 1-2)
   - Load GGUF model with LlamaSharp
   - Implement a generator service with streaming callbacks
   - Stream tokens into a `AnsiConsole.Live(...)` region for smooth updates

3) Basic Chat Loop (Day 2)
   - Maintain in-memory messages list: roles `user`/`assistant`
   - Append user input, call generator with system+history+user prompt
   - Render assistant stream; finalize and persist a message on completion

4) Commands (Day 2-3)
   - `/clear` start a new chat session (new row in `sessions`) and clear the transcript view
   - `/model <path>` hot-swap generation model (re-init generator)
   - `/save` export current session transcript to a timestamped JSON file in `data/` (SQLite remains source of truth)

5) Embeddings (Day 3-4)
   - Path A (LlamaSharp): load embedding model GGUF, expose a helper to get vector for text; demo by printing vector length and a cosine similarity against prior messages
   - Path B (ONNX): load ONNX MiniLM (or similar), implement tokenization + inference, demo cosine similarity

6) Persistence (Day 4)
   - Ensure each user/assistant turn is persisted to SQLite (`data/tinker.db`) via `sessions` and `messages` tables
   - On startup, load the latest session from SQLite (or create a new one if none exist)

7) Polish (Day 5)
   - Error handling and logging (model missing, OOM, etc.)
   - Status panel: model name, backend, tokens/sec (if available), context length
   - Theming: consistent colors and dividers for readability

## Implementation Notes
- Spectre.Console
  - Use `AnsiConsole.Live` to update a transcript view while generation streams
  - Use `TextPrompt<string>` (or Console.ReadLine) after each turn for message input
  - Render messages as Markdown (code blocks, lists) where helpful
- LlamaSharp
  - Choose a small, responsive GGUF for fast local inference in PoC (CPU-friendly if possible)
  - Provide a simple abstraction (`IGenerator`) so model/backend swaps don’t affect UI code
- Embeddings
  - Start with Path A (embedding GGUF) for simplicity; add ONNX later if needed
  - Keep an `IEmbedder` interface to switch implementations
- Data
  - Transcript schema in SQLite: `sessions(id, uuid, title, model, system_prompt, created_at, updated_at)` and `messages(id, session_id, role, content, created_at, token_count, metadata)`
  - SQLite DB at `data/tinker.db`; later extend with a `message_embeddings` table / sqlite-vec virtual table for vector search

## Stretch Goals (Post-PoC)
- Multi-session manager with a left-hand session list
- Model registry UI to switch among local models and remote APIs
- RAG demo (chunk + embed local files; store embeddings in SQLite via sqlite-vec; retrieve + augment prompt)
- Plugin/tool calls (shell commands, web search) routed through the chat

## Risks & Mitigations
- Model size/perf: pick small GGUF first; add GPU backend later if needed
- Interactive input with streaming UI: isolate read loop from render loop; only update transcript region during generation
- ONNX tokenization complexity: defer ONNX path until PoC baseline is solid

## Acceptance Criteria
- Single `.NET` executable launches a TUI
- User can type a message and see streamed assistant response from a local GGUF model
- `/clear`, `/model`, `/save` work
- Optional: embedding demo prints vector length and simple similarity