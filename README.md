<div align="center">
  <img src="src/assets/volt.png" alt="Volt Logo" width="100" />
  <h1>Volt Terminal</h1>
  <p><b>An insanely fast, AI-powered agentic terminal built with Tauri and Rust.</b></p>
  
  <p>
    <a href="https://github.com/mohit/volt/releases"><img src="https://img.shields.io/github/v/release/mohit/volt?style=flat-square" alt="Release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
    <a href="https://tauri.app/"><img src="https://img.shields.io/badge/built_with-Tauri-ffc131?logo=tauri&style=flat-square" alt="Tauri"></a>
    <a href="https://rust-lang.org/"><img src="https://img.shields.io/badge/backend-Rust-000000?logo=rust&style=flat-square" alt="Rust"></a>
  </p>
</div>

<br />

Volt is a lightweight, blisteringly fast terminal emulator integrated deeply with an intelligent AI agent. It allows you to run shell commands via natural language, automatically debug errors, and let an AI safely orchestrate complex tasks right inside your workspace.

## ✨ Features

- ⚡ **Native Performance** — Built on Tauri and Rust, utilizing very little RAM (<100MB) compared to Electron-based terminals.
- 🤖 **Inline Agentic AI** — Talk to your terminal. Volt converts natural language into executable commands and orchestrates workflows using NVIDIA NIM / OpenAI models.
- 🔒 **Safety Guards** — The AI operates in restricted boundaries. Dangerous commands (like `rm -rf`, network exposure, etc.) are caught and require strict user confirmation.
- 💅 **Stunning UI** — A premium, customizable deep-space theme using `Outfit` typography and glassmorphic aesthetics.
- 🧩 **Smart Context** — Volt intelligently reads your active directory, git status, and recent terminal outputs to understand what you're working on without you having to explain.
- 🖥️ **First-class Emulation** — Uses `xterm.js` for robust ANSI rendering, WebGL acceleration, and smooth scrolling.

## 🚀 Quick Start

### 1. Prerequisites

**Linux Dependencies:**
```bash
sudo apt-get install -y libglib2.0-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libssl-dev pkg-config
```

**Rust & Node:**
Ensure you have [Node.js 18+](https://nodejs.org) and [Rust](https://rustup.rs/) installed on your machine.

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/mohit/volt.git
cd volt
npm install
```

### 3. Development Mode

Run the app locally with hot-reloading:

```bash
npm run tauri dev
```

### 4. Build for Production

Package Volt for your operating system (creates `.deb`, `.AppImage`, or `.msi` depending on your OS):

```bash
npm run tauri build
```

## ⚙️ Configuration

1. Press `Ctrl+,` to open the **Settings Tab**.
2. Enter your API key (default is configured for NVIDIA NIM).
3. Select your model (e.g., DeepSeek v4 Pro, Kimi k2.6, GPT OSS 120B, GLM 5.1, etc.)
4. Set your execution mode:
   - **Ask:** AI only answers questions.
   - **Agent:** AI proposes commands; waits for your approval.
   - **Full:** AI runs commands autonomously (Use with caution).

## ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New Tab |
| `Ctrl+W` | Close Tab |
| `Ctrl+I` | Toggle AI Agent Panel |
| `Ctrl+,` | Open Settings Tab |

## 🏗️ Architecture Overview

Volt relies on a minimal HTML/JS/CSS frontend bridging to a highly performant Rust backend.
- **`src/`**: Vite-powered vanilla JS frontend. Includes `xterm.js` handling and responsive CSS grid/flex layouts.
- **`src-tauri/src/ai/`**: AI client integration with configurable providers.
- **`src-tauri/src/shell/`**: Native pseudoterminal (PTY) bridging using `portable-pty`.
- **`src-tauri/src/security/`**: AST-based command analyzer ensuring dangerous commands aren't blindly executed by the AI.

## 🤝 Contributing

We love contributions! If you'd like to help make Volt better, please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Volt is distributed under the MIT License. See `LICENSE` for more information.
