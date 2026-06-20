'use client';

import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

import { DecisionBadge } from '@/components/shared/decision-badge';
import { JsonViewer } from '@/components/shared/json-viewer';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Decision } from '@/lib/api/types';
import {
  downloadDecisionJson,
  evaluateThresholdPass,
  extractEvaluatedFields,
  extractRuleCondition,
  formatTraceValue,
} from '@/lib/decision-trace';
import { formatDecisionTime, truncateRule } from '@/lib/overview-metrics';

type DecisionTraceViewProps = {
  decision: Decision;
};

function PassBadge({ result }: { result: 'pass' | 'fail' | 'unknown' }) {
  if (result === 'pass') {
    return (
      <Badge className="bg-[var(--status-advance)] text-white" aria-label="Pass">
        Pass
      </Badge>
    );
  }
  if (result === 'fail') {
    return (
      <Badge variant="destructive" aria-label="Fail">
        Fail
      </Badge>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function DecisionTraceView({ decision }: DecisionTraceViewProps) {
  const trace = decision.trace;
  const evaluatedFields = extractEvaluatedFields(trace.matched_rule);
  const ruleCondition = extractRuleCondition(trace.matched_rule);
  const meta = decision.output_metadata;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Decision trace"
        description="Compliance trust view — read-only audit record."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/decisions" />}
          >
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to stream
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => downloadDecisionJson(decision)}
          >
            <Download data-icon="inline-start" aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </PageHeader>

      <section
        aria-label="Decision header"
        className="border-border flex flex-col gap-4 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge type={decision.decision_type} />
          <span className="font-mono text-sm font-medium">
            {decision.learner_reference}
          </span>
          <span className="text-muted-foreground text-sm">
            {formatDecisionTime(decision.decided_at)}
          </span>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Decision ID</dt>
            <dd className="font-mono text-sm">{decision.decision_id}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Rule</dt>
            <dd className="font-mono text-sm">
              {truncateRule(trace.matched_rule_id, 48)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Policy</dt>
            <dd className="font-mono text-sm">
              {trace.policy_id
                ? `${trace.policy_id} (${trace.policy_version})`
                : trace.policy_version || '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">State version</dt>
            <dd className="font-mono text-sm">{trace.state_version ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Priority</dt>
            <dd className="font-mono text-sm">
              {meta?.priority != null ? String(meta.priority) : '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Educator summary</dt>
            <dd className="text-sm">
              {trace.educator_summary || '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Rationale" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Rationale</h2>
        <pre className="border-border bg-muted/30 overflow-x-auto rounded-lg border p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {trace.rationale || 'N/A — historical decision'}
        </pre>
      </section>

      <section aria-label="Evaluated thresholds" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Evaluated thresholds</h2>
        {evaluatedFields.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Op</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Pass</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluatedFields.map((field) => {
                const pass = evaluateThresholdPass(
                  field.operator,
                  field.actual_value,
                  field.threshold
                );
                return (
                  <TableRow key={`${field.field}-${field.operator}`}>
                    <TableCell className="font-mono text-xs">
                      {field.field}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {field.operator}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatTraceValue(field.threshold)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatTraceValue(field.actual_value)}
                    </TableCell>
                    <TableCell>
                      <PassBadge result={pass} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">
            N/A — historical decision or default path.
          </p>
        )}
      </section>

      <section aria-label="Raw trace data" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Raw trace data</h2>
        <p className="text-muted-foreground text-sm">
          Collapsed by default — expand only when you need the full snapshot or rule
          condition.
        </p>
        {trace.state_snapshot && Object.keys(trace.state_snapshot).length > 0 ? (
          <JsonViewer
            title="State snapshot (at decision time)"
            data={trace.state_snapshot}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            State snapshot: N/A — historical decision.
          </p>
        )}
        {ruleCondition != null ? (
          <JsonViewer title="Rule condition" data={ruleCondition} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Rule condition: N/A — historical decision or default path.
          </p>
        )}
      </section>
    </div>
  );
}
