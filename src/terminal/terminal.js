/**
 * NexTerm - xterm.js terminal integration
 * Handles terminal rendering, PTY binding, and data flow
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import store from '../state/store.js';

/**
 * Create a new terminal instance bound to a PTY session
 * @param {string} tabId - Tab identifier
 * @param {HTMLElement} container - DOM container for the terminal
 * @param {string|null} cwd - Initial working directory
 * @returns {object} Terminal controller with cleanup methods
 */
export async function createTerminal(tabId, container, cwd = null) {
  const fontSize = store.get('fontSize') || 14;

  const term = new Terminal({
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: fontSize,
    lineHeight: 1.4,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    theme: {
      background:          '#0e0e0e',   /* matches --bg-1 */
      foreground:          '#d4d4d4',
      cursor:              '#ffffff',
      cursorAccent:        '#0e0e0e',
      selectionBackground: 'rgba(255,255,255,0.15)',
      selectionForeground: '#ffffff',
      /* ANSI colors — clean, readable, not garish */
      black:         '#1a1a1a',
      red:           '#e06c75',
      green:         '#98c379',
      yellow:        '#e5c07b',
      blue:          '#61afef',
      magenta:       '#c678dd',
      cyan:          '#56b6c2',
      white:         '#abb2bf',
      brightBlack:   '#5c6370',
      brightRed:     '#e06c75',
      brightGreen:   '#98c379',
      brightYellow:  '#e5c07b',
      brightBlue:    '#61afef',
      brightMagenta: '#c678dd',
      brightCyan:    '#56b6c2',
      brightWhite:   '#ffffff',
    },
    allowProposedApi: true,
    scrollback: 2000,
    smoothScrollDuration: 80,
    macOptionIsMeta: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  // Let our app shortcuts pass through instead of being eaten by xterm
  term.attachCustomKeyEventHandler(e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'i') return false;  // Ctrl+I → AI toggle
    if (ctrl && e.key === 't') return false;  // Ctrl+T → new tab
    if (ctrl && e.key === 'w') return false;  // Ctrl+W → close tab
    if (ctrl && e.key === ',') return false;  // Ctrl+, → settings
    if (ctrl && e.shiftKey && e.key === 'P') return false; // palette
    return true; // all other keys → xterm handles normally
  });

  // Create DOM element for this terminal pane
  const pane = document.createElement('div');
  pane.className = 'terminal-pane active';
  pane.id = `terminal-${tabId}`;
  container.appendChild(pane);

  term.open(pane);

  // Small delay to let DOM settle before fitting
  await new Promise(r => setTimeout(r, 50));
  fitAddon.fit();

  // Spawn PTY session in Rust backend
  const sessionId = await invoke('spawn_pty', {
    cols: term.cols,
    rows: term.rows,
    cwd: cwd,
  });

  // Listen for PTY output from Rust and write to xterm
  // Also parse OSC 133 shell integration markers for exit code detection
  let lastExitCode = 0;
  const osc133Re = /\x1b\]133;D;(\d+)\x07/;
  
  const unlistenOutput = await listen(`pty-output-${sessionId}`, (event) => {
    const data = event.payload;
    
    // Check for OSC 133 exit code marker
    const match = osc133Re.exec(data);
    if (match) {
      lastExitCode = parseInt(match[1], 10);
      
      // Dispatch a generic finished event (used by workflow engine)
      document.dispatchEvent(new CustomEvent('command-finished', {
        detail: { exitCode: lastExitCode, tabId, sessionId }
      }));

      if (lastExitCode !== 0) {
        // Dispatch a custom event so the AI can auto-debug
        document.dispatchEvent(new CustomEvent('command-failed', {
          detail: {
            exitCode: lastExitCode,
            tabId,
            sessionId,
          }
        }));
      }
      // Render the command block copy button
      if (activeCommandMarker) {
        renderCommandBlock(activeCommandMarker);
        activeCommandMarker = null;
      }
      
      // Strip the OSC marker from visible output
      term.write(data.replace(osc133Re, ''));
    } else {
      term.write(data);
      
      // Heuristic fallback for Zsh/Fish (missing OSC 133 markers)
      // Check if IDE input bar is hidden (meaning a command is currently running/we are waiting)
      const ideBar = document.getElementById('ide-input-bar');
      if (ideBar && ideBar.classList.contains('hidden')) {
        clearTimeout(window[`fallbackTimer_${sessionId}`]);
        window[`fallbackTimer_${sessionId}`] = setTimeout(() => {
          // If no output for 400ms, check if we hit a prompt
          const activeBuffer = term.buffer.active;
          if (activeBuffer.type === 'alternate') return; // Don't trigger inside vim/htop

          const lines = [];
          for (let i = Math.max(0, activeBuffer.baseY + activeBuffer.cursorY - 1); i <= activeBuffer.baseY + activeBuffer.cursorY; i++) {
            const line = activeBuffer.getLine(i);
            if (line) lines.push(line.translateToString(true).trimEnd());
          }
          const text = lines.join('\n').trim();
          
          if (/[#$>%❯➜]\s*$/.test(text)) {
            document.dispatchEvent(new CustomEvent('command-finished', {
              detail: { exitCode: 0, tabId, sessionId }
            }));
            if (activeCommandMarker) {
              renderCommandBlock(activeCommandMarker);
              activeCommandMarker = null;
            }
          }
        }, 400);
      }
    }
  });

  // Listen for PTY exit
  const unlistenExit = await listen(`pty-exit-${sessionId}`, () => {
    term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
  });

  // ── Block Decorations & Input ───────────────────────────
  let activeCommandMarker = null;

  term.onKey(({ domEvent }) => {
    if (domEvent.key === 'Enter') {
      // Mark the start of the command (at the current cursor line)
      activeCommandMarker = term.registerMarker(0);
    }
  });

  function renderCommandBlock(startMarker) {
    if (!startMarker) return;
    
    // Register decoration at the right edge
    const decoration = term.registerDecoration({
      marker: startMarker,
      x: term.cols - 4,
      width: 3,
      height: 1
    });
    
    if (!decoration) return;

    // Capture the end line at the moment the command finishes
    const endLine = term.buffer.active.baseY + term.buffer.active.cursorY;

    decoration.onRender(element => {
      if (element.hasChildNodes()) return; // already rendered
      
      element.style.display = 'flex';
      element.style.alignItems = 'center';
      element.style.justifyContent = 'center';
      element.style.cursor = 'pointer';
      element.title = 'Copy output';
      element.style.background = 'var(--b2)';
      element.style.borderRadius = '4px';
      element.style.border = '1px solid var(--b3)';
      element.style.zIndex = '50';
      
      const copyIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      element.innerHTML = copyIcon;

      element.onmouseenter = () => { element.style.borderColor = 'var(--ac1)'; element.style.color = 'var(--ac1)'; };
      element.onmouseleave = () => { element.style.borderColor = 'var(--b3)'; element.style.color = 'var(--t2)'; };

      element.onclick = () => {
        const startY = startMarker.line;
        let output = '';
        for (let i = startY + 1; i < endLine; i++) {
          const lineText = term.buffer.active.getLine(i);
          if (lineText) output += lineText.translateToString(true) + '\n';
        }
        navigator.clipboard.writeText(output.trim());
        
        element.innerHTML = `<span style="color:#98c379;font-size:12px">✓</span>`;
        setTimeout(() => { element.innerHTML = copyIcon; }, 1500);
      };
    });
  }

  // Forward user input from xterm to PTY
  const onDataDisposable = term.onData((data) => {
    invoke('write_pty', { sessionId, data }).catch(console.error);
  });

  // Handle terminal resize
  const onResizeDisposable = term.onResize(({ cols, rows }) => {
    invoke('resize_pty', { sessionId, cols, rows }).catch(console.error);
  });

  // Fit terminal when window resizes
  const resizeObserver = new ResizeObserver(() => {
    try { fitAddon.fit(); } catch (e) { /* ignore if not visible */ }
  });
  resizeObserver.observe(pane);

  // Return controller
  return {
    term,
    sessionId,
    fitAddon,
    pane,
    cwd,

    focus() {
      term.focus();
    },

    fit() {
      try { fitAddon.fit(); } catch (e) {}
    },

    show() {
      pane.classList.add('active');
      // Need a microtask delay for fit to work after display change
      requestAnimationFrame(() => {
        fitAddon.fit();
        term.focus();
      });
    },

    hide() {
      pane.classList.remove('active');
    },

    /** Write a command to the terminal (for AI-suggested commands) */
    writeCommand(cmd) {
      invoke('write_pty', { sessionId, data: cmd + '\n' }).catch(console.error);
    },

    /** Inject text into the shell prompt without executing it */
    injectCommand(cmd) {
      // Send Enter to force a clean shell prompt, then wait 50ms for shell to render before typing the command
      invoke('write_pty', { sessionId, data: '\r' }).catch(console.error);
      if (cmd) {
        setTimeout(() => {
          invoke('write_pty', { sessionId, data: cmd }).catch(console.error);
        }, 50);
      }
    },

    /** Get the last ~100 lines of terminal output for AI context */
    getText() {
      const buffer = term.buffer.active;
      let lines = [];
      const startLine = Math.max(0, buffer.length - 100);
      for (let i = startLine; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          lines.push(line.translateToString(true).trimEnd());
        }
      }
      return lines.join('\n').trim();
    },

    /** Clean up all resources */
    dispose() {
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      unlistenOutput();
      unlistenExit();
      invoke('kill_pty', { sessionId }).catch(() => {});
      term.dispose();
      pane.remove();
    },
  };
}
