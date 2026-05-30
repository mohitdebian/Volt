/**
 * NexTerm - Settings panel
 * Manages NIM configuration, terminal settings, execution mode, and persistence
 *
 * Settings are persisted in two places:
 * 1. localStorage (frontend) — survives page reloads
 * 2. Rust NimClient (backend) — so ai_ask can access the current config
 */
import { invoke } from '@tauri-apps/api/core';
import store from '../state/store.js';

const STORAGE_KEY = 'nexterm_settings';

export function openSettings() {
  const panel = document.getElementById('settings-section');
  const termSection = document.getElementById('terminal-section');
  const settingsTabBtn = document.getElementById('settings-tab-btn');
  
  if (panel) panel.classList.remove('hidden');
  if (termSection) termSection.classList.add('hidden');
  if (settingsTabBtn) settingsTabBtn.classList.add('active');
  store.set('settingsOpen', true);
}

export function closeSettings() {
  const panel = document.getElementById('settings-section');
  const termSection = document.getElementById('terminal-section');
  const settingsTabBtn = document.getElementById('settings-tab-btn');
  
  if (panel) panel.classList.add('hidden');
  if (termSection) termSection.classList.remove('hidden');
  if (settingsTabBtn) settingsTabBtn.classList.remove('active');
  store.set('settingsOpen', false);
}

export function initSettings() {
  const panel = document.getElementById('settings-section');
  const settingsTabBtn = document.getElementById('settings-tab-btn');
  const termSection = document.getElementById('terminal-section');
  const saveBtn = document.getElementById('settings-save-btn');
  const tempSlider = document.getElementById('settings-temperature');
  const tempValue = document.getElementById('settings-temp-value');
  const openBtn = document.getElementById('open-settings-btn');
  const closeTabBtn = document.getElementById('settings-tab-close');

  openBtn?.addEventListener('click', () => {
    store.set('settingsOpen', true);
  });

  closeTabBtn?.addEventListener('click', (e) => {
    e.stopPropagation(); // don't trigger the tab click
    store.set('settingsOpen', false);
  });

  settingsTabBtn?.addEventListener('click', () => {
    // If they click the active tab, maybe keep it open, or toggle it? Standard tabs don't close on click, they just focus.
    // If it's already open, do nothing.
    store.set('settingsOpen', true);
  });

  store.subscribe('settingsOpen', isOpen => {
    if (isOpen) {
      if (panel.classList.contains('hidden')) openSettings();
    } else {
      if (!panel.classList.contains('hidden')) closeSettings();
    }
  });

  saveBtn?.addEventListener('click', () => saveSettings());

  tempSlider?.addEventListener('input', () => {
    if (tempValue) tempValue.textContent = tempSlider.value;
  });

  // Settings nav tab switching
  document.querySelectorAll('.snav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.settings-tab-content').forEach(t => t.classList.add('hidden'));
      const activeTab = document.getElementById(`settings-tab-${tabId}`);
      if (activeTab) activeTab.classList.remove('hidden');

      // Update header title
      const headerTitle = document.getElementById('settings-tab-title');
      if (headerTitle) {
        headerTitle.textContent = tabId === 'general' ? 'General Settings' : 'AI Engine Connection';
      }
    });
  });

  // Close modal btn
  document.getElementById('settings-close-btn')?.addEventListener('click', () => store.set('settingsOpen', false));
  document.getElementById('settings-backdrop')?.addEventListener('click', () => store.set('settingsOpen', false));


  // Execution mode buttons
  document.querySelectorAll('.em-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.em-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Show/hide autopilot settings
      const autopilotSettings = document.getElementById('autopilot-settings');
      if (autopilotSettings) {
        autopilotSettings.classList.toggle('hidden', btn.dataset.mode !== 'autopilot');
      }
    });
  });

  // Execution mode badge in bottom bar — cycles through modes on click
  const badge = document.getElementById('exec-mode-badge');
  if (badge) {
    badge.addEventListener('click', () => {
      const modes = ['ask', 'agent', 'autopilot'];
      const labels = { ask: '💬 Ask', agent: '🤖 Agent', autopilot: '🚀 Autopilot' };
      const currentMode = store.get('execMode') || 'agent';
      const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
      const newMode = modes[nextIdx];
      store.set('execMode', newMode);
      updateBadge(newMode);
      // Also sync the settings buttons
      document.querySelectorAll('.em-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === newMode);
      });
      // Show/hide autopilot settings
      const autopilotSettings = document.getElementById('autopilot-settings');
      if (autopilotSettings) {
        autopilotSettings.classList.toggle('hidden', newMode !== 'autopilot');
      }
      // Persist
      persistToLocalStorage({ execMode: newMode });
    });
  }

  store.subscribe('settingsOpen', (open) => {
    panel.classList.toggle('hidden', !open);
    if (open) loadCurrentSettings();
  });

  // Initialize default exec mode
  if (!store.get('execMode')) {
    store.set('execMode', 'agent');
  }

  // ★ Load persisted settings from disk on startup
  loadPersistedSettings();
}

function updateBadge(mode) {
  const badge = document.getElementById('exec-mode-badge');
  if (!badge) return;
  const labels = { ask: '💬 Ask', agent: '🤖 Agent', autopilot: '🚀 Autopilot' };
  badge.className = `exec-badge ${mode}`;
  badge.textContent = labels[mode] || labels.agent;
}

/**
 * Load settings from localStorage and push them to the Rust backend.
 * This is what makes settings survive across app restarts.
 */
async function loadPersistedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      console.log('[NexTerm] Loaded persisted settings:', { ...saved, api_key: saved.api_key ? '***set***' : '(empty)' });

      const config = {
        api_key: saved.api_key || '',
        base_url: saved.base_url || 'https://integrate.api.nvidia.com/v1',
        model: saved.model || 'meta/llama-3.1-8b-instruct',
        temperature: saved.temperature ?? 0.3,
        max_tokens: saved.max_tokens ?? 2048,
      };

      // Push to Rust backend so ai_ask picks it up
      await invoke('update_nim_config', { config });
      store.set('nimConfig', config);

      if (saved.fontSize) store.set('fontSize', saved.fontSize);
      if (saved.execMode) {
        // Migrate legacy 'full' mode to 'autopilot'
        const execMode = saved.execMode === 'full' ? 'autopilot' : saved.execMode;
        store.set('execMode', execMode);
        updateBadge(execMode);
      }

      console.log('[NexTerm] Settings synced to backend ✓');
    } else {
      console.log('[NexTerm] No persisted settings found, using defaults.');
      // Still sync the default from backend
      const config = await invoke('get_nim_config');
      store.set('nimConfig', config);
    }
  } catch (err) {
    console.error('[NexTerm] Failed to load persisted settings:', err);
    // Fallback: load from backend
    try {
      const config = await invoke('get_nim_config');
      store.set('nimConfig', config);
    } catch {}
  }
}

function persistToLocalStorage(overrides = {}) {
  const config = store.get('nimConfig') || {};
  const data = {
    api_key: config.api_key || '',
    base_url: config.base_url || '',
    model: config.model || '',
    temperature: config.temperature ?? 0.3,
    max_tokens: config.max_tokens ?? 2048,
    fontSize: store.get('fontSize') || 14,
    execMode: store.get('execMode') || 'agent',
    ...overrides,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadCurrentSettings() {
  const config = store.get('nimConfig');
  const modelSelect = document.getElementById('settings-model');
  const customModel = document.getElementById('settings-custom-model');

  document.getElementById('settings-api-key').value = config.api_key || '';
  document.getElementById('settings-base-url').value = config.base_url;
  document.getElementById('settings-temperature').value = config.temperature;
  document.getElementById('settings-temp-value').textContent = config.temperature;
  document.getElementById('settings-font-size').value = store.get('fontSize');

  // Check if current model matches any preset option
  const presetOptions = Array.from(modelSelect.options).map(o => o.value);
  if (presetOptions.includes(config.model)) {
    modelSelect.value = config.model;
    customModel.value = '';
  } else {
    modelSelect.value = '';
    customModel.value = config.model;
  }

  // When user selects a preset, clear the custom field
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value) {
      customModel.value = '';
    }
  });

  // Load execution mode
  const execMode = store.get('execMode') || 'agent';
  document.querySelectorAll('.em-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === execMode);
  });
  updateBadge(execMode);

  // Show/hide autopilot settings
  const autopilotSettings = document.getElementById('autopilot-settings');
  if (autopilotSettings) {
    autopilotSettings.classList.toggle('hidden', execMode !== 'autopilot');
  }

  // Load sudo password from memory (never from disk)
  const sudoInput = document.getElementById('settings-sudo-password');
  if (sudoInput) {
    sudoInput.value = store.get('sudoPassword') || '';
  }
}

async function saveSettings() {
  const customModel = document.getElementById('settings-custom-model').value.trim();
  const presetModel = document.getElementById('settings-model').value;
  const model = customModel || presetModel || 'meta/llama-3.1-8b-instruct';

  const config = {
    api_key: document.getElementById('settings-api-key').value.trim(),
    base_url: document.getElementById('settings-base-url').value.trim(),
    model: model,
    temperature: parseFloat(document.getElementById('settings-temperature').value),
    max_tokens: 2048,
  };

  const fontSize = parseInt(document.getElementById('settings-font-size').value) || 14;

  // Get active execution mode
  const activeMode = document.querySelector('.em-btn.active');
  const execMode = activeMode ? activeMode.dataset.mode : 'agent';

  // Save sudo password to memory ONLY (never persisted to localStorage)
  const sudoPassword = document.getElementById('settings-sudo-password')?.value || '';
  store.set('sudoPassword', sudoPassword);

  try {
    console.log('[NexTerm] Saving settings...', { model: config.model, base_url: config.base_url, api_key: config.api_key ? '***set***' : '(empty)' });

    await invoke('update_nim_config', { config });
    store.set('nimConfig', config);
    store.set('fontSize', fontSize);
    store.set('execMode', execMode);
    updateBadge(execMode);

    // ★ Persist to localStorage so settings survive restart
    persistToLocalStorage();

    console.log('[NexTerm] Settings saved ✓');

    // Flash save button green
    const btn = document.getElementById('settings-save-btn');
    btn.textContent = '✓ Saved';
    btn.style.backgroundColor = 'var(--color-success)';
    setTimeout(() => {
      btn.textContent = 'Save Settings';
      btn.style.backgroundColor = '';
    }, 1500);
  } catch (err) {
    console.error('[NexTerm] Failed to save settings:', err);
    alert('Failed to save settings: ' + err);
  }
}

