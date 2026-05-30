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
  const input = document.getElementById('ai-bar-input');
  const send  = document.getElementById('ai-bar-send');

  if (!input) return;

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
    const container = document.getElementById('volt-ai-sidebar');
    const input = document.getElementById('ai-bar-input');
    const runningBar = document.getElementById('ai-running-bar');
    const resizer = document.getElementById('panel-resizer');
    
    container?.classList.toggle('hidden', !active);
    resizer?.classList.toggle('hidden', !active);

    if (active) {
      runningBar?.classList.add('hidden');
      input.value = '';
      input.focus();
    } else {
      runningBar?.classList.add('hidden');
      getActiveTerminal()?.focus();
    }
    // Refit terminal since layout changed
    setTimeout(() => getActiveTerminal()?.fit(), 100);
  });
  
  // Resizer logic
  let isResizing = false;
  const resizer = document.getElementById('panel-resizer');
  const container = document.getElementById('volt-ai-sidebar');
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

  // Initialize Sidebar Interactive Elements
  initSidebarDynamicContent();

  // ── Auto-Debug: listen for failed commands ──────────────────
  let autoDebugCooldown = false;
  document.addEventListener('command-failed', async (e) => {
    // Respect user setting to disable error intelligence
    if (store.get('liveErrorIntelligence') === false) return;

    const { exitCode } = e.detail;
    // Only auto-debug if we're not already debugging
    if (autoDebugCooldown) return;
    
    // Auto-open sidebar if closed
    if (!store.get('aiModeActive')) {
       store.set('aiModeActive', true);
    }
    
    autoDebugCooldown = true;
    setTimeout(() => { autoDebugCooldown = false; }, 10000); // 10s cooldown

    const term = getActiveTerminal();
    if (!term) return;

    const cwd = await getCwd();
    const errorOutput = term.getText();
    
    // Create UI container in response area
    const responseArea = document.getElementById('ai-response-area');
    if (!responseArea) return;
    
    const card = document.createElement('div');
    card.style.background = 'rgba(255, 0, 0, 0.05)';
    card.style.borderLeft = '3px solid #e06c75';
    card.style.padding = '12px';
    card.style.marginBottom = '16px';
    card.style.borderRadius = '0 8px 8px 0';
    card.innerHTML = `<div style="display:flex; align-items:center; gap:8px; color:#e06c75; margin-bottom:8px; font-weight:600;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Analyzing Error...
      </div>`;
    responseArea.appendChild(card);
    responseArea.scrollTop = responseArea.scrollHeight;

    const requestId = `err-${Date.now()}`;
    const query = `Exit code ${exitCode}. Please analyze the provided terminal output and return JSON.`;

    try {
      // Create a 15-second timeout promise to prevent UI hanging if API hangs
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AI Request Timeout')), 15000);
      });

      const invokePromise = invoke('ai_ask', { 
        query, 
        cwd, 
        mode: 'error_intelligence', 
        requestId, 
        terminalOutput: errorOutput.slice(-3000) 
      });

      const invokeResult = await Promise.race([invokePromise, timeoutPromise]);
      
      if (invokeResult) {
        try {
           const jsonStr = invokeResult.replace(/```json/g, '').replace(/```/g, '').trim();
           const json = JSON.parse(jsonStr);
           let causesHtml = (json.causes || []).map(c => `<li>${c}</li>`).join('');
           
           card.innerHTML = `
             <div style="color:#e06c75; font-weight:bold; margin-bottom:12px; display:flex; gap:8px; align-items:center;">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
               ${json.title || 'Error Details'}
             </div>
             ${causesHtml ? `
               <div style="font-size:12px; margin-bottom:8px; color:var(--t2);"><strong>Possible Causes:</strong></div>
               <ul style="margin:0 0 12px 16px; padding:0; font-size:12px; color:var(--t1);">
                 ${causesHtml}
               </ul>
             ` : ''}
             <div style="font-size:12px; margin-bottom:4px; color:var(--t2);"><strong>Suggested Fix:</strong></div>
             <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; font-family:monospace; font-size:11px; color:#98c379;">
               ${json.fix || 'No fix suggested'}
             </div>
           `;
           responseArea.scrollTop = responseArea.scrollHeight;
        } catch (e) {
           console.error("Failed to parse error intelligence JSON:", e, invokeResult);
           card.innerHTML = `<div style="color:var(--t1)">${invokeResult.replace(/\\n/g, '<br>')}</div>`;
        }
      } else {
        card.remove();
      }
    } catch(e) {
      console.error("Error calling ai_ask for intelligence:", e);
      // Remove card if it failed or timed out
      card.remove();
    }
  });
}

export function toggleAiMode() {
  store.set('aiModeActive', !store.get('aiModeActive'));
}

// ── Send AI query ─────────────────────────────────────────
async function sendQuery(queryOverride = null, hidden = false, modeOverride = null) {
  const input = document.getElementById('ai-bar-input');
  const query = queryOverride !== null ? queryOverride : input?.value.trim();
  if (!query) return;
  if (queryOverride === null && input) input.value = '';

  const runningBar = document.getElementById('ai-running-bar');
  const responseArea = document.getElementById('ai-response-area');
  
  if (!runningBar || !responseArea) return;

  runningBar.classList.remove('hidden');

  // Append user message
  if (!hidden) {
    const userDiv = document.createElement('div');
    userDiv.style.marginBottom = '8px';
    userDiv.innerHTML = `<strong style="color:var(--t1)">You:</strong> <span>${query.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
    responseArea.appendChild(userDiv);
  }
  
  // Create AI message container
  const aiDiv = document.createElement('div');
  aiDiv.style.marginBottom = '16px';
  const isAutoDebug = hidden && modeOverride === 'debug';
  const aiLabel = isAutoDebug 
    ? '<strong style="color:#e06c75">🔴 Auto-Debug:</strong>' 
    : '<strong style="color:var(--ac2)">Volt AI:</strong>';
  aiDiv.innerHTML = `${aiLabel} <span class="content"></span>`;
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
      .replace(/```bash\r?\n([\s\S]*?)```/g, '<code>$1</code>')
      .replace(/```(?:\w+)?\r?\n([\s\S]*?)```/g, '<code>$1</code>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--t1)">$1</strong>')
      .replace(/\n/g, '<br>');
      
    contentSpan.innerHTML = html;
    responseArea.scrollTop = responseArea.scrollHeight;
  });

  // The `ai-done` event has been completely removed in favor of purely
  // relying on the asynchronous return of `invoke('ai_ask')` below.
  // This guarantees no race conditions between Tauri events and Promise resolution.

  try {
    const cwd = await getCwd();
    let mode = modeOverride || (hidden ? 'summarize' : (store.get('aiMode') || 'command'));
    
    // Fully agentic: all visible queries route to the Agent Loop
    if (!hidden) {
      mode = 'workflow';
    }
    
    // Get terminal context
    let terminalOutput = "";
    if (term) {
      terminalOutput = term.getText();
    }
    
    // If it's a workflow, route to the real Agent Loop
    if (mode === 'workflow') {
      unlistenChunk();
      contentSpan.innerHTML = '';
      return await startAgentLoop(query, aiDiv, responseArea, term, execMode, cwd);
    }
    
    const invokeResult = await invoke('ai_ask', { query, cwd, mode, requestId, terminalOutput });
    console.log('[Volt AI] ai_ask invoke returned successfully. Result length:', invokeResult?.length);
    
    // Cleanup chunk listener
    unlistenChunk();

    // If chunks never arrived during streaming, render the full backend payload now
    if (chunksReceived === 0 && invokeResult) {
      console.log('[Volt AI] No chunks streamed! Rendering full backend payload.');
      let html = invokeResult
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/```bash\r?\n([\s\S]*?)```/g, '<code>$1</code>')
        .replace(/```(?:\w+)?\r?\n([\s\S]*?)```/g, '<code>$1</code>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--t1)">$1</strong>')
        .replace(/\n/g, '<br>');
      contentSpan.innerHTML = html;
      responseArea.scrollTop = responseArea.scrollHeight;
    }

    const finalResponse = invokeResult || fullResponse;

    let didExecute = false;

    if (!finalResponse.trim()) {
      contentSpan.innerHTML = '<span style="color:var(--e1)">No response from AI server. Check API URL/Key.</span>';
    } else {
      // Check if this is a workflow JSON response
      const workflowResult = tryParseWorkflow(finalResponse);
      if (workflowResult) {
        didExecute = true;
        
        let html = '';
        if (workflowResult.textBefore) {
          html = workflowResult.textBefore
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--t1)">$1</strong>')
            .replace(/\n/g, '<br>') + '<br><br>';
        }
        contentSpan.innerHTML = html;
        // The AI generated a static workflow instead of a command.
        // Route this into the active agent loop instead.
        unlistenChunk();
        contentSpan.innerHTML = '';
        return await startAgentLoop(query, aiDiv, responseArea, term, execMode, cwd);
      } else {
        let commands = extractCommands(finalResponse);
        
        if (commands.length > 0) {
          didExecute = true;
          const combinedCmd = commands.join(' && ');
          
          const runIt = () => {
            term.writeCommand(combinedCmd);
            
            // Auto-summarize after executing (only if it was an auto-run)
            setTimeout(() => {
              const synthQuery = `Please analyze the terminal output for the command: ${combinedCmd}. Summarize what happened in a single, easy to understand response.`;
              sendQuery(synthQuery, true);
            }, 2500);
          };
          
          if (execMode === 'autopilot') {
            runIt();
          } else if (execMode === 'agent') {
            invoke('analyze_command_risk', { command: combinedCmd }).then((risk) => {
              if (risk.requires_confirmation) {
                showConfirm(combinedCmd, risk.reason || "This command looks potentially destructive.", runIt);
              } else {
                runIt();
              }
            }).catch(() => {
              if (isDangerous(combinedCmd)) {
                showConfirm(combinedCmd, "This command looks potentially destructive.", runIt);
              } else {
                runIt();
              }
            });
          } else {
            term.injectCommand(combinedCmd);
          }
        }
      }
    }

    // Hide running bar
    runningBar.classList.add('hidden');
    
    // Crucial fix: if we executed a command, focus the terminal so the user can interact (e.g. type passwords).
    // Otherwise, keep focus in the AI bar for follow-up chatting.
    if (didExecute) {
      getActiveTerminal()?.focus();
    } else {
      if (!hidden) document.getElementById('ai-bar-input')?.focus();
    }
    
  } catch (err) {
    unlistenChunk();
    console.error('[Volt AI] ai_ask FAILED:', err);
    
    contentSpan.innerHTML = `<span style="color:var(--err)">AI Error: ${err}</span>`;
    
    runningBar?.classList.add('hidden');
    document.getElementById('ai-bar-input')?.focus();
  }
}

// ── Helpers ───────────────────────────────────────────────
function extractCommands(text) {
  const cmds = [];
  // Fenced code blocks with optional \r
  const re = /```(?:\w*)\r?\n([\s\S]*?)```/g;
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

// ── Workflow Detection (Removed) ─────────────────────────
// Volt is now fully agentic. All interactive queries route through the Agent Loop.

function tryParseWorkflow(text) {
  try {
    let jsonStr = text.trim();
    let textBefore = "";
    
    // Extract JSON from the response if wrapped in markdown
    const fenceMatch = jsonStr.match(/([\s\S]*?)```(?:json)?\r?\n([\s\S]*?)```/);
    if (fenceMatch) {
      textBefore = fenceMatch[1].trim();
      jsonStr = fenceMatch[2].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    if (parsed && parsed.plan && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return { parsed, textBefore };
    }
  } catch (e) {
    // Not a workflow JSON, that's fine
  }
  return null;
}

async function startAgentLoop(query, container, responseArea, term, execMode, cwd) {
  const STATE_ICONS = {
    queued: '○',
    running: '◔',
    completed: '✓',
    failed: '✕',
    retrying: '⟳',
  };

  // ── Agent State ──
  let agentPaused = false;
  let agentStopped = false;

  // ── Sidebar Dashboard Elements ──
  const bannerIdle = document.getElementById('agent-banner-idle');
  const bannerRunning = document.getElementById('agent-banner-running');
  const idleActions = document.getElementById('sidebar-idle-actions');
  const agentControls = document.getElementById('sidebar-agent-controls');
  const currentStepSection = document.getElementById('agent-current-step-section');
  const currentStepCard = document.getElementById('agent-current-step');
  const progressFill = document.getElementById('agent-progress-fill');
  const progressLabel = document.getElementById('agent-progress-label');
  const recentActivity = document.getElementById('agent-recent-activity');
  const activityList = document.getElementById('agent-activity-list');

  // Switch sidebar to "running" mode
  function enterAgentMode() {
    bannerIdle?.classList.add('hidden');
    bannerRunning?.classList.remove('hidden');
    idleActions?.classList.add('hidden');
    agentControls?.classList.remove('hidden');
    currentStepSection?.classList.remove('hidden');
    recentActivity?.classList.remove('hidden');
    if (activityList) activityList.innerHTML = '';
  }

  // Switch sidebar back to "idle" mode
  function exitAgentMode() {
    bannerRunning?.classList.add('hidden');
    bannerIdle?.classList.remove('hidden');
    agentControls?.classList.add('hidden');
    idleActions?.classList.remove('hidden');
  }

  // Update Current Step card in sidebar
  function updateCurrentStep(title, desc, time) {
    if (!currentStepCard) return;
    currentStepCard.querySelector('.acs-icon').textContent = '◔';
    currentStepCard.querySelector('.acs-title').textContent = title;
    currentStepCard.querySelector('.acs-desc').textContent = desc || '';
    currentStepCard.querySelector('.acs-time').textContent = time;
  }

  // Update progress bar
  function updateProgress(completed, total) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `${pct}%`;
  }

  // Add item to Recent Activity feed in sidebar
  function addActivityItem(title, state, time) {
    if (!activityList) return;
    const item = document.createElement('div');
    item.className = 'agent-activity-item';
    const iconClass = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'running';
    const iconChar = STATE_ICONS[state] || '○';
    item.innerHTML = `
      <span class="aa-icon ${iconClass}">${iconChar}</span>
      <span class="aa-title">${title}</span>
      <span class="aa-time">${time}</span>
    `;
    activityList.appendChild(item);
    activityList.scrollTop = activityList.scrollHeight;
    return item;
  }

  // Update last activity item's state
  function updateLastActivity(state, time) {
    if (!activityList) return;
    const last = activityList.lastElementChild;
    if (!last) return;
    const iconEl = last.querySelector('.aa-icon');
    if (iconEl) {
      iconEl.className = `aa-icon ${state}`;
      iconEl.textContent = STATE_ICONS[state] || '○';
    }
    const timeEl = last.querySelector('.aa-time');
    if (timeEl) timeEl.textContent = time;
  }

  // Wire Pause/Stop buttons
  const pauseBtn = document.getElementById('agent-pause-btn');
  const stopBtn = document.getElementById('agent-stop-btn');
  
  const onPause = () => {
    agentPaused = !agentPaused;
    if (pauseBtn) {
      pauseBtn.innerHTML = agentPaused 
        ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11"/></svg> Resume`
        : `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="4" height="10" rx="1"/><rect x="7" y="1" width="4" height="10" rx="1"/></svg> Pause Agent`;
    }
    if (bannerRunning) {
      const h3 = bannerRunning.querySelector('h3');
      if (h3) h3.textContent = agentPaused ? 'Agent paused' : 'Agent is running';
    }
  };
  const onStop = () => { agentStopped = true; };

  pauseBtn?.addEventListener('click', onPause);
  stopBtn?.addEventListener('click', onStop);

  // ── Build Sidebar Workflow Visualization ──
  container.innerHTML = '';
  const wfContainer = document.createElement('div');
  wfContainer.className = 'wf-container';

  const header = document.createElement('div');
  header.className = 'wf-header';
  header.innerHTML = `
    <div class="wf-header-icon">⚡</div>
    <div class="wf-header-text">
      <h4>Agent Loop</h4>
      <span>Planning and executing...</span>
    </div>
    <div class="wf-step-count">0 steps</div>
  `;
  wfContainer.appendChild(header);

  const stepsList = document.createElement('div');
  stepsList.className = 'wf-steps';
  wfContainer.appendChild(stepsList);
  container.appendChild(wfContainer);

  const headerStatus = header.querySelector('.wf-header-text span');
  const stepCount = header.querySelector('.wf-step-count');

  // Enter agent mode
  enterAgentMode();

  // Helper: add a step to the sidebar step list
  let stepCounter = 0;
  let completedSteps = 0;

  function addUiStep(title, cmd, initialState = 'running', thought = null) {
    stepCounter++;
    stepCount.textContent = `${stepCounter} steps`;

    const stepEl = document.createElement('div');
    stepEl.className = 'wf-step';
    stepEl.dataset.state = initialState;
    stepEl.id = `wf-step-${stepCounter}`;
    stepEl._startTime = Date.now();

    const thoughtHtml = thought ? `<div class="wf-step-thought" style="color:var(--t2); font-size: 0.85em; margin-bottom: 4px;">🤔 ${thought}</div>` : '';

    stepEl.innerHTML = `
      <div class="wf-state">${STATE_ICONS[initialState]}</div>
      <div class="wf-step-title">${title}</div>
      ${thoughtHtml}
      <div class="wf-step-cmd">${cmd}</div>
      <div class="wf-step-time">0.0s</div>
      <div class="wf-step-details"></div>
    `;

    stepEl.addEventListener('click', () => {
      const details = stepEl.querySelector('.wf-step-details');
      details.classList.toggle('expanded');
    });

    stepsList.appendChild(stepEl);
    responseArea.scrollTop = responseArea.scrollHeight;

    // Live timer for current step
    stepEl._timer = setInterval(() => {
      const elapsed = ((Date.now() - stepEl._startTime) / 1000).toFixed(1);
      const timeEl = stepEl.querySelector('.wf-step-time');
      if (timeEl) timeEl.textContent = `${elapsed}s`;
    }, 100);

    // Update sidebar current step
    updateCurrentStep(title, thought || cmd, '0.0s');
    addActivityItem(title, 'running', '0.0s');

    return stepEl;
  }

  function setStepState(stepEl, state, details = null) {
    // Stop timer
    if (stepEl._timer) {
      clearInterval(stepEl._timer);
      stepEl._timer = null;
    }

    const elapsed = ((Date.now() - (stepEl._startTime || Date.now())) / 1000).toFixed(1);
    stepEl.dataset.state = state;
    stepEl.querySelector('.wf-state').textContent = STATE_ICONS[state];
    const timeEl = stepEl.querySelector('.wf-step-time');
    if (timeEl) timeEl.textContent = `${elapsed}s`;

    if (state === 'completed') {
      completedSteps++;
      const stateEl = stepEl.querySelector('.wf-state');
      stateEl.style.animation = 'wf-tick-in 0.3s ease forwards';
    }

    // Update sidebar activity
    updateLastActivity(state, `${elapsed}s`);
    updateProgress(completedSteps, stepCounter);

    if (details && details.length > 0) {
      const detailsEl = stepEl.querySelector('.wf-step-details');
      detailsEl.innerHTML = '';
      details.forEach(d => {
        const line = document.createElement('div');
        line.className = 'wf-detail-line';
        if (d.file) {
          line.innerHTML = `<span class="wf-detail-file">${d.file}</span> <span class="wf-detail-action">${d.action || ''}</span>`;
        } else {
          line.innerHTML = `<span class="wf-detail-action">${d.action || d}</span>`;
        }
        detailsEl.appendChild(line);
      });
      detailsEl.classList.add('expanded');
    }
  }

  // ── Agent Loop ──
  let messages = [
    { role: 'user', content: query }
  ];
  let loopCount = 0;
  let isDone = false;

  headerStatus.innerHTML = '<span style="color:#818cf8">Agent running...</span>';

  while (!isDone && loopCount < 20) {
    // Check if stopped
    if (agentStopped) {
      headerStatus.innerHTML = '<span style="color:#ef4444">✕</span> Agent stopped';
      const summaryEl = document.createElement('div');
      summaryEl.className = 'wf-summary failed';
      summaryEl.innerHTML = `<span>✕</span> <span>Agent was stopped by user.</span>`;
      wfContainer.appendChild(summaryEl);
      break;
    }

    // Check if paused — wait until unpaused
    while (agentPaused && !agentStopped) {
      await new Promise(r => setTimeout(r, 300));
    }
    if (agentStopped) continue;

    loopCount++;
    const requestId = `req-${++requestCounter}-${Date.now()}`;

    let aiResponse = "";
    try {
      aiResponse = await invoke('ai_agent_step', {
        messages,
        cwd,
        requestId,
        terminalOutput: (loopCount === 1 && term) ? term.getText().slice(-4000) : null
      });
    } catch (e) {
      const errEl = addUiStep('Agent Error', 'Backend failure', 'failed');
      setStepState(errEl, 'failed', [{ action: e.toString() }]);
      break;
    }

    messages.push({ role: 'assistant', content: aiResponse });

    // Parse action
    let actionStr = aiResponse.trim();
    const actionMatch = aiResponse.match(/```(?:json)?\r?\n([\s\S]*?)```/);
    if (actionMatch) {
      actionStr = actionMatch[1].trim();
    } else {
      const firstBrace = aiResponse.indexOf('{');
      const lastBrace = aiResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        actionStr = aiResponse.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    let action;
    try {
      action = JSON.parse(actionStr);
    } catch (e) {
      const errEl = addUiStep('Format Error', 'Invalid response format', 'failed');
      setStepState(errEl, 'failed', [{ action: `Could not parse JSON. Error: ${e.message}\nPayload: ${actionStr.substring(0, 100)}...` }]);
      messages.push({ role: 'user', content: 'SYSTEM: You MUST respond with ONLY a valid JSON object. No other text. Fix the JSON syntax.' });
      continue;
    }

    // Execute Action
    if (action.action === 'run_command') {
      const stepEl = addUiStep(action.description || 'Running command', action.command, 'running', action.thought);
      term.writeCommand(action.command);

      let output = "";
      const exitCode = await new Promise((resolve) => {
        let captured = "";
        const onData = (e) => { captured += e.detail; };
        const onFinished = (e) => {
          setTimeout(() => {
            document.removeEventListener('terminal-data', onData);
            document.removeEventListener('command-finished', onFinished);
            output = captured;
            resolve(e.detail?.exitCode ?? 0);
          }, 150);
        };
        document.addEventListener('terminal-data', onData);
        document.addEventListener('command-finished', onFinished);
      });

      const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '').trim();

      if (exitCode !== 0) {
        setStepState(stepEl, 'failed', [{ action: `Exited with code ${exitCode}` }]);
        messages.push({
          role: 'user',
          content: `SYSTEM: Command failed with exit code ${exitCode}.\nOutput:\n${cleanOutput.slice(-3000)}`
        });
      } else {
        const details = inferStepDetails(action.command, action.description);
        setStepState(stepEl, 'completed', details);
        messages.push({
          role: 'user',
          content: `SYSTEM: Command succeeded.\nOutput:\n${cleanOutput.slice(-3000)}`
        });
      }

    } else if (action.action === 'create_file') {
      const stepEl = addUiStep(action.description || `Create ${action.path}`, `write ${action.path}`, 'running', action.thought);
      try {
        await invoke('agent_write_file', {
          cwd,
          path: action.path,
          content: action.content
        });
        setStepState(stepEl, 'completed', [{ file: action.path, action: 'created successfully' }]);
        messages.push({ role: 'user', content: `SYSTEM: File ${action.path} created successfully.` });
      } catch (e) {
        setStepState(stepEl, 'failed', [{ action: `Failed to write: ${e}` }]);
        messages.push({ role: 'user', content: `SYSTEM: Failed to create file: ${e}` });
      }

    } else if (action.action === 'read_file') {
      const stepEl = addUiStep(action.description || `Read ${action.path}`, `read ${action.path}`, 'running', action.thought);
      try {
        const output = await invoke('agent_read_file', {
          cwd,
          path: action.path
        });
        setStepState(stepEl, 'completed', [{ file: action.path, action: 'read successfully' }]);
        messages.push({ role: 'user', content: `SYSTEM: File contents of ${action.path}:\n${output.slice(-3000)}` });
      } catch (e) {
        setStepState(stepEl, 'failed', [{ action: `Failed to read: ${e}` }]);
        messages.push({ role: 'user', content: `SYSTEM: Failed to read file: ${e}` });
      }

    } else if (action.action === 'done') {
      isDone = true;
      headerStatus.innerHTML = '<span style="color:#22c55e">✓</span> Task complete';
      updateProgress(stepCounter, stepCounter);

      const summaryEl = document.createElement('div');
      summaryEl.className = 'wf-summary success';
      summaryEl.innerHTML = `<span>✓</span> <span>${action.summary || 'Task completed successfully.'}</span>`;
      wfContainer.appendChild(summaryEl);

      // Update sidebar banner to completed state
      if (bannerRunning) {
        const h3 = bannerRunning.querySelector('h3');
        const p = bannerRunning.querySelector('p');
        if (h3) h3.textContent = 'Task complete';
        if (p) p.textContent = action.summary || 'All steps finished successfully.';
      }

    } else if (action.action === 'error') {
      isDone = true;
      headerStatus.innerHTML = '<span style="color:#ef4444">✕</span> Agent aborted';

      const summaryEl = document.createElement('div');
      summaryEl.className = 'wf-summary failed';
      summaryEl.innerHTML = `<span>✕</span> <strong>${action.message || 'Task failed.'}</strong>`;
      wfContainer.appendChild(summaryEl);
    } else {
      messages.push({ role: 'user', content: `SYSTEM: Unknown action type '${action.action}'.` });
    }
  }

  if (!isDone && !agentStopped) {
    headerStatus.innerHTML = '<span style="color:#f59e0b">⚠</span> Maximum steps reached';
  }

  // Cleanup
  pauseBtn?.removeEventListener('click', onPause);
  stopBtn?.removeEventListener('click', onStop);
  exitAgentMode();

  const runningBar = document.getElementById('ai-running-bar');
  if (runningBar) runningBar.classList.add('hidden');
  document.getElementById('ai-bar-input')?.focus();
}

/**
 * Infer human-readable details from a command for the expandable sub-task view.
 */
function inferStepDetails(command, description) {
  const details = [];
  const cmd = command.toLowerCase();

  // File creation patterns
  const touchMatch = command.match(/touch\s+(.+)/);
  if (touchMatch) {
    touchMatch[1].split(/\s+/).forEach(f => details.push({ file: f, action: 'created' }));
  }

  const mkdirMatch = command.match(/mkdir\s+(?:-p\s+)?(.+)/);
  if (mkdirMatch) {
    mkdirMatch[1].split(/\s+/).forEach(d => details.push({ file: d + '/', action: 'directory created' }));
  }

  // Package management
  if (cmd.includes('npm install') || cmd.includes('npm i ') || cmd.includes('yarn add') || cmd.includes('pnpm add')) {
    const pkgs = command.replace(/^.*?(install|add)\s+/i, '').split(/\s+/).filter(p => !p.startsWith('-'));
    pkgs.forEach(p => details.push({ action: `installed ${p}` }));
    if (details.length === 0) details.push({ action: 'installed dependencies' });
  }

  if (cmd.includes('npm init') || cmd.includes('npx create')) {
    details.push({ action: 'initialized project' });
    details.push({ file: 'package.json', action: 'created' });
  }

  // Git
  if (cmd.includes('git init')) {
    details.push({ file: '.git/', action: 'repository initialized' });
  }
  if (cmd.includes('git clone')) {
    details.push({ action: 'cloned repository' });
  }

  // Prisma / DB
  if (cmd.includes('prisma')) {
    if (cmd.includes('init')) details.push({ file: 'prisma/schema.prisma', action: 'created' });
    if (cmd.includes('migrate')) details.push({ action: 'ran database migration' });
    if (cmd.includes('generate')) details.push({ action: 'generated Prisma client' });
  }

  // Docker
  if (cmd.includes('docker')) {
    if (cmd.includes('compose up')) details.push({ action: 'started containers' });
    if (cmd.includes('build')) details.push({ action: 'built image' });
  }

  // Fallback: use description
  if (details.length === 0) {
    details.push({ action: description || `executed ${command.split(' ')[0]}` });
  }

  return details;
}

function initSidebarDynamicContent() {
  const input = document.getElementById('ai-bar-input');
  if (!input) return;

  // 1. Quick Actions wiring
  const qaActions = {
    'qa-run-cmd': 'Write a command to ',
    'qa-explain-err': 'Explain the recent error in the terminal output.',
    'qa-search-docs': 'Search documentation for ',
    'qa-optimize': 'Optimize the code shown in the terminal output.'
  };

  for (const [id, promptText] of Object.entries(qaActions)) {
    document.getElementById(id)?.addEventListener('click', () => {
      input.value = promptText;
      input.focus();
      if (!promptText.endsWith(' ')) {
        // We need to trigger sendQuery, but since sendQuery reads from the input,
        // and is inside the module scope, we can simulate an enter keypress or just leave it for the user to press enter.
        // Actually, since this is simple, let's just dispatch an enter event.
        input.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'Enter' }));
      }
    });
  }

  // The `ai-done` event was removed.
}

