/**
 * NexTerm - Status bar
 * Updates cwd, git branch, shell name in the new bottom status bar
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import store from '../state/store.js';

export function initStatusBar() {
  // Listen for context updates from Rust
  listen('system-status', event => {
    updateFromStatus(event.payload);
  }).catch(() => {});

  // Initial fetch (best effort)
  invoke('get_system_info').then(updateFromStatus).catch(() => {});

  // When nimConfig changes, update model label in AI panel footer
  store.subscribe('nimConfig', config => {
    const el = document.getElementById('ai-model-label');
    if (el && config?.model) {
      const short = config.model.split('/').pop().replace('-instruct', '');
      el.textContent = `${short} via NVIDIA NIM`;
    }
  });
}

function updateFromStatus(status) {
  if (!status) return;
  // No GPU/RAM elements in new status bar — silently ignore
}

/**
 * Update CWD + git branch in bottom status bar
 * Called from terminal context events
 */
export function updateContextStatus(context) {
  if (!context) return;

  const cwdText = document.getElementById('cwd-text');
  const gitEl   = document.getElementById('status-git');
  const gitText = document.getElementById('git-branch-text');
  const shellEl = document.getElementById('status-shell');

  if (cwdText) {
    const home = (context.cwd || '~').replace(/^\/home\/[^/]+/, '~');
    cwdText.textContent = home;
    document.getElementById('status-cwd').title = context.cwd || '';
  }

  if (shellEl && context.shell) {
    shellEl.textContent = context.shell.split('/').pop();
  }

  if (gitEl && gitText) {
    if (context.git_branch) {
      gitEl.classList.remove('hidden');
      gitText.textContent = context.git_branch;
    } else {
      gitEl.classList.add('hidden');
    }
  }
}
