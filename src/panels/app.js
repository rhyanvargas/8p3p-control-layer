/**
 * 8P3P Inspection Panels — Shared API client and tab orchestration
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-004)
 */

(function () {
  'use strict';

  const STORAGE_KEY = '8p3p_inspect_api_key';

  /** API client */
  const API = {
    async fetch(path, params = {}) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('API key required. Enter key in the controls bar.');
      }
      const qs = new URLSearchParams(params).toString();
      const url = path + (qs ? '?' + qs : '');
      const res = await fetch(url, {
        headers: { 'x-api-key': apiKey },
      });
      if (!res.ok) {
        const body = await res.text();
        let errBody;
        try {
          errBody = JSON.parse(body);
        } catch {
          errBody = { code: 'http_error', message: body || res.statusText };
        }
        const err = new Error(errBody.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = errBody.code;
        throw err;
      }
      return res.json();
    },

    getOrgId() {
      const el = document.getElementById('org-id');
      const val = el ? el.value.trim() : '';
      if (!val) {
        throw new Error('Org ID required. Enter org_id in the controls bar.');
      }
      return val;
    },

    getApiKey() {
      const el = document.getElementById('api-key');
      return el ? el.value.trim() : '';
    },

    persistApiKey() {
      const key = this.getApiKey();
      if (key) {
        try {
          sessionStorage.setItem(STORAGE_KEY, key);
        } catch { /* ignore */ }
      }
    },

    restoreApiKey() {
      try {
        const key = sessionStorage.getItem(STORAGE_KEY);
        if (key) {
          const el = document.getElementById('api-key');
          if (el) el.value = key;
        }
      } catch { /* ignore */ }
    },
  };

  /** Tab orchestration */
  const Tabs = {
    panels: ['signal', 'state', 'decisions', 'trace'],
    hashMap: { signal: 'signal', state: 'state', decisions: 'decisions', trace: 'trace' },

    init() {
      API.restoreApiKey();
      document.getElementById('api-key')?.addEventListener('blur', () => API.persistApiKey());

      document.querySelectorAll('.tabs button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const panelId = btn.getAttribute('data-panel');
          if (panelId) this.switchTo(panelId);
        });
      });

      window.addEventListener('hashchange', () => this.syncFromHash());
      this.syncFromHash();

      document.getElementById('btn-refresh')?.addEventListener('click', () => {
        const active = document.querySelector('.panel.active');
        if (active) {
          const id = active.getAttribute('data-panel-id');
          const panel = window.Panels?.[id];
          if (panel && typeof panel.refresh === 'function') panel.refresh();
        }
      });

      const autoPoll = document.getElementById('auto-poll');
      const pollInterval = document.getElementById('poll-interval');
      if (autoPoll && pollInterval) {
        autoPoll.addEventListener('change', () => {
          if (autoPoll.checked) {
            const ms = parseInt(pollInterval.value, 10);
            this.startPolling(() => {
              const active = document.querySelector('.panel.active');
              if (active) {
                const id = active.getAttribute('data-panel-id');
                const panel = window.Panels?.[id];
                if (panel && typeof panel.refresh === 'function') panel.refresh();
              }
            }, ms);
          } else {
            this.stopPolling();
          }
        });
        pollInterval.addEventListener('change', () => {
          if (autoPoll.checked) {
            this.stopPolling();
            this.startPolling(() => {
              const active = document.querySelector('.panel.active');
              if (active) {
                const id = active.getAttribute('data-panel-id');
                const panel = window.Panels?.[id];
                if (panel && typeof panel.refresh === 'function') panel.refresh();
              }
            }, parseInt(pollInterval.value, 10));
          }
        });
      }
    },

    switchTo(panelId) {
      const hash = this.hashMap[panelId] || panelId;
      window.location.hash = hash;
      this.showPanel(panelId);
    },

    showPanel(panelId) {
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));

      const panelEl = document.getElementById('panel-' + panelId);
      const tabBtn = document.querySelector(`.tabs button[data-panel="${panelId}"]`);
      if (panelEl) panelEl.classList.add('active');
      if (tabBtn) tabBtn.classList.add('active');

      const panel = window.Panels?.[panelId];
      if (panel && typeof panel.refresh === 'function') panel.refresh();
    },

    syncFromHash() {
      const hash = (window.location.hash || '#signal').slice(1).toLowerCase();
      const panelId = hash === 'trace' ? 'trace' : hash === 'state' ? 'state' : hash === 'decisions' ? 'decisions' : 'signal';
      this.showPanel(panelId);
    },

    _pollTimer: null,
    startPolling(fn, intervalMs) {
      this.stopPolling();
      this._pollTimer = setInterval(fn, intervalMs);
    },
    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },
  };

  /** UI helpers */
  const UI = {
    showError(container, message) {
      if (!container) return;
      container.innerHTML = '<div class="error-state">' + this.escapeHtml(String(message)) + '</div>';
    },

    showLoading(container) {
      if (!container) return;
      container.innerHTML = '<div class="loading">Loading…</div>';
    },

    hideLoading(container) {
      const loading = container?.querySelector('.loading');
      if (loading) loading.remove();
    },

    formatTime(isoString) {
      if (!isoString) return '—';
      try {
        const d = new Date(isoString);
        return d.toTimeString().slice(0, 8);
      } catch {
        return String(isoString);
      }
    },

    relativeTime(isoString) {
      if (!isoString) return '—';
      try {
        const d = new Date(isoString);
        const now = Date.now();
        const sec = Math.floor((now - d.getTime()) / 1000);
        if (sec < 60) return sec + 's ago';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        return Math.floor(sec / 86400) + 'd ago';
      } catch {
        return String(isoString);
      }
    },

    escapeHtml(str) {
      if (str == null) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    },
  };

  /** Decision context for Panel 4 (set by Panel 3 row click) */
  let selectedDecision = null;

  window.API = API;
  window.Tabs = Tabs;
  window.UI = UI;
  window.Panels = {};
  window.setSelectedDecision = (d) => { selectedDecision = d; };
  window.getSelectedDecision = () => selectedDecision;

  document.addEventListener('DOMContentLoaded', () => Tabs.init());
})();
