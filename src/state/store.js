/**
 * NexTerm - Lightweight reactive state store
 * Simple pub/sub pattern, no framework overhead
 */
const store = {
  _state: {
    tabs: [],
    activeTabId: null,
    aiSidebarOpen: false,
    aiMode: 'command',
    settingsOpen: false,
    commandPaletteOpen: false,
    systemStatus: { ram_usage_mb: 0, gpu_available: false, gpu_name: null },
    nimConfig: {
      api_key: '',
      base_url: 'https://integrate.api.nvidia.com/v1',
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.3,
      max_tokens: 2048,
    },
    fontSize: 14,
  },

  _listeners: {},

  get(key) {
    return this._state[key];
  },

  set(key, value) {
    this._state[key] = value;
    this._notify(key, value);
  },

  subscribe(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
    return () => {
      this._listeners[key] = this._listeners[key].filter(cb => cb !== callback);
    };
  },

  _notify(key, value) {
    if (this._listeners[key]) {
      this._listeners[key].forEach(cb => cb(value));
    }
  },
};

export default store;
