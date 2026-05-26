# Setup Guide

## Quick Start

### 1. Install System Dependencies (Linux/Ubuntu)

```bash
sudo apt-get install -y \
  libglib2.0-dev \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  pkg-config
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

### 3. Install Tauri CLI

```bash
cargo install tauri-cli --version "^2"
```

### 4. Install Node.js Dependencies

```bash
cd /path/to/nexterm
npm install
```

### 5. Run Development Mode

```bash
npm run tauri dev
```

The first build will take a few minutes to compile all Rust dependencies. Subsequent builds are fast (incremental).

### 6. Build for Production

```bash
npm run tauri build
```

The binary will be in `src-tauri/target/release/nexterm`.

## First Launch

1. NexTerm opens with a terminal tab
2. Press `Ctrl+,` to open Settings
3. Enter your NVIDIA NIM API key (get one at [build.nvidia.com](https://build.nvidia.com))
4. Press `Ctrl+I` to open the AI sidebar
5. Type a natural language query like "list all running docker containers"

## Performance Notes

### Startup Time
- Dev mode: ~2-3 seconds (includes Vite HMR server)
- Release build: <1 second

### Memory Usage
- Idle: ~60-80 MB (Tauri + WebView + one PTY session)
- Per additional tab: ~5-10 MB
- AI sidebar open: +10 MB

### Optimization Tips
- Close unused tabs to free PTY resources
- Use the 8B model for faster AI responses
- The app uses WAL mode SQLite — no performance impact from memory storage

## Troubleshooting

### Build fails with "glib-2.0 not found"
Install `libglib2.0-dev`:
```bash
sudo apt-get install libglib2.0-dev
```

### Build fails with "webkit2gtk not found"
Install WebKit:
```bash
sudo apt-get install libwebkit2gtk-4.1-dev
```

### Terminal shows "Process exited" immediately
Your default shell may not be found. Check `echo $SHELL` and ensure it's installed.

### AI not responding
1. Check API key in Settings (`Ctrl+,`)
2. Ensure network connectivity
3. Try the 8B model (fastest cold start)
