/**
 * NexTerm - Command palette
 */
import store from '../state/store.js';
import { createTab, closeTab, nextTab, prevTab, getActiveTerminal } from '../terminal/tabs.js';

const COMMANDS = [
  { name: 'New Tab',                shortcut: 'Ctrl+T',         action: () => createTab() },
  { name: 'Close Tab',              shortcut: 'Ctrl+W',         action: () => closeTab(store.get('activeTabId')) },
  { name: 'Next Tab',               shortcut: 'Ctrl+Tab',       action: () => nextTab() },
  { name: 'Previous Tab',           shortcut: 'Ctrl+Shift+Tab', action: () => prevTab() },
  { name: 'Toggle AI Mode',          shortcut: 'Ctrl+I',         action: () => store.set('aiModeActive', !store.get('aiModeActive')) },
  { name: 'Open Settings',          shortcut: 'Ctrl+,',         action: () => { store.set('settingsOpen', true); store.set('commandPaletteOpen', false); }},
  { name: 'Clear Terminal',         shortcut: '',               action: () => getActiveTerminal()?.term.clear() },
  { name: 'Focus Terminal',         shortcut: 'Escape',         action: () => getActiveTerminal()?.focus() },
  { name: 'Split / New Tab',        shortcut: 'Ctrl+Shift+D',   action: () => createTab() },
  { name: 'AI: Generate Command',   shortcut: '',               action: () => { store.set('aiMode', 'command'); store.set('aiModeActive', true); store.set('commandPaletteOpen', false); }},
  { name: 'AI: Debug Error',        shortcut: '',               action: () => { store.set('aiMode', 'debug');   store.set('aiModeActive', true); store.set('commandPaletteOpen', false); }},
  { name: 'AI: Explain Output',     shortcut: '',               action: () => { store.set('aiMode', 'explain'); store.set('aiModeActive', true); store.set('commandPaletteOpen', false); }},
];

let selectedIndex = 0;

export function initCommandPalette() {
  const palette  = document.getElementById('command-palette');
  const input    = document.getElementById('command-palette-input');
  const list     = document.getElementById('command-palette-list');
  const backdrop = document.getElementById('command-palette-backdrop');

  if (!palette || !input || !list) return;

  backdrop?.addEventListener('click', closePalette);

  input.addEventListener('input', () => { selectedIndex = 0; renderList(input.value); });
  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('.palette-item');
    if (e.key === 'ArrowDown')  { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, items.length - 1); updateSelection(items); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateSelection(items); }
    else if (e.key === 'Enter') { e.preventDefault(); const f = getFiltered(input.value); if (f[selectedIndex]) { f[selectedIndex].action(); closePalette(); } }
    else if (e.key === 'Escape') closePalette();
  });

  store.subscribe('commandPaletteOpen', open => {
    palette.classList.toggle('hidden', !open);
    if (open) { input.value = ''; selectedIndex = 0; renderList(''); input.focus(); }
  });
}

function closePalette() {
  store.set('commandPaletteOpen', false);
  getActiveTerminal()?.focus();
}

function getFiltered(query) {
  if (!query) return COMMANDS;
  const q = query.toLowerCase();
  return COMMANDS.filter(c => c.name.toLowerCase().includes(q));
}

function renderList(query) {
  const list = document.getElementById('command-palette-list');
  const filtered = getFiltered(query);
  list.innerHTML = filtered.map((cmd, i) => `
    <li class="palette-item${i === selectedIndex ? ' selected' : ''}" data-index="${i}">
      <span>${cmd.name}</span>
      ${cmd.shortcut ? `<span class="palette-item-shortcut">${cmd.shortcut}</span>` : ''}
    </li>
  `).join('');
  list.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => { filtered[parseInt(el.dataset.index)].action(); closePalette(); });
  });
}

function updateSelection(items) {
  items.forEach((el, i) => el.classList.toggle('selected', i === selectedIndex));
  items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}
