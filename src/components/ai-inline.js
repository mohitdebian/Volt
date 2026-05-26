/**
 * NexTerm — Inline AI mode
 *
 * Ctrl+I toggles "AI mode":
 * - Shows a small input bar at the bottom of the terminal
 * - User types a question → AI response prints inline in the terminal
 * - Ctrl+I again → back to normal terminal, bar hides
 *
 * Commands from AI are rendered with ANSI styling directly in the terminal.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import store from '../state/store.js';
import { getActiveTerminal } from '../terminal/tabs.js';

let requestCounter = 0;

export function initInlineAI() {
  const bar   = document.getElementById('ai-bar');
  const input = document.getElementById('ai-bar-input');
  const send  = document.getElementById('ai-bar-send');

  if (!bar || !input) return;

  // Send on Enter
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleAiMode();
    }
  });

  send?.addEventListener('click', sendQuery);
  document.getElementById('ai-close-btn')?.addEventListener('click', toggleAiMode);
  
  const dockBtn = document.getElementById('ai-dock-btn');
  dockBtn?.addEventListener('click', () => {
    document.getElementById('terminal-section')?.classList.toggle('dock-right');
    setTimeout(() => getActiveTerminal()?.fit(), 50);
  });

  // React to state changes
  store.subscribe('aiModeActive', active => {
    const container = document.getElementById('ai-container');
    const bar = document.getElementById('ai-bar');
    const input = document.getElementById('ai-bar-input');
    const runningBar = document.getElementById('ai-running-bar');
    const resizer = document.getElementById('panel-resizer');
    
    container?.classList.toggle('hidden', !active);
    resizer?.classList.toggle('hidden', !active);

    if (active) {
      bar?.classList.remove('hidden');
      runningBar?.classList.add('hidden');
      input.value = '';
      input.focus();
    } else {
      bar?.classList.add('hidden');
      runningBar?.classList.add('hidden');
      getActiveTerminal()?.focus();
    }
    // Refit terminal since bar changed height
    setTimeout(() => getActiveTerminal()?.fit(), 100);
  });
  
  // Resizer logic
  let isResizing = false;
  const resizer = document.getElementById('panel-resizer');
  const container = document.getElementById('ai-container');
  const terminalSection = document.getElementById('terminal-section');
  
  resizer?.addEventListener('mousedown', e => {
    isResizing = true;
    document.body.style.cursor = terminalSection.classList.contains('dock-right') ? 'ew-resize' : 'ns-resize';
  });
  
  window.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const isDockRight = terminalSection.classList.contains('dock-right');
    if (isDockRight) {
      const containerWidth = document.body.clientWidth - e.clientX;
      container.style.width = `${Math.max(200, containerWidth)}px`;
      container.style.maxWidth = 'none';
    } else {
      const containerHeight = document.body.clientHeight - e.clientY;
      container.style.maxHeight = 'none';
      container.style.height = `${Math.max(100, containerHeight)}px`;
    }
    getActiveTerminal()?.fit();
  });
  
  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
      getActiveTerminal()?.fit();
    }
  });
}

export function toggleAiMode() {
  store.set('aiModeActive', !store.get('aiModeActive'));
}

// ── Send AI query ─────────────────────────────────────────
async function sendQuery() {
  const input = document.getElementById('ai-bar-input');
  const query = input?.value.trim();
  if (!query) return;
  input.value = '';

  const bar = document.getElementById('ai-bar');
  const runningBar = document.getElementById('ai-running-bar');
  const responseArea = document.getElementById('ai-response-area');
  
  if (!bar || !runningBar || !responseArea) return;

  bar.classList.add('hidden');
  runningBar.classList.remove('hidden');

  // Append user message
  const userDiv = document.createElement('div');
  userDiv.style.marginBottom = '8px';
  userDiv.innerHTML = `<strong style="color:var(--t1)">You:</strong> <span>${query.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
  responseArea.appendChild(userDiv);
  
  // Create AI message container
  const aiDiv = document.createElement('div');
  aiDiv.style.marginBottom = '16px';
  aiDiv.innerHTML = `<strong style="color:var(--ac2)">Volt AI:</strong> <span class="content"></span>`;
  responseArea.appendChild(aiDiv);
  
  const contentSpan = aiDiv.querySelector('.content');

  const term = getActiveTerminal();
  if (!term) return;

  const requestId = `req-${++requestCounter}-${Date.now()}`;

  let fullResponse = '';
  let chunksReceived = 0;
  const execMode = store.get('execMode') || 'agent';

  const unlistenChunk = await listen(`ai-chunk-${requestId}`, e => {
    const chunk = e.payload;
    chunksReceived++;
    fullResponse += chunk;
    
    // Convert newlines to HTML breaks, wrap backticks in code tags, etc.
    let html = fullResponse
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/```bash\n([\s\S]*?)```/g, '<code>$1</code>')
      .replace(/```(?:\w+)?\n([\s\S]*?)```/g, '<code>$1</code>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
      
    contentSpan.innerHTML = html;
    responseArea.scrollTop = responseArea.scrollHeight;
  });

  // The `ai-done` event has been completely removed in favor of purely
  // relying on the asynchronous return of `invoke('ai_ask')` below.
  // This guarantees no race conditions between Tauri events and Promise resolution.

  try {
    const cwd = await getCwd();
    const mode = store.get('aiMode') || 'command';
    const nimConfig = store.get('nimConfig');
    console.log('[Volt AI] Sending query:', { query, cwd, mode, requestId });
    console.log('[Volt AI] NIM config:', {
      model: nimConfig?.model,
      base_url: nimConfig?.base_url,
      api_key: nimConfig?.api_key ? '***set (' + nimConfig.api_key.length + ' chars)***' : '(EMPTY!)'
    });
    const invokeResult = await invoke('ai_ask', { query, cwd, mode, requestId });
    console.log('[Volt AI] ai_ask invoke returned successfully. Result length:', invokeResult?.length);
    
    // Cleanup chunk listener
    unlistenChunk();

    // If chunks never arrived during streaming, render the full backend payload now
    if (chunksReceived === 0 && invokeResult) {
      console.log('[Volt AI] No chunks streamed! Rendering full backend payload.');
      let html = invokeResult
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/```bash\n([\s\S]*?)```/g, '<code>$1</code>')
        .replace(/```(?:\w+)?\n([\s\S]*?)```/g, '<code>$1</code>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      contentSpan.innerHTML = html;
      responseArea.scrollTop = responseArea.scrollHeight;
    }

    const finalResponse = invokeResult || fullResponse;

    if (!finalResponse.trim()) {
      contentSpan.innerHTML = '<span style="color:var(--e1)">No response from AI server. Check API URL/Key.</span>';
    } else {
      let commands = extractCommands(finalResponse);
      
      if (commands.length > 0) {
        const combinedCmd = commands.join(' && ');
        if (execMode === 'full' || execMode === 'agent') {
          term.writeCommand(combinedCmd);
        } else {
          term.injectCommand(combinedCmd);
        }
      }
    }

    // Hide running bar and restore input
    runningBar.classList.add('hidden');
    bar.classList.remove('hidden');
    document.getElementById('ai-bar-input')?.focus();
    
  } catch (err) {
    unlistenChunk();
    console.error('[Volt AI] ai_ask FAILED:', err);
    
    contentSpan.innerHTML = `<span style="color:var(--e1)">AI Error: ${err}</span>`;
    
    runningBar?.classList.add('hidden');
    bar?.classList.remove('hidden');
    document.getElementById('ai-bar-input')?.focus();
  }
}

// ── Helpers ───────────────────────────────────────────────
function extractCommands(text) {
  const cmds = [];
  // Fenced code blocks
  const re = /```(?:\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const cmd = m[1].trim();
    if (cmd) cmds.push(cmd);
  }
  return cmds;
}

const DANGEROUS = ['rm ', 'rm -', 'rmdir', 'sudo ', 'mkfs', 'dd ', '> /dev/', 'chmod 777', 'kill -9', ':(){', 'fork bomb'];
function isDangerous(cmd) {
  const lower = cmd.toLowerCase();
  return DANGEROUS.some(d => lower.includes(d));
}

function showConfirm(command, reason, onConfirm) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog) { onConfirm(); return; }
  document.getElementById('confirm-message').textContent = reason;
  document.getElementById('confirm-command').textContent = command;
  dialog.classList.remove('hidden');

  const cleanup = () => {
    dialog.classList.add('hidden');
    cancelBtn.removeEventListener('click', onCancel);
    runBtn.removeEventListener('click', onRun);
  };
  const cancelBtn = document.getElementById('confirm-cancel');
  const runBtn    = document.getElementById('confirm-run');
  const onCancel  = () => cleanup();
  const onRun     = () => { cleanup(); onConfirm(); };
  cancelBtn?.addEventListener('click', onCancel);
  runBtn?.addEventListener('click', onRun);
  document.getElementById('confirm-backdrop')?.addEventListener('click', onCancel, { once: true });
}

async function getCwd() {
  try {
    const ctx = await invoke('get_context', { cwd: '.' });
    return ctx.cwd || '.';
  } catch { return '.'; }
}

function escapeForTerminal(str) {
  return str.replace(/[\x00-\x1f]/g, '');
}
