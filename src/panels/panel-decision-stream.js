/**
 * 8P3P Inspection Panels — Panel 3: Decision Stream
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-007)
 *
 * Data source: GET /v1/receipts (compliance/audit projection). Same query params as
 * GET /v1/decisions; receipts omit decision_context and output_metadata. Pri column
 * shows "—" because receipts do not include priority.
 * Note: learner_reference is required for the API; when empty, panel shows prompt.
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'panel-decisions';

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  var DECISION_TOOLTIPS = {
    escalate:  'Escalate — highest priority; immediate intervention required',
    pause:     'Pause — halt progression until conditions improve',
    reinforce: 'Reinforce — repeat or strengthen current learning path',
    advance:   'Advance — learner is ready to move forward',
    intervene: 'Intervene — targeted corrective action needed',
    reroute:   'Reroute — redirect to an alternate learning path',
    recommend: 'Recommend — suggest supplemental activity',
  };

  function decisionTooltip(type) {
    if (!type) return '';
    return DECISION_TOOLTIPS[type.toLowerCase()] || type;
  }

  function decisionClass(type) {
    if (!type) return '';
    const t = (type + '').toLowerCase();
    if (['escalate'].includes(t)) return 'decision-escalate';
    if (['pause'].includes(t)) return 'decision-pause';
    if (['reinforce'].includes(t)) return 'decision-reinforce';
    if (['advance', 'recommend'].includes(t)) return 'decision-advance';
    if (['intervene', 'reroute'].includes(t)) return 'decision-intervene';
    return 'decision-reinforce';
  }

  function encodeDecision(receipt, learnerRef) {
    return encodeURIComponent(JSON.stringify({ ...receipt, learner_reference: learnerRef }));
  }

  function decodeDecision(encoded) {
    if (!encoded) return null;
    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch {
      return null;
    }
  }

  async function refresh() {
    const container = getContainer();
    if (!container) return;

    const learnerEl = document.getElementById('decisions-learner');
    const fromEl = document.getElementById('decisions-from');
    const toEl = document.getElementById('decisions-to');

    const learner = learnerEl?.value?.trim() || '';
    const orgDisplay = (document.getElementById('org-id')?.value?.trim()) || '—';
    if (!learner) {
      container.innerHTML = `
        <h2>DECISION STREAM</h2>
        <div class="controls" style="margin-bottom:12px">
          <label>Org: <span class="org-display">${window.UI.escapeHtml(orgDisplay)}</span></label>
          <label>Learner: <input type="text" id="decisions-learner" placeholder="learner_reference (required)"></label>
          <label>From: <input type="datetime-local" id="decisions-from" title="Default: 2020-01-01T00:00:00Z when empty"></label>
          <label>To: <input type="datetime-local" id="decisions-to" title="Default: 2030-12-31T23:59:59Z when empty"></label>
          <button type="button" id="decisions-load" class="primary">Load</button>
        </div>
        <div class="empty-state">Enter learner reference and click Load to fetch receipts. Open <a href="#state">State Viewer</a> to copy learner IDs.</div>
      `;
      document.getElementById('decisions-learner')?.focus();
      document.getElementById('decisions-load')?.addEventListener('click', refresh);
      return;
    }

    try {
      window.UI.showLoading(container);

      const org = window.API.getOrgId();
      const from = fromEl?.value ? new Date(fromEl.value).toISOString() : '2020-01-01T00:00:00Z';
      const to = toEl?.value ? new Date(toEl.value).toISOString() : '2030-12-31T23:59:59Z';

      const res = await window.API.fetch('/v1/receipts', {
        org_id: org,
        learner_reference: learner,
        from_time: from,
        to_time: to,
        page_size: 50,
      });

      const receipts = res.receipts || [];
      const learnerRef = res.learner_reference || learner;
      let nextToken = res.next_page_token;

      const esc = window.UI.escapeHtml;
      const fmt = window.UI.formatTime;

      let html = `
        <h2>DECISION STREAM (Receipts)</h2>
        <div class="controls" style="margin-bottom:12px">
          <label>Learner: <input type="text" id="decisions-learner" value="${esc(learner)}" placeholder="learner_reference"></label>
          <label>From: <input type="datetime-local" id="decisions-from" value="${fromEl?.value || ''}" title="Default: 2020-01-01T00:00:00Z when empty"></label>
          <label>To: <input type="datetime-local" id="decisions-to" value="${toEl?.value || ''}" title="Default: 2030-12-31T23:59:59Z when empty"></label>
          <button type="button" id="decisions-load" class="primary">Load</button>
        </div>
      `;

      if (receipts.length === 0) {
        html += '<div class="empty-state">No receipts for this learner in the selected time range.</div>';
      } else {
        html += `
          <table>
            <thead><tr>
              <th>Time</th><th>Decision</th><th>Rule</th><th>Pri</th><th>Pol.</th><th>Learner</th>
            </tr></thead>
            <tbody>
        `;

        for (const r of receipts) {
          const trace = r.trace || {};
          const ruleId = trace.matched_rule_id != null ? esc(String(trace.matched_rule_id)) : '(default)';
          const policy = trace.policy_id
            ? esc(trace.policy_id) + (trace.policy_version ? ' / ' + esc(trace.policy_version) : '')
            : esc(trace.policy_version || '—');
          const cls = decisionClass(r.decision_type);

          html += `<tr class="clickable" data-decision="${encodeDecision(r, learnerRef)}">`;
          html += `<td>${fmt(r.decided_at)}</td>`;
          html += `<td class="${cls}" title="${decisionTooltip(r.decision_type)}">${esc(r.decision_type || '—')}</td>`;
          html += `<td>${ruleId}</td>`;
          html += `<td>—</td>`;
          html += `<td>${policy}</td>`;
          html += `<td>${esc(learnerRef)}</td>`;
          html += '</tr>';
        }

        html += '</tbody></table>';

        if (nextToken) {
          html += '<button type="button" id="decisions-load-more" style="margin-top:12px">Load more</button>';
        }
      }

      container.innerHTML = html;

      document.getElementById('decisions-load')?.addEventListener('click', refresh);

      container.querySelectorAll('tr.clickable').forEach((tr) => {
        tr.addEventListener('click', () => {
          const encoded = tr.getAttribute('data-decision');
          const decision = decodeDecision(encoded);
          if (decision) {
            window.setSelectedDecision(decision);
            window.Tabs.switchTo('trace');
          }
        });
      });

      document.getElementById('decisions-load-more')?.addEventListener('click', async () => {
        if (!nextToken) return;
        const org = window.API.getOrgId();
        const res2 = await window.API.fetch('/v1/receipts', {
          org_id: org,
          learner_reference: learner,
          from_time: from,
          to_time: to,
          page_size: 50,
          page_token: nextToken,
        });
        const more = res2.receipts || [];
        const tbody = container.querySelector('tbody');
        const fmt2 = window.UI.formatTime;
        const esc2 = window.UI.escapeHtml;
        const learnerRef2 = res2.learner_reference || learner;
        for (const r of more) {
          const trace = r.trace || {};
          const ruleId = trace.matched_rule_id != null ? esc2(String(trace.matched_rule_id)) : '(default)';
          const policy = trace.policy_id
            ? esc2(trace.policy_id) + (trace.policy_version ? ' / ' + esc2(trace.policy_version) : '')
            : esc2(trace.policy_version || '—');
          const cls = decisionClass(r.decision_type);
          const row = document.createElement('tr');
          row.className = 'clickable';
          row.setAttribute('data-decision', encodeDecision(r, learnerRef2));
          row.innerHTML = `<td>${fmt2(r.decided_at)}</td><td class="${cls}" title="${decisionTooltip(r.decision_type)}">${esc2(r.decision_type || '—')}</td><td>${ruleId}</td><td>—</td><td>${policy}</td><td>${esc2(learnerRef2)}</td>`;
          row.addEventListener('click', () => {
            const encoded = row.getAttribute('data-decision');
            const decision = decodeDecision(encoded);
            if (decision) {
              window.setSelectedDecision(decision);
              window.Tabs.switchTo('trace');
            }
          });
          tbody?.appendChild(row);
        }
        nextToken = res2.next_page_token;
        const loadMoreBtn = document.getElementById('decisions-load-more');
        if (!nextToken && loadMoreBtn) loadMoreBtn.remove();
      });
    } catch (err) {
      window.UI.showError(container, err.message || 'Failed to load receipts');
    }
  }

  window.Panels.decisions = { refresh };
})();
