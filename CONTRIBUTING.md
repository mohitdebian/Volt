<div align="center">
  <h1>🤩 Join the Volt Revolution</h1>
  <p><b>Help us build the most beautiful, intelligent, and agentic terminal in the world.</b></p>
</div>

<br/>

First off, **thank you** for considering contributing to Volt! Open source is what makes the developer community so incredible. Whether you are fixing a typo, optimizing Rust memory allocation, or building a brand new AI agent mode, your contributions are deeply appreciated.

---

## 🎨 Why Contribute to Volt?

Volt isn't just another terminal emulator. We are blurring the lines between the **Terminal**, the **IDE**, and the **AI Agent**. 
We care deeply about **aesthetics (glassmorphism)**, **performance (Rust/Tauri)**, and **intelligence (LLM integration)**.

<details>
<summary><b>✨ Click here for some fun animation magic!</b></summary>
<br>
<div align="center">
  <h1>🚀</h1>
  <p><i>Houston, we have liftoff! Welcome aboard.</i></p>
</div>
</details>

---

## 💡 What Can I Build? (Real Engineering Tasks)

Not sure where to start? We have some real, pressing architectural challenges and bugs that need your help!

### 1. 🔒 Security: API Key Storage (Bug)
- **The Issue:** Currently, the NVIDIA NIM/OpenAI API keys are stored in plaintext inside the browser's `localStorage` (`src/state/store.js`).
- **The Fix:** Migrate the credentials storage to use Tauri's native secure keychain (`tauri-plugin-store` or OS-native keyring) so API keys are heavily encrypted at rest.

### 2. 🧠 Context Engine: Git & File Tree Awareness (Improvement)
- **The Issue:** Volt's AI only "sees" the last 100 lines of terminal text. It doesn't actually understand the layout of the project you are in.
- **The Fix:** Build a Rust plugin that automatically ingests the current directory's `git status` and a lightweight file tree map, appending it silently to the AI's system prompt.

### 3. 🐛 Terminal Emulation: Prompt Detection (Bug)
- **The Issue:** To know when a command finishes, `terminal.js` uses a fragile regex fallback (`/[#$>%❯➜]\s*$/`) for shells that don't emit OSC 133 markers. This causes false positives (e.g. inside Vim or if text ends with a `#`).
- **The Fix:** Build a native shell integration script (like iTerm2 or VSCode uses) that forces Bash/Zsh/Fish to emit strict ANSI markers when a prompt begins and ends.

*(Note: We recently fixed a major security bug where the frontend used a fragile JavaScript array to detect dangerous commands. It now successfully uses the Rust AST analyzer (`command_guard.rs`)!)*

---

## 🛠️ Getting Started (The Setup)

Ready to write some code? Here is how to get your local environment running.

1. **Fork the repo** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Volt.git
   cd Volt
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start the dev server (Hot Reloading enabled!):**
   ```bash
   npm run tauri dev
   ```

*(Note: Ensure you have Rust and Node.js v18+ installed on your machine!)*

---

## 🚀 Submitting a Pull Request

When you're ready to share your magic:
1. Create a new branch: `git checkout -b feature/my-cool-feature`
2. Commit your changes with a clear message: `git commit -m "feat: added voice mode"`
3. Push it up: `git push origin feature/my-cool-feature`
4. Open a Pull Request on the main Volt repository!

<div align="center">
  <br/>
  <h1>👋</h1>
  <p><b>We can't wait to see what you build.</b></p>
</div>
