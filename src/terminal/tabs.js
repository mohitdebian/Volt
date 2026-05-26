/**
 * NexTerm - Tab manager
 * Handles tab creation, switching, closing, and rendering
 */
import { createTerminal } from './terminal.js';
import store from '../state/store.js';

let tabCounter = 0;
const terminals = {}; // tabId -> terminal controller

/**
 * Initialize tab system
 */
export function initTabs() {
  const tabList = document.getElementById('tab-list');
  const newTabBtn = document.getElementById('new-tab-btn');
  const terminalsEl = document.getElementById('terminals');

  newTabBtn.addEventListener('click', () => createTab());

  store.subscribe('activeTabId', (tabId) => {
    renderTabs();
    switchToTab(tabId);
  });

  store.subscribe('settingsOpen', () => {
    renderTabs();
  });

  // Create first tab
  createTab();
}

/**
 * Create a new tab
 */
export async function createTab(cwd = null) {
  try {
    tabCounter++;
    const tabId = `tab-${tabCounter}`;
    const terminalsEl = document.getElementById('terminals');

    // Hide all current panes
    Object.values(terminals).forEach(t => t.hide());

    const controller = await createTerminal(tabId, terminalsEl, cwd);
    terminals[tabId] = controller;

    const tabs = store.get('tabs');
    tabs.push({
      id: tabId,
      title: `Terminal ${tabCounter}`,
    });
    store.set('tabs', tabs);
    store.set('activeTabId', tabId);

    controller.focus();
  } catch (err) {
    console.error('[NexTerm] Failed to create tab:', err);
    tabCounter--;
  }
}

/**
 * Close a tab
 */
export function closeTab(tabId) {
  const controller = terminals[tabId];
  if (!controller) return;

  controller.dispose();
  delete terminals[tabId];

  let tabs = store.get('tabs').filter(t => t.id !== tabId);
  store.set('tabs', tabs);

  if (tabs.length === 0) {
    // Create a new tab if all closed
    createTab();
  } else if (store.get('activeTabId') === tabId) {
    store.set('activeTabId', tabs[tabs.length - 1].id);
  } else {
    renderTabs();
  }
}

/**
 * Switch to a specific tab
 */
function switchToTab(tabId) {
  Object.entries(terminals).forEach(([id, controller]) => {
    if (id === tabId) {
      controller.show();
    } else {
      controller.hide();
    }
  });
}

/**
 * Switch to next tab
 */
export function nextTab() {
  const tabs = store.get('tabs');
  const currentIdx = tabs.findIndex(t => t.id === store.get('activeTabId'));
  const nextIdx = (currentIdx + 1) % tabs.length;
  store.set('activeTabId', tabs[nextIdx].id);
}

/**
 * Switch to previous tab
 */
export function prevTab() {
  const tabs = store.get('tabs');
  const currentIdx = tabs.findIndex(t => t.id === store.get('activeTabId'));
  const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
  store.set('activeTabId', tabs[prevIdx].id);
}

/**
 * Get the active terminal controller
 */
export function getActiveTerminal() {
  const activeId = store.get('activeTabId');
  return terminals[activeId] || null;
}

/**
 * Render tab bar
 */
function renderTabs() {
  const tabList = document.getElementById('tab-list');
  const tabs = store.get('tabs');
  const activeId = store.get('activeTabId');

  tabList.innerHTML = '';

  const isSettingsOpen = store.get('settingsOpen');

  tabs.forEach(tab => {
    const el = document.createElement('div');
    const isActive = tab.id === activeId && !isSettingsOpen;
    el.className = `tab${isActive ? ' active' : ''}`;
    el.innerHTML = `
      <svg class="tab-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1 10V3.5a1 1 0 011-1h2.1L5.2 1H11a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1z"
              stroke="currentColor" stroke-width="1.1"/>
      </svg>
      <span class="tab-title">${tab.title}</span>
      <button class="tab-close" data-tab-id="${tab.id}" title="Close">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    el.addEventListener('click', e => {
      if (!e.target.closest('.tab-close')) store.set('activeTabId', tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    tabList.appendChild(el);
  });
}
