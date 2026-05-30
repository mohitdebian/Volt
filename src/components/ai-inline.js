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
  document.addEventListener('command-failed', (e) => {
    const { exitCode } = e.detail;
    // Only auto-debug if AI panel is open and we're not already debugging
    if (!store.get('aiModeActive') || autoDebugCooldown) return;
    
    autoDebugCooldown = true;
    setTimeout(() => { autoDebugCooldown = false; }, 5000); // 5s cooldown

    const term = getActiveTerminal();
    if (!term) return;

    // Grab recent terminal output for error context
    const errorOutput = term.getText();
    const debugQuery = `The last command failed with exit code ${exitCode}. Here is the recent terminal output. Explain the error and suggest a fix.`;
    
    // Send as a hidden debug query
    sendQuery(debugQuery, true, 'debug');
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

  const bar = document.getElementById('ai-bar');
  const runningBar = document.getElementById('ai-running-bar');
  const responseArea = document.getElementById('ai-response-area');
  
  if (!bar || !runningBar || !responseArea) return;

  bar.classList.add('hidden');
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
    
    // Auto-detect workflow-type prompts
    if (!modeOverride && !hidden && isWorkflowQuery(query)) {
      mode = 'workflow';
    }
    
    // Get terminal context
    let terminalOutput = "";
    if (term) {
      terminalOutput = term.getText();
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
        
        executeWorkflow(workflowResult.parsed, aiDiv, responseArea, term, execMode);
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

    // Hide running bar and restore input
    runningBar.classList.add('hidden');
    bar.classList.remove('hidden');
    
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
    
    contentSpan.innerHTML = `<span style="color:var(--e1)">AI Error: ${err}</span>`;
    
    runningBar?.classList.add('hidden');
    bar?.classList.remove('hidden');
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

// ── Workflow Detection ────────────────────────────────────
const WORKFLOW_KEYWORDS = [
  'set up', 'setup', 'create a project', 'create a new', 'scaffold',
  'install and configure', 'build me', 'initialize', 'init a',
  'deploy', 'migrate', 'bootstrap', 'configure a', 'set me up',
  'create a', 'build a', 'make a', 'generate a', 'start a', 'project', 'app', 'website',
];

function isWorkflowQuery(query) {
  const lower = query.toLowerCase();
  return WORKFLOW_KEYWORDS.some(kw => lower.includes(kw));
}

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

async function executeWorkflow(plan, container, responseArea, term, execMode) {
  const totalSteps = plan.steps.length;
  
  // Render plan header
  container.innerHTML = `
    <strong style="color:#98c379">📋 Workflow:</strong> ${plan.plan}
    <span style="color:var(--t3);font-size:0.85em">(${totalSteps} steps)</span>
    <div class="workflow-steps" style="margin-top:8px"></div>
  `;
  const stepsContainer = container.querySelector('.workflow-steps');
  
  // Render all steps as pending
  for (const step of plan.steps) {
    const stepEl = document.createElement('div');
    stepEl.id = `workflow-step-${step.step}`;
    stepEl.style.cssText = 'padding:4px 0;color:var(--t3);font-size:0.9em;border-left:2px solid var(--b3);padding-left:8px;margin:4px 0;';
    stepEl.innerHTML = `⏳ <strong>Step ${step.step}/${totalSteps}:</strong> ${step.description} <code style="font-size:0.85em;color:var(--t3)">${step.command}</code>`;
    stepsContainer.appendChild(stepEl);
  }
  responseArea.scrollTop = responseArea.scrollHeight;

  // Execute steps sequentially
  for (const step of plan.steps) {
    const stepEl = document.getElementById(`workflow-step-${step.step}`);
    
    // Mark as running
    stepEl.style.borderLeftColor = '#61afef';
    stepEl.style.color = 'var(--t1)';
    stepEl.innerHTML = `⏳ <strong>Step ${step.step}/${totalSteps}:</strong> ${step.description} <code style="font-size:0.85em">${step.command}</code> <span style="color:#61afef">(running...)</span>`;
    responseArea.scrollTop = responseArea.scrollHeight;

    // Check if dangerous
    if (execMode === 'agent') {
      let dangerous = false;
      let reason = `Workflow step ${step.step}: This command looks potentially destructive.`;
      try {
        const risk = await invoke('analyze_command_risk', { command: step.command });
        dangerous = risk.requires_confirmation;
        if (risk.reason) reason = `Workflow step ${step.step}: ${risk.reason}`;
      } catch (e) {
        dangerous = isDangerous(step.command);
      }

      if (dangerous) {
        await new Promise((resolve) => {
          showConfirm(step.command, reason, () => {
            term.writeCommand(step.command);
            resolve();
          });
        });
      } else {
        term.writeCommand(step.command);
      }
    } else if (execMode !== 'ask') {
      term.writeCommand(step.command);
    } else {
      term.injectCommand(step.command);
    }

    // Wait for the command to finish using the OSC 133 shell integration event
    if (execMode !== 'ask') {
      await new Promise((resolve) => {
        const onFinished = () => {
          document.removeEventListener('command-finished', onFinished);
          resolve();
        };
        document.addEventListener('command-finished', onFinished);
      });
    } else {
      await new Promise(r => setTimeout(r, 100)); // Just a small tick if we're only injecting
    }

    // Mark as completed
    stepEl.style.borderLeftColor = '#98c379';
    stepEl.innerHTML = `✅ <strong>Step ${step.step}/${totalSteps}:</strong> ${step.description} <code style="font-size:0.85em">${step.command}</code>`;
    responseArea.scrollTop = responseArea.scrollHeight;
  }

  // Final summary
  const summaryEl = document.createElement('div');
  summaryEl.style.cssText = 'margin-top:8px;padding:6px 10px;background:rgba(152,195,121,0.1);border-radius:4px;color:#98c379;font-size:0.9em;';
  summaryEl.innerHTML = `✅ <strong>All ${totalSteps} steps completed successfully.</strong>`;
  stepsContainer.appendChild(summaryEl);
  responseArea.scrollTop = responseArea.scrollHeight;

  // Auto-summarize workflow result
  if (execMode !== 'ask' && plan.steps.length > 0) {
    setTimeout(() => {
      const lastCmd = plan.steps[plan.steps.length - 1].command;
      const synthQuery = `The workflow "${plan.plan}" just finished. Please briefly analyze the terminal output for the final step: ${lastCmd}. Provide a concise 1-2 sentence summary of the final state or output.`;
      sendQuery(synthQuery, true);
    }, 2500);
  }
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

  // 2. Recent Commands Wiring
  renderRecentCommands();

  // Listen for custom command execution events to update recent commands
  document.addEventListener('command-finished', (e) => {
    // If the event payload contained the command, we'd add it.
    // For now we'll hook into where we actually inject/write commands inside ai-inline.js
  });
}

export function addRecentCommand(cmd) {
  if (!cmd || cmd.trim() === '') return;
  let recents = JSON.parse(localStorage.getItem('volt_recent_commands') || '[]');
  
  // Remove if it exists to put it at the top
  recents = recents.filter(c => c.cmd !== cmd);
  
  recents.unshift({ cmd, time: Date.now() });
  if (recents.length > 5) recents.pop();
  
  localStorage.setItem('volt_recent_commands', JSON.stringify(recents));
  renderRecentCommands();
}

function renderRecentCommands() {
  const listEl = document.getElementById('rc-command-list');
  if (!listEl) return;
  
  let recents = JSON.parse(localStorage.getItem('volt_recent_commands') || '[]');
  
  if (recents.length === 0) {
    // Show some defaults for onboarding
    recents = [
      { cmd: 'git status', time: Date.now() - 300000 },
      { cmd: 'npm run dev', time: Date.now() - 800000 },
      { cmd: 'docker compose up -d', time: Date.now() - 1200000 },
      { cmd: 'ls -la', time: Date.now() - 900000 },
      { cmd: 'git log --oneline', time: Date.now() - 3600000 },
    ];
  }
  
  listEl.innerHTML = '';
  recents.forEach(item => {
    const elapsed = Date.now() - item.time;
    let timeStr = 'just now';
    if (elapsed > 3600000) timeStr = Math.floor(elapsed/3600000) + 'h ago';
    else if (elapsed > 60000) timeStr = Math.floor(elapsed/60000) + 'm ago';
    
    const div = document.createElement('div');
    div.className = 'rc-item';
    div.style.cursor = 'pointer';
    div.innerHTML = `<span class="rc-arrow">❯</span> <span class="rc-cmd">${item.cmd}</span> <span class="rc-time">${timeStr}</span>`;
    
    // Hover effects
    div.addEventListener('mouseenter', () => div.style.color = 'var(--t1)');
    div.addEventListener('mouseleave', () => div.style.color = '');
    
    div.addEventListener('click', () => {
      // Find the active terminal and inject the command
      const term = getActiveTerminal();
      if (term) term.injectCommand(item.cmd);
    });
    
    listEl.appendChild(div);
  });
}
