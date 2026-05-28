/**
 * Volt — main entry
 * Full-width terminal + inline AI (Ctrl+I toggle)
 */
import { initTabs, createTab, closeTab, nextTab, prevTab, getActiveTerminal, splitPane } from './terminal/tabs.js';
import { initInlineAI, toggleAiMode } from './components/ai-inline.js';
import { initCommandPalette } from './components/command-palette.js';
import { initStatusBar } from './components/status-bar.js';
import { initSettings } from './components/settings-panel.js';
import { initIdeInput } from './components/ide-input.js';
import store from './state/store.js';
import { getCurrentWindow } from '@tauri-apps/api/window';

import '@xterm/xterm/css/xterm.css';

async function init() {
  // ── Block context menu + devtools ──
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.key === 'F12') return e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'C')) return e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') return e.preventDefault();
  });

  // ── Window controls ──
  const win = getCurrentWindow();
  document.getElementById('win-minimize')?.addEventListener('click', () => win.minimize());
  document.getElementById('win-maximize')?.addEventListener('click', async () => {
    (await win.isMaximized()) ? win.unmaximize() : win.maximize();
  });
  document.getElementById('win-close')?.addEventListener('click', () => win.close());

  // ── Window dragging — mousedown on tab-strip background ──
  const tabStrip = document.getElementById('tab-strip');
  tabStrip?.addEventListener('mousedown', e => {
    // Only drag on the strip itself or empty space, not on buttons/tabs
    if (e.target === tabStrip || e.target.id === 'tab-list' || e.target.hasAttribute('data-drag')) {
      win.startDragging();
    }
  });

  // ── Clock ──
  const timeEl = document.getElementById('status-time');
  if (timeEl) {
    const tick = () => {
      const d = new Date();
      const h = d.getHours();
      timeEl.textContent = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
    };
    tick();
    setInterval(tick, 30000);
  }

  // ── Exec mode pill (click cycles) ──
  const pill = document.getElementById('exec-mode-pill');
  const pillLabel = document.getElementById('exec-mode-label');
  const modes = ['ask', 'agent', 'full'];
  const modeLabels = { ask: 'Ask', agent: 'Agent', full: 'Full Access' };

  if (!store.get('execMode')) store.set('execMode', 'agent');

  const updatePill = m => {
    if (pill) pill.className = `mode-pill ${m}`;
    if (pillLabel) pillLabel.textContent = modeLabels[m];
    document.querySelectorAll('.em-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  };
  updatePill(store.get('execMode'));
  store.subscribe('execMode', updatePill);

  pill?.addEventListener('click', () => {
    const cur = store.get('execMode') || 'agent';
    store.set('execMode', modes[(modes.indexOf(cur) + 1) % modes.length]);
  });

  // ── Init modules ──
  initTabs();
  initInlineAI();
  initCommandPalette();
  initStatusBar();
  initSettings();
  initIdeInput();

  // ── Onboarding ──
  if (!localStorage.getItem('onboardingCompleted')) {
    const modal = document.getElementById('onboarding-modal');
    modal.classList.remove('hidden');
    
    const closeBtn = document.getElementById('onboarding-close-btn');
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      localStorage.setItem('onboardingCompleted', 'true');
      
      // Prompt for API key if missing (checking localStorage settings)
      const settingsStr = localStorage.getItem('nexterm_settings');
      let hasKey = false;
      if (settingsStr) {
        try {
          const parsed = JSON.parse(settingsStr);
          if (parsed.api_key && parsed.api_key.trim() !== '') hasKey = true;
        } catch(e) {}
      }
      
      if (!hasKey) {
        setTimeout(() => {
          store.set('settingsOpen', true);
        }, 300);
      }
    });
  }

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 't') { e.preventDefault(); createTab(); return; }
    if (ctrl && e.key === 'w') { e.preventDefault(); closeTab(store.get('activeTabId')); return; }
    if (ctrl && e.shiftKey && e.key === 'D') { e.preventDefault(); splitPane('row'); return; }
    if (ctrl && e.shiftKey && e.key === 'E') { e.preventDefault(); splitPane('column'); return; }
    if (ctrl && e.key === 'Tab') { e.preventDefault(); e.shiftKey ? prevTab() : nextTab(); return; }
    if (ctrl && e.key === 'i') { e.preventDefault(); toggleAiMode(); return; }
    if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); store.set('commandPaletteOpen', !store.get('commandPaletteOpen')); return; }
    if (ctrl && e.key === ',') { e.preventDefault(); store.set('settingsOpen', !store.get('settingsOpen')); return; }
    if (e.key === 'Escape') {
      if (store.get('commandPaletteOpen')) { store.set('commandPaletteOpen', false); return; }
      if (store.get('settingsOpen')) { store.set('settingsOpen', false); return; }
      if (store.get('aiModeActive')) { toggleAiMode(); return; }
      getActiveTerminal()?.focus();
    }
  });
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
