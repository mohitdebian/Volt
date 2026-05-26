/**
 * NexTerm — AI Panel
 * Warp-style right panel: message cards + "Insert to terminal" button
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import store from '../state/store.js';
import { getActiveTerminal } from '../terminal/tabs.js';

let requestCounter = 0;

export function initAiPanel() {
  const panel    = document.getElementById('ai-panel');
  const toggle   = document.getElementById('ai-toggle-btn');
  const collapse = document.getElementById('ai-panel-collapse');
  const input    = document.getElementById('ai-input');
  const sendBtn  = document.getElementById('ai-send-btn');

  toggle?.addEventListener('click',   toggleAiPanel);
  collapse?.addEventListener('click', () => closeAiPanel());

  // AI tab switching
  document.querySelectorAll('.ai-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      store.set('aiMode', tab.dataset.mode);
    });
  });

  // Send on Enter
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); }
  });
  sendBtn?.addEventListener('click', sendQuery);

  store.subscribe('aiPanelOpen', open => {
    panel?.classList.toggle('hidden', !open);
    if (open) {
      input?.focus();
      setTimeout(() => getActiveTerminal()?.fit(), 200);
    } else {
      setTimeout(() => getActiveTerminal()?.fit(), 200);
    }
  });

  // Init
  if (!store.get('aiMode')) store.set('aiMode', 'command');
}

export function toggleAiPanel() {
  store.set('aiPanelOpen', !store.get('aiPanelOpen'));
}
export function closeSidebar() { closeAiPanel(); }  // legacy alias
function closeAiPanel() {
  store.set('aiPanelOpen', false);
}

// ── Send query ─────────────────────────────────────────────────────────
async function sendQuery() {
  const input = document.getElementById('ai-input');
  const query = input?.value.trim();
  if (!query) return;
  input.value = '';

  const mode = store.get('aiMode') || 'command';
  const requestId = `req-${++requestCounter}-${Date.now()}`;

  // User message card
  addUserMessage(query);

  // Assistant placeholder
  const assistantEl = addAssistantPlaceholder();
  const textEl = assistantEl.querySelector('.ai-msg-text');

  let fullResponse = '';

  const unlistenChunk = await listen(`ai-chunk-${requestId}`, e => {
    fullResponse += e.payload;
    textEl.innerHTML = formatResponse(fullResponse);
    scrollMessages();
  });

  const unlistenDone = await listen(`ai-done-${requestId}`, () => {
    unlistenChunk();
    unlistenDone();
    assistantEl.classList.remove('loading');
    if (fullResponse.trim()) {
      renderCommandBlocks(assistantEl, fullResponse.trim());
    }
    scrollMessages();
  });

  try {
    const cwd = await getCwd();
    await invoke('ai_ask', { query, cwd, mode, requestId });
  } catch (err) {
    unlistenChunk();
    unlistenDone();
    assistantEl.classList.remove('loading');
    textEl.innerHTML = `<span style="color:var(--err)">Error: ${escapeHtml(String(err))}</span>`;
  }
}

// ── Message renderers ──────────────────────────────────────────────────
function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'ai-msg-user';
  el.textContent = text;
  messagesEl().appendChild(el);
  scrollMessages();
}

function addAssistantPlaceholder() {
  const el = document.createElement('div');
  el.className = 'ai-msg-assistant loading';
  el.innerHTML = `<div class="ai-msg-text"></div>`;
  messagesEl().appendChild(el);
  scrollMessages();
  return el;
}

function renderCommandBlocks(parentEl, rawText) {
  // Extract fenced code blocks
  const codeRe = /```(?:\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = codeRe.exec(rawText)) !== null) {
    const cmd = match[1].trim();
    if (!cmd) continue;
    parentEl.appendChild(buildCommandBlock(cmd));
  }

  // If no fenced blocks, try to extract a bare shell command line
  if (!parentEl.querySelector('.ai-cmd-block')) {
    const lines = rawText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const cmd = lines.find(l => /^[$>]?\s*\S+/.test(l))?.replace(/^[$>]\s*/, '');
    if (cmd) parentEl.appendChild(buildCommandBlock(cmd.trim()));
  }
}

function buildCommandBlock(cmd) {
  const execMode = store.get('execMode') || 'agent';

  const block = document.createElement('div');
  block.className = 'ai-cmd-block';
  block.innerHTML = `
    <code class="ai-cmd-code">${escapeHtml(cmd)}</code>
    <button class="ai-cmd-copy" title="Copy">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.1"/>
        <path d="M4 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H9" stroke="currentColor" stroke-width="1.1"/>
      </svg>
    </button>
  `;

  // Copy
  block.querySelector('.ai-cmd-copy').addEventListener('click', e => {
    navigator.clipboard.writeText(cmd);
    e.currentTarget.innerHTML = '✓';
    setTimeout(() => {
      e.currentTarget.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.1"/><path d="M4 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H9" stroke="currentColor" stroke-width="1.1"/></svg>`;
    }, 1500);
  });

  // Insert to terminal button (below the block)
  const insertBtn = document.createElement('button');
  insertBtn.className = 'ai-insert-btn';
  const iconSvg = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  insertBtn.innerHTML = `${iconSvg} Insert to terminal ↵`;

  insertBtn.addEventListener('click', async () => {
    if (execMode === 'ask') {
      navigator.clipboard.writeText(cmd);
      insertBtn.textContent = '📋 Copied';
      setTimeout(() => { insertBtn.innerHTML = `${iconSvg} Insert to terminal ↵`; }, 1500);
      return;
    }

    const isDangerous = await checkDangerous(cmd);
    if (execMode === 'agent' && isDangerous) {
      showConfirm(cmd, isDangerous, () => executeCommand(cmd));
      return;
    }
    executeCommand(cmd);
  });

  // Wrap both in a column container
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  wrap.appendChild(block);
  wrap.appendChild(insertBtn);
  return wrap;
}

async function checkDangerous(cmd) {
  try {
    const risk = await invoke('analyze_command_risk', { command: cmd });
    return risk.requires_confirmation ? risk.reason : null;
  } catch { return null; }
}

function executeCommand(cmd) {
  getActiveTerminal()?.writeCommand(cmd);
}

function showConfirm(command, reason, onConfirm) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-message').textContent = reason || 'This may be destructive.';
  document.getElementById('confirm-command').textContent = command;
  dialog.classList.remove('hidden');

  const cleanup = () => {
    dialog.classList.add('hidden');
    cancelBtn.removeEventListener('click', onCancel);
    runBtn.removeEventListener('click', onRun);
    document.getElementById('confirm-backdrop').removeEventListener('click', onCancel);
  };
  const cancelBtn = document.getElementById('confirm-cancel');
  const runBtn    = document.getElementById('confirm-run');
  const onCancel  = () => cleanup();
  const onRun     = () => { cleanup(); onConfirm(); };
  cancelBtn.addEventListener('click', onCancel);
  runBtn.addEventListener('click', onRun);
  document.getElementById('confirm-backdrop').addEventListener('click', onCancel, { once: true });
}

async function getCwd() {
  try {
    const ctx = await invoke('get_context', { cwd: '.' });
    return ctx.cwd || '.';
  } catch { return '.'; }
}

function messagesEl() { return document.getElementById('ai-messages'); }
function scrollMessages() {
  const el = messagesEl();
  if (el) el.scrollTop = el.scrollHeight;
}

function formatResponse(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
