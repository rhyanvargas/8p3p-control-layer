/**
 * 8P3P Inspection Panels — Panel 2: State Viewer
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-006)
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'panel-state';
  const CANONICAL_FIELDS = ['stabilityScore', 'masteryScore', 'confidenceInterval', 'riskSignal', 'timeSinceReinforcement'];

  let learnersNextCursor = null;
  let learnersList = [];
  let selectedLearner = null;
  let maxVersion = 1;

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  function renderLearnerList(learners) {
    const esc = window.UI.escapeHtml;
    const rel = window.UI.relativeTime;

    let html = '<div class="learner-list">';
    for (const l of learners) {
      const cls = selectedLearner === l.learner_reference ? 'learner-list-item selected' : 'learner-list-item';
      html += `<div class="${cls}" data-learner="${esc(l.learner_reference)}">`;
      html += esc(l.learner_reference) + ' &nbsp; v' + l.state_version + ' &nbsp; ' + rel(l.updated_at);
      html += '</div>';
    }
    html += '</div>';

    if (learnersNextCursor) {
      html += '<button type="button" id="btn-load-more-learners" style="margin-top:8px">Load more learners</button>';
    }

    return html;
  }

  function renderStateDetail(state) {
    if (!state) {
      return '<div class="empty-state">Select a learner from the list.</div>';
    }

    const esc = window.UI.escapeHtml;
    const stateObj = state.state || {};
    const prov = state.provenance || {};

    let html = `
      <div class="state-detail">
        <h3>STATE: ${esc(state.learner_reference)} (v${state.state_version})</h3>
        <p>state_id: ${esc(state.state_id || '—')}</p>
        <p>state_version: ${state.state_version}</p>
        <p>updated_at: ${esc(state.updated_at || '—')}</p>

        <h4>Canonical Fields</h4>
        <div class="canonical-fields">
    `;

    for (const f of CANONICAL_FIELDS) {
      const val = stateObj[f];
      const present = val !== undefined && val !== null;
      const cls = present ? 'canonical-field present' : 'canonical-field missing';
      html += `<div class="${cls}">${esc(f)}: ${present ? esc(String(val)) : '—'}</div>`;
    }
    html += '</div>';

    html += `
        <h4>Provenance</h4>
        <p>last_signal: ${esc(prov.last_signal_id || '—')}</p>
        <p>signal_time: ${esc(prov.last_signal_timestamp || '—')}</p>

        <h4>Full State (JSON)</h4>
        <div class="json-section">
          <div class="json-section-header" data-toggle="state-json">
            <span>Toggle</span>
            <button type="button" class="btn-copy" data-copy="state-json">Copy</button>
          </div>
          <pre class="json-section-content collapsed" id="state-json">${esc(JSON.stringify(stateObj, null, 2))}</pre>
        </div>

        <h4>Version</h4>
        <div class="version-buttons" id="version-buttons"></div>
      </div>
    `;

    return html;
  }

  function renderVersionButtons(activeVersion) {
    const container = document.getElementById('version-buttons');
    if (!container) return;

    let html = '';
    for (let v = 1; v <= maxVersion; v++) {
      const cls = v === activeVersion ? 'active' : '';
      html += `<button type="button" class="${cls}" data-version="${v}">v${v}</button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ver = parseInt(btn.getAttribute('data-version'), 10);
        loadStateForVersion(ver);
      });
    });
  }

  async function loadStateForVersion(version) {
    if (!selectedLearner) return;
    const container = getContainer();
    const masterDetail = container?.querySelector('.master-detail');
    const rightPane = masterDetail?.querySelector('.state-detail') || masterDetail?.children?.[1];
    if (!rightPane) return;

    try {
      const org = window.API.getOrgId();
      const params = { org_id: org, learner_reference: selectedLearner, version };

      const state = await window.API.fetch('/v1/state', params);
      maxVersion = Math.max(maxVersion, state.state_version || version || 1);
      rightPane.innerHTML = renderStateDetail(state);
      renderVersionButtons(state.state_version || version);
      bindJsonToggles(container);
    } catch (err) {
      rightPane.innerHTML = '<div class="error-state">' + window.UI.escapeHtml(err.message) + '</div>';
    }
  }

  function bindJsonToggles(container) {
    container?.querySelectorAll('.json-section-header').forEach((h) => {
      const toggleId = h.getAttribute('data-toggle');
      const content = document.getElementById(toggleId);
      if (!content) return;
      h.addEventListener('click', () => {
        content.classList.toggle('collapsed');
      });
    });
    container?.querySelectorAll('.btn-copy[data-copy]').forEach((btn) => {
      const id = btn.getAttribute('data-copy');
      const content = document.getElementById(id);
      if (!content) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(content.textContent);
      });
    });
  }

  async function loadState(learnerRef) {
    selectedLearner = learnerRef;
    const container = getContainer();

    const detailEl = container?.querySelector('.state-detail');
    if (detailEl) detailEl.innerHTML = '<div class="loading">Loading…</div>';

    try {
      const org = window.API.getOrgId();
      const state = await window.API.fetch('/v1/state', {
        org_id: org,
        learner_reference: learnerRef,
      });

      maxVersion = state.state_version || 1;
      const masterDetail = container?.querySelector('.master-detail');
      if (masterDetail) {
        const right = masterDetail.querySelector('.state-detail') || masterDetail.children[1];
        if (right) {
          right.innerHTML = renderStateDetail(state);
          renderVersionButtons(state.state_version);
          bindJsonToggles(container);
        }
      }

      container?.querySelectorAll('.learner-list-item').forEach((el) => {
        el.classList.toggle('selected', el.getAttribute('data-learner') === learnerRef);
      });
    } catch (err) {
      const right = container?.querySelector('.master-detail')?.children[1];
      if (right) right.innerHTML = '<div class="error-state">' + window.UI.escapeHtml(err.message) + '</div>';
    }
  }

  async function loadLearners() {
    const org = window.API.getOrgId();
    const res = await window.API.fetch('/v1/state/list', { org_id: org, limit: 50 });
    learnersList = res.learners || [];
    learnersNextCursor = res.next_cursor;
    return learnersList;
  }

  async function loadMoreLearners() {
    if (!learnersNextCursor) return;
    const org = window.API.getOrgId();
    const res = await window.API.fetch('/v1/state/list', {
      org_id: org,
      limit: 50,
      cursor: learnersNextCursor,
    });
    learnersList = learnersList.concat(res.learners || []);
    learnersNextCursor = res.next_cursor;
    const container = getContainer();
    const masterDetail = container?.querySelector('.master-detail');
    const left = masterDetail?.children[0];
    if (left) {
      left.innerHTML = renderLearnerList(learnersList);
      if (learnersNextCursor) {
        left.innerHTML += '<button type="button" id="btn-load-more-learners" style="margin-top:8px">Load more learners</button>';
      }
      bindLearnerListClicks(container);
      document.getElementById('btn-load-more-learners')?.addEventListener('click', loadMoreLearners);
    }
  }

  function bindLearnerListClicks(container) {
    container?.querySelectorAll('.learner-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        const learner = el.getAttribute('data-learner');
        if (learner) loadState(learner);
      });
    });
  }

  async function refresh() {
    const container = getContainer();
    if (!container) return;

    try {
      window.UI.showLoading(container);

      const learners = await loadLearners();

      let rightHtml = '<div class="empty-state">Select a learner from the list.</div>';
      if (selectedLearner && learners.some((l) => l.learner_reference === selectedLearner)) {
        const org = window.API.getOrgId();
        const state = await window.API.fetch('/v1/state', {
          org_id: org,
          learner_reference: selectedLearner,
        });
        maxVersion = state.state_version || 1;
        rightHtml = renderStateDetail(state);
      }

      container.innerHTML = `
        <h2>STATE VIEWER</h2>
        <div class="master-detail">
          <div>${renderLearnerList(learners)}</div>
          <div class="state-detail">${rightHtml}</div>
        </div>
      `;

      bindLearnerListClicks(container);
      document.getElementById('btn-load-more-learners')?.addEventListener('click', loadMoreLearners);

      if (selectedLearner) {
        const stateEl = container.querySelector('.state-detail');
        if (stateEl && !stateEl.querySelector('.empty-state')) {
          renderVersionButtons(maxVersion);
          bindJsonToggles(container);
        }
      }
    } catch (err) {
      window.UI.showError(container, err.message || 'Failed to load state data');
    }
  }

  window.Panels.state = { refresh };
})();
