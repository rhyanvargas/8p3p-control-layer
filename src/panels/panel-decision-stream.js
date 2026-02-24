/**
 * 8P3P Inspection Panels — Panel 3: Decision Stream
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-007)
 *
 * Note: GET /v1/decisions requires learner_reference. When empty, panel shows prompt.
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

  function encodeDecision(decision) {
    return encodeURIComponent(JSON.stringify(decision));
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
    if (!learner) {
      container.innerHTML = `
        <h2>DECISION STREAM</h2>
        <div class="controls" style="margin-bottom:12px">
          <label>Org ID: <input type="text" id="decisions-org" placeholder="(uses global)" disabled></label>
          <label>Learner: <input type="text" id="decisions-learner" placeholder="learner_reference (required)"></label>
          <label>From: <input type="datetime-local" id="decisions-from" title="Default: 2020-01-01T00:00:00Z when empty"></label>
          <label>To: <input type="datetime-local" id="decisions-to" title="Default: 2030-12-31T23:59:59Z when empty"></label>
          <button type="button" id="decisions-load" class="primary">Load</button>
        </div>
        <div class="empty-state">Enter learner reference and click Load to fetch decisions. Open <a href="#state">State Viewer</a> to copy learner IDs.</div>
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

      const res = await window.API.fetch('/v1/decisions', {
        org_id: org,
        learner_reference: learner,
        from_time: from,
        to_time: to,
        page_size: 50,
      });

      const decisions = res.decisions || [];
      let nextToken = res.next_page_token;

      const esc = window.UI.escapeHtml;
      const fmt = window.UI.formatTime;

      let html = `
        <h2>DECISION STREAM</h2>
        <div class="controls" style="margin-bottom:12px">
          <label>Learner: <input type="text" id="decisions-learner" value="${esc(learner)}" placeholder="learner_reference"></label>
          <label>From: <input type="datetime-local" id="decisions-from" value="${fromEl?.value || ''}" title="Default: 2020-01-01T00:00:00Z when empty"></label>
          <label>To: <input type="datetime-local" id="decisions-to" value="${toEl?.value || ''}" title="Default: 2030-12-31T23:59:59Z when empty"></label>
          <button type="button" id="decisions-load" class="primary">Load</button>
        </div>
      `;

      if (decisions.length === 0) {
        html += '<div class="empty-state">No decisions for this learner in the selected time range.</div>';
      } else {
        html += `
          <table>
            <thead><tr>
              <th>Time</th><th>Decision</th><th>Rule</th><th>Pri</th><th>Pol.</th><th>Learner</th>
            </tr></thead>
            <tbody>
        `;

        for (const d of decisions) {
          const trace = d.trace || {};
          const meta = d.output_metadata || {};
          const ruleId = trace.matched_rule_id != null ? esc(String(trace.matched_rule_id)) : '(default)';
          const priority = meta.priority != null ? meta.priority : '—';
          const policy = esc(trace.policy_version || '—');
          const cls = decisionClass(d.decision_type);
          const encodedDecision = encodeDecision(d);

          html += `<tr class="clickable" data-decision="${encodedDecision}">`;
          html += `<td>${fmt(d.decided_at)}</td>`;
          html += `<td class="${cls}" title="${decisionTooltip(d.decision_type)}">${esc(d.decision_type || '—')}</td>`;
          html += `<td>${ruleId}</td>`;
          html += `<td>${esc(String(priority))}</td>`;
          html += `<td>${policy}</td>`;
          html += `<td>${esc(d.learner_reference || '—')}</td>`;
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
        const res2 = await window.API.fetch('/v1/decisions', {
          org_id: org,
          learner_reference: learner,
          from_time: from,
          to_time: to,
          page_size: 50,
          page_token: nextToken,
        });
        const more = res2.decisions || [];
        const tbody = container.querySelector('tbody');
        const fmt2 = window.UI.formatTime;
        const esc2 = window.UI.escapeHtml;
        for (const d of more) {
          const trace = d.trace || {};
          const meta = d.output_metadata || {};
          const ruleId = trace.matched_rule_id != null ? esc2(String(trace.matched_rule_id)) : '(default)';
          const priority = meta.priority != null ? meta.priority : '—';
          const policy = esc2(trace.policy_version || '—');
          const cls = decisionClass(d.decision_type);
          const row = document.createElement('tr');
          row.className = 'clickable';
          row.setAttribute('data-decision', encodeDecision(d));
          row.innerHTML = `<td>${fmt2(d.decided_at)}</td><td class="${cls}" title="${decisionTooltip(d.decision_type)}">${esc2(d.decision_type || '—')}</td><td>${ruleId}</td><td>${esc2(String(priority))}</td><td>${policy}</td><td>${esc2(d.learner_reference || '—')}</td>`;
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
      window.UI.showError(container, err.message || 'Failed to load decisions');
    }
  }

  window.Panels.decisions = { refresh };
})();
