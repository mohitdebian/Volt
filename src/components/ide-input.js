import { invoke } from '@tauri-apps/api/core';
import { getActiveTerminal } from '../terminal/tabs.js';

export function initIdeInput() {
  const bar = document.getElementById('ide-input-bar');
  const input = document.getElementById('ide-input');
  const ghostText = document.getElementById('ide-ghost-text');
  
  let currentSuggestion = '';

  // Focus stealing prevention logic
  // We want the ide-input to be focused if it is visible
  document.addEventListener('click', (e) => {
    if (!bar.classList.contains('hidden') && !e.target.closest('#ai-bar')) {
      input.focus();
    }
  });

  input.addEventListener('input', async () => {
    const val = input.value;
    
    // Create leading space in ghost text so it aligns perfectly over the real text
    // The real text is colored, the ghost text uses invisible padding for the typed part
    if (!val) {
      ghostText.innerHTML = '';
      currentSuggestion = '';
      return;
    }

    try {
      const term = getActiveTerminal();
      const cwd = term ? term.cwd : '';
      const suggestion = await invoke('suggest_command', {
        projectPath: cwd,
        partialCmd: val
      });

      if (suggestion && suggestion.startsWith(val) && suggestion !== val) {
        currentSuggestion = suggestion;
        const remainder = suggestion.substring(val.length);
        // Use a span with visibility: hidden for the typed part so the remainder perfectly aligns
        ghostText.innerHTML = `<span style="visibility: hidden">${escapeHtml(val)}</span>${escapeHtml(remainder)}`;
      } else {
        ghostText.innerHTML = '';
        currentSuggestion = '';
      }
    } catch (e) {
      console.error('[Volt] Autocomplete error:', e);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.value;
      const term = getActiveTerminal();
      if (term && cmd) {
        term.writeCommand(cmd);
        
        // Hide the input bar, the command is executing
        bar.classList.add('hidden');
        input.value = '';
        ghostText.innerHTML = '';
        currentSuggestion = '';
        term.focus();
      }
    }

    if ((e.key === 'ArrowRight' || e.key === 'Tab') && currentSuggestion) {
      e.preventDefault();
      input.value = currentSuggestion;
      ghostText.innerHTML = '';
      currentSuggestion = '';
    }
  });

  // Listen to OSC 133 D markers globally (we added this in terminal.js)
  document.addEventListener('command-finished', () => {
    // Command finished, shell is back at prompt! Show IDE input again.
    const term = getActiveTerminal();
    // Only show if we are NOT in the alternate screen buffer (like vim)
    if (term && term.buffer.active.type !== 'alternate') {
      // IDE input bar is disabled based on user preference
      // bar.classList.remove('hidden');
      // input.focus();
    }
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
