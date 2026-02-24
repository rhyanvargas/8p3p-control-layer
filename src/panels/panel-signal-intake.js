/**
 * 8P3P Inspection Panels — Panel 1: Signal Intake
 * Spec: docs/specs/inspection-panels.md
 * Plan: .cursor/plans/inspection-panels.plan.md (TASK-005)
 */

(function () {
  'use strict';

  const CONTAINER_ID = 'panel-signal';
  const LIMIT = 50;

  let nextCursor = null;
  let expandedRows = new Set();

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  function renderTable(entries) {
    const esc = window.UI.escapeHtml;
    const fmt = window.UI.formatTime;
    const currentOutcome = document.getElementById('outcome-filter')?.value || '';

    let html = `
      <h2>SIGNAL INTAKE</h2>
      <div class="controls" style="margin-bottom:12px">
        <label>Filter: <select id="outcome-filter">
          <option value="">All</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="duplicate">Duplicate</option>
        </select></label>
        <span id="showing-count" style="margin-left:12px;color:#888"></span>
      </div>
      <table>
        <thead><tr>
          <th>Time</th><th>Signal ID</th><th>Source</th><th>Schema</th><th>Outcome</th>
        </tr></thead>
        <tbody>
    `;

    entries.forEach((e, i) => {
      const outcomeClass = 'outcome-' + (e.outcome || 'accepted');
      const outcomeLabel = e.outcome === 'accepted' ? '✓ accepted' : e.outcome === 'duplicate' ? '○ duplicate' : '✗ rejected';
      const signalId = esc(e.signal_id || '—');
      const title = (e.signal_id && e.signal_id.length > 20) ? e.signal_id : '';
      const rowId = 'row-' + i + '-' + (e.received_at || '') + '-' + (e.signal_id || '');

      html += `<tr class="${e.outcome === 'rejected' ? 'clickable' : ''}" data-row-id="${rowId}">`;
      html += `<td>${fmt(e.received_at)}</td>`;
      html += `<td title="${esc(title)}">${signalId.length > 24 ? signalId.slice(0, 24) + '…' : signalId}</td>`;
      html += `<td>${esc(e.source_system || '—')}</td>`;
      html += `<td>${esc(e.schema_version || '—')}</td>`;
      html += `<td class="${outcomeClass}">${outcomeLabel}`;

      if (e.outcome === 'rejected' && e.rejection_reason) {
        const code = esc(e.rejection_reason.code || '');
        const expanded = expandedRows.has(rowId);
        html += `<div class="rejection-detail">${code}`;
        if (expanded) {
          html += '<br>message: ' + esc(e.rejection_reason.message || '') + '<br>field_path: ' + esc(e.rejection_reason.field_path || '');
        }
        html += '</div>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table>';

    if (nextCursor) {
      html += '<button type="button" id="btn-load-more" style="margin-top:12px">Load more</button>';
    }

    const container = getContainer();
    if (container) container.innerHTML = html;

    const filterEl = document.getElementById('outcome-filter');
    if (filterEl) {
      filterEl.value = currentOutcome;
      filterEl.addEventListener('change', () => refresh());
    }
    document.getElementById('btn-load-more')?.addEventListener('click', loadMore);

    container?.querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-row-id');
        if (id) {
          if (expandedRows.has(id)) expandedRows.delete(id);
          else expandedRows.add(id);
          renderTable(window._signalIntakeEntries || []);
        }
      });
    });

    document.getElementById('showing-count').textContent = 'Showing: ' + entries.length;
  }

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const org = window.API.getOrgId();
      const outcomeEl = document.getElementById('outcome-filter');
      const outcome = outcomeEl?.value || undefined;
      const res = await window.API.fetch('/v1/ingestion', {
        org_id: org,
        limit: LIMIT,
        cursor: nextCursor,
        ...(outcome ? { outcome } : {}),
      });
      nextCursor = res.next_cursor;
      const allEntries = (window._signalIntakeEntries || []).concat(res.entries);
      window._signalIntakeEntries = allEntries;
      renderTable(allEntries);
    } catch (err) {
      window.UI.showError(getContainer(), err.message || 'Failed to load more');
    }
  }

  async function refresh() {
    const container = getContainer();
    if (!container) return;

    try {
      window.UI.showLoading(container);
      const org = window.API.getOrgId();
      const outcomeEl = document.getElementById('outcome-filter');
      const outcome = outcomeEl?.value || undefined;

      const res = await window.API.fetch('/v1/ingestion', {
        org_id: org,
        limit: LIMIT,
        ...(outcome ? { outcome } : {}),
      });

      nextCursor = res.next_cursor;
      window._signalIntakeEntries = res.entries || [];

      if (!res.entries || res.entries.length === 0) {
        container.innerHTML = '<h2>SIGNAL INTAKE</h2><div class="empty-state">No ingestion entries. Send signals via POST /v1/signals to see data.</div>';
        return;
      }

      renderTable(res.entries);
    } catch (err) {
      window.UI.showError(container, err.message || 'Failed to load ingestion data');
    }
  }

  window.Panels.signal = { refresh };
})();
