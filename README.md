<div align="center">
  <img src="src/assets/volt.png" alt="Volt Logo" width="100" />
  <h1>Volt Terminal</h1>
  <p><b>An insanely fast, AI-powered agentic terminal built with Tauri and Rust.</b></p>
  
  <p>
    <a href="https://github.com/mohitdebian/Volt/releases"><img src="https://img.shields.io/github/v/release/mohitdebian/Volt?style=flat-square" alt="Release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
    <a href="https://tauri.app/"><img src="https://img.shields.io/badge/built_with-Tauri-ffc131?logo=tauri&style=flat-square" alt="Tauri"></a>
    <a href="https://rust-lang.org/"><img src="https://img.shields.io/badge/backend-Rust-000000?logo=rust&style=flat-square" alt="Rust"></a>
  </p>
</div>

<br />

Volt is a lightweight, blisteringly fast terminal emulator integrated deeply with an intelligent AI agent. It allows you to run shell commands via natural language, automatically debug errors, and let an AI safely orchestrate complex tasks right inside your workspace.

Because Volt is open-source, this guide provides a **0-to-100 comprehensive walkthrough** on how to set it up, build it, and configure its AI capabilities.

## ✨ Features

- ⚡ **Native Performance** — Built on Tauri and Rust, utilizing very little RAM (<100MB) compared to Electron-based terminals.
- 🤖 **Inline Agentic AI** — Talk to your terminal using `Ctrl+I`. Volt converts natural language into executable commands and seamlessly summarizes their output.
- 🔄 **Fully Autonomous Summarization** — After a command is executed, Volt automatically reads the terminal output and queries the AI in the background to summarize the result in a concise TL;DR format.
- 🔒 **Safety Guards** — The AI operates in restricted boundaries. Dangerous commands (like `rm -rf`, network exposure, etc.) are caught and require strict user confirmation.
- 💅 **Stunning UI** — A premium, customizable deep-space theme using `Outfit` typography and glassmorphic aesthetics.
- 🧩 **Smart Context** — Volt intelligently reads your active directory, git status, and recent terminal outputs to understand what you're working on without you having to explain.
- 🖥️ **First-class Emulation** — Uses `xterm.js` for robust ANSI rendering, WebGL acceleration, and smooth scrolling.

---

## 🚀 0-100 Setup Guide

### Step 1: System Prerequisites

Volt requires Rust and Node.js. It also requires native system libraries to compile the Tauri window bindings.

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev build-essential curl wget pkg-config
```

**Install Node.js (v18+):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Install Rust:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Step 2: Clone & Install

Clone the repository locally and install the frontend Node dependencies:

```bash
git clone https://github.com/mohitdebian/Volt.git
cd Volt
npm install
```

### Step 3: Local Development (Hot-Reloading)

To run Volt in development mode with HMR (Hot Module Replacement) for both the JS frontend and Rust backend, run:

```bash
npm run tauri dev
```
*(The first time you run this, Cargo will download and compile all Rust crates, which may take a few minutes.)*

### Step 4: Configuring the AI (NVIDIA NIM)

Volt defaults to using NVIDIA's NIM API for blazing-fast inference, but it is OpenAI-compatible so you can plug in any OpenAI-compatible API.

1. Go to [build.nvidia.com](https://build.nvidia.com/) and create a free account.
2. Generate an API Key.
3. Open Volt and press `Ctrl+,` to open the **Settings Tab**.
4. Paste your API key into the **API Key** input box.
5. Select a model from the dropdown (e.g., `openai/gpt-oss-120b`, `kimi-k2.6`, or `deepseek-v4-pro`).
6. Click **Save Changes**.

---

## 🤖 Using the AI Agent

Press `Ctrl+I` at any time to open the **Inline AI Chat**. 

### Execution Modes

In the Settings (`Ctrl+,`), you can change how autonomous the AI is:

- 💬 **Ask Mode:** The AI will only answer questions or propose commands. You must manually copy and paste them.
- 🤖 **Agent Mode (Recommended):** The AI proposes commands. Safe commands are automatically executed. If a command is destructive (e.g., deleting files, installing root packages), Volt's Rust AST engine intercepts it and asks for your explicit permission.
- ⚡ **Full Access:** The AI autonomously executes everything it thinks is right. **Use with extreme caution.**

### Auto-Summarization Magic
When you ask Volt to run a command (e.g., "check my ram usage"), it will:
1. Instantly type and execute `free -h` in the terminal.
2. Wait a few seconds for the command to finish.
3. Silently capture the output from the terminal screen.
4. Pass the output back to the AI in "summarize" mode.
5. Print a beautifully formatted, concise plain-English summary of your RAM usage right into the chat window.

---

## 📦 Building for Production

If you want to package Volt into a standalone application installer (`.deb`, `.AppImage`, or `.rpm`):

```bash
npm run tauri build
```
The compiled binaries will be located in `src-tauri/target/release/bundle/`.

### Automated CI/CD (GitHub Actions)
This repository includes a `.github/workflows/release.yml` file. Whenever you push a new semantic version tag (e.g., `v0.1.4`) to GitHub, the CI pipeline will automatically compile the Linux binaries and attach them to a formal GitHub Release.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New Tab |
| `Ctrl+W` | Close Tab |
| `Ctrl+Tab` | Next Tab |
| `Ctrl+Shift+Tab` | Previous Tab |
| `Ctrl+I` | Toggle AI Agent Panel |
| `Ctrl+,` | Open Settings Tab |

---

## 🏗️ Architecture Overview

Volt relies on a minimal HTML/JS/CSS frontend bridging to a highly performant Rust backend.
- **`src/`**: Vite-powered vanilla JS frontend. Includes `xterm.js` handling, inline AI logic (`ai-inline.js`), and responsive CSS layouts.
- **`src-tauri/src/ai/`**: Rust AI client integration (`nim_client.rs`) with configurable prompt injection and dedicated modes (command vs. summarize).
- **`src-tauri/src/shell/`**: Native pseudoterminal (PTY) bridging using `portable-pty`.
- **`src-tauri/src/security/`**: AST-based command analyzer ensuring dangerous commands aren't blindly executed by the AI.

## 🤝 Contributing

We love contributions! If you'd like to help make Volt better, please:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request!

## 📜 License
MIT License. See `LICENSE` for more information.
