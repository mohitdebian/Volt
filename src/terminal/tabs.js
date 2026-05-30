/**
 * NexTerm - Tab manager
 * Handles tab creation, switching, closing, and rendering
 */
import { createTerminal } from './terminal.js';
import store from '../state/store.js';

let tabCounter = 0;
let paneCounter = 0;
const tabsData = {}; // tabId -> { container: HTMLElement, activePaneId: string, panes: { paneId: controller } }

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
    paneCounter++;
    const tabId = `tab-${tabCounter}`;
    const paneId = `pane-${paneCounter}`;
    const terminalsEl = document.getElementById('terminals');

    // Hide all current tab containers
    Object.values(tabsData).forEach(t => { t.container.style.display = 'none'; });

    // Create container for this tab
    const container = document.createElement('div');
    container.id = `container-${tabId}`;
    container.className = 'tab-container';
    container.style.display = 'flex';
    container.style.flexDirection = 'row';
    container.style.height = '100%';
    container.style.width = '100%';
    terminalsEl.appendChild(container);

    const controller = await createTerminal(paneId, container, cwd);
    
    tabsData[tabId] = {
      container,
      activePaneId: paneId,
      panes: { [paneId]: controller }
    };

    const tabs = store.get('tabs');
    tabs.push({ id: tabId, title: `Terminal ${tabCounter}` });
    store.set('tabs', tabs);
    store.set('activeTabId', tabId);

    controller.focus();
    
    // Ensure IDE input is visible and focused
    const bar = document.getElementById('ide-input-bar');
    const input = document.getElementById('ide-input');
    if (bar && input) {
      // bar.classList.remove('hidden');
      // input.focus();
    }
  } catch (err) {
    console.error('[NexTerm] Failed to create tab:', err);
    tabCounter--;
  }
}

/**
 * Split the active pane
 */
export async function splitPane(direction = 'row') {
  try {
    const tabId = store.get('activeTabId');
    const tab = tabsData[tabId];
    if (!tab) return;

    paneCounter++;
    const paneId = `pane-${paneCounter}`;
    const activeController = tab.panes[tab.activePaneId];
    
    tab.container.style.flexDirection = direction;
    
    const controller = await createTerminal(paneId, tab.container, activeController ? activeController.cwd : null);
    tab.panes[paneId] = controller;
    tab.activePaneId = paneId;

    // Add border to active controllers for visual separation
    Object.values(tab.panes).forEach(p => {
      p.pane.style.borderRight = direction === 'row' ? '1px solid var(--br)' : 'none';
      p.pane.style.borderBottom = direction === 'column' ? '1px solid var(--br)' : 'none';
    });
    
    controller.focus();
    
    // Fit all panes in the tab
    Object.values(tab.panes).forEach(p => p.fit());
    
    // Ensure IDE input is visible and focused
    const bar = document.getElementById('ide-input-bar');
    const input = document.getElementById('ide-input');
    if (bar && input) {
      // bar.classList.remove('hidden');
      // input.focus();
    }
  } catch (err) {
    console.error('[NexTerm] Failed to split pane:', err);
  }
}

/**
 * Close a tab
 */
export function closeTab(tabId) {
  const tab = tabsData[tabId];
  if (!tab) return;

  // Dispose all panes
  Object.values(tab.panes).forEach(p => p.dispose());
  tab.container.remove();
  delete tabsData[tabId];

  let tabs = store.get('tabs').filter(t => t.id !== tabId);
  store.set('tabs', tabs);

  if (tabs.length === 0) {
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
  Object.entries(tabsData).forEach(([id, tab]) => {
    if (id === tabId) {
      tab.container.style.display = 'flex';
      Object.values(tab.panes).forEach(p => p.show());
    } else {
      tab.container.style.display = 'none';
      Object.values(tab.panes).forEach(p => p.hide());
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
  const tab = tabsData[activeId];
  if (!tab) return null;
  return tab.panes[tab.activePaneId] || null;
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
      <div class="tab-dot"></div>
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
