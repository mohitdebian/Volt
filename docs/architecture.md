# NexTerm Architecture

## Overview

NexTerm follows a strict separation between the Rust backend (system-level operations) and the JavaScript frontend (UI rendering). Communication happens exclusively through Tauri's IPC bridge.

## Data Flow

```
User Input → xterm.js → Tauri invoke("write_pty") → Rust PTY → Shell Process
Shell Output → Rust PTY reader thread → Tauri event("pty-output-{id}") → xterm.js → Screen
AI Query → Tauri invoke("ai_ask") → Rust NIM client → NVIDIA API → SSE Stream → Tauri events → UI
```

## Backend Modules

### shell/pty_manager.rs
- Uses `portable-pty` crate for cross-platform PTY support
- Each tab gets its own PTY session with a unique UUID
- Reader thread runs in a dedicated OS thread (not tokio) to avoid blocking
- Output is streamed via Tauri events with session-scoped event names

### ai/nim_client.rs
- OpenAI-compatible HTTP client using `reqwest` with streaming
- SSE parser with proper buffer handling for partial chunks
- Streams tokens to frontend via Tauri events
- Supports model switching at runtime without restart

### ai/context.rs
- Gathers CWD, git info, project type detection
- Runs `git` commands as subprocesses (non-blocking)
- Project type detection via marker files (package.json, Cargo.toml, etc.)

### memory/db.rs
- SQLite with WAL mode for concurrent reads
- Auto-incrementing command frequency tracking
- AI conversation pruning (keeps last 100 per project)
- Lazy initialization on first database access

### security/command_guard.rs
- Regex-based pattern matching against dangerous command signatures
- Four-tier risk classification: Safe → Low → Medium → High → Critical
- Critical commands are blocked entirely
- Medium+ commands require user confirmation

### system/monitor.rs
- Reads `/proc/self/status` for RSS memory (Linux-specific)
- Checks `nvidia-smi` for GPU availability
- Runs on a 5-second polling interval in a background thread

## Frontend Architecture

### State Management
- Single reactive store (`state/store.js`) with pub/sub pattern
- ~45 lines of code, zero dependencies
- Components subscribe to specific keys and update on change

### Terminal Rendering
- `@xterm/xterm` with FitAddon for automatic sizing
- WebGL renderer addon for GPU-accelerated rendering (when available)
- ResizeObserver for responsive terminal pane fitting

### Performance Design
- No virtual DOM, no framework overhead
- Direct DOM manipulation with minimal reflows
- Event delegation where possible
- Lazy initialization of non-critical components

## Security Model

1. AI-generated commands are never auto-executed
2. Users must click "Run" to execute AI suggestions
3. Dangerous commands trigger a confirmation dialog
4. Critical commands (rm -rf /, fork bombs) are blocked
5. API keys stored via Tauri's encrypted store plugin
