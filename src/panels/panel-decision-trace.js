/**
 * 8P3P Inspection Panels — Panel 4: Decision Trace / Receipt
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-008)
 *
 * Receives decision from Panel 3 row click. No GET-by-decision_id endpoint.
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'panel-trace';

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  function evaluatePass(op, actual, threshold) {
    if (actual == null || threshold == null || !op) return '—';
    switch (op) {
      case 'lt':  return actual < threshold  ? '✓' : '✗';
      case 'lte': return actual <= threshold ? '✓' : '✗';
      case 'gt':  return actual > threshold  ? '✓' : '✗';
      case 'gte': return actual >= threshold ? '✓' : '✗';
      case 'eq':  return actual === threshold ? '✓' : '✗';
      case 'neq': return actual !== threshold ? '✓' : '✗';
      default:    return '—';
    }
  }

  function renderTrace(decision) {
    const esc = window.UI.escapeHtml;
    const trace = decision.trace || {};
    const meta = decision.output_metadata || {};
    const rule = trace.matched_rule;
    const snapshot = trace.state_snapshot;
    const rationale = trace.rationale;

    let html = `
      <h2>DECISION TRACE</h2>
      <div class="controls" style="margin-bottom:12px">
        <button type="button" id="trace-back" class="primary">← Back to Stream</button>
        <button type="button" id="trace-export">Export as JSON</button>
      </div>

      <h3>Decision</h3>
      <table>
        <tr><td>type</td><td>${esc(decision.decision_type || '—')}</td></tr>
        <tr><td>decided_at</td><td>${esc(decision.decided_at || '—')}</td></tr>
        <tr><td>learner</td><td>${esc(decision.learner_reference || '—')}</td></tr>
        <tr><td>policy</td><td>${esc(trace.policy_id ? trace.policy_id + ' (' + (trace.policy_version || '') + ')' : (trace.policy_version || '—'))}</td></tr>
        <tr><td>rule</td><td>${esc(trace.matched_rule_id != null ? String(trace.matched_rule_id) : '—')}</td></tr>
        <tr><td>priority</td><td>${meta.priority != null ? esc(String(meta.priority)) : '—'}</td></tr>
      </table>

      <h3>Rationale</h3>
      <pre style="background:#111;padding:12px;border:1px solid #333;overflow-x:auto">${esc(rationale || 'N/A — historical decision')}</pre>
    `;

    if (rule && Array.isArray(rule.evaluated_fields) && rule.evaluated_fields.length > 0) {
      html += `
        <h3>Evaluated Thresholds</h3>
        <table>
          <thead><tr><th>Field</th><th>Op</th><th>Threshold</th><th>Actual</th><th>Pass</th></tr></thead>
          <tbody>
      `;
      for (const f of rule.evaluated_fields) {
        const passStr = evaluatePass(f.operator, f.actual_value, f.threshold);
        html += `<tr><td>${esc(f.field || '—')}</td><td>${esc(f.operator || '—')}</td><td>${esc(String(f.threshold ?? '—'))}</td><td>${esc(String(f.actual_value ?? '—'))}</td><td>${passStr}</td></tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<h3>Evaluated Thresholds</h3><p class="empty-state">N/A — historical decision or default path</p>';
    }

    if (snapshot && typeof snapshot === 'object') {
      const snapJson = JSON.stringify(snapshot, null, 2);
      html += `
        <h3>State Snapshot (at decision time)</h3>
        <div class="json-section">
          <div class="json-section-header" data-toggle="trace-state-json">
            <span>Toggle</span>
            <button type="button" class="btn-copy" data-copy="trace-state-json">Copy</button>
          </div>
          <pre class="json-section-content collapsed" id="trace-state-json">${esc(snapJson)}</pre>
        </div>
      `;
    } else {
      html += '<h3>State Snapshot</h3><p class="empty-state">N/A — historical decision</p>';
    }

    if (rule && rule.condition) {
      const condJson = JSON.stringify(rule.condition, null, 2);
      html += `
        <h3>Rule Condition</h3>
        <div class="json-section">
          <div class="json-section-header" data-toggle="trace-rule-cond">
            <span>Toggle</span>
            <button type="button" class="btn-copy" data-copy="trace-rule-cond">Copy</button>
          </div>
          <pre class="json-section-content collapsed" id="trace-rule-cond">${esc(condJson)}</pre>
        </div>
      `;
    } else {
      html += '<h3>Rule Condition</h3><p class="empty-state">N/A — historical decision or default path</p>';
    }

    return html;
  }

  function bindTraceActions(container) {
    document.getElementById('trace-back')?.addEventListener('click', () => {
      window.Tabs.switchTo('decisions');
    });

    document.getElementById('trace-export')?.addEventListener('click', () => {
      const d = window.getSelectedDecision();
      if (!d) return;
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'decision-' + (d.decision_id || Date.now()) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    container?.querySelectorAll('.json-section-header').forEach((h) => {
      const toggleId = h.getAttribute('data-toggle');
      const content = document.getElementById(toggleId);
      if (content) {
        h.addEventListener('click', () => content.classList.toggle('collapsed'));
      }
    });

    container?.querySelectorAll('.btn-copy[data-copy]').forEach((btn) => {
      const id = btn.getAttribute('data-copy');
      const content = document.getElementById(id);
      if (content) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(content.textContent);
        });
      }
    });
  }

  function refresh() {
    const container = getContainer();
    if (!container) return;

    const decision = window.getSelectedDecision();

    if (!decision) {
      container.innerHTML = `
        <h2>DECISION TRACE</h2>
        <div class="empty-state">Select a decision from the stream. Go to the Decision Stream panel and click a row.</div>
        <button type="button" id="trace-back" style="margin-top:12px">← Back to Stream</button>
      `;
      document.getElementById('trace-back')?.addEventListener('click', () => window.Tabs.switchTo('decisions'));
      return;
    }

    container.innerHTML = renderTrace(decision);
    bindTraceActions(container);
  }

  window.Panels.trace = { refresh };
})();
