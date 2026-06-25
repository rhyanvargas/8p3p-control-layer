'use client';

import { DecisionBadge } from '@/components/shared/decision-badge';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { SheetSection } from '@/components/shared/sheet-section';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { usePolicyDetail } from '@/hooks/use-policies';
import type { PolicySummary } from '@/lib/api/types';
import { formatPolicyCondition } from '@/lib/policy-condition';

type PolicyDetailSheetProps = {
  policy: PolicySummary | null;
  orgId: string;
  onClose: () => void;
};

export function PolicyDetailSheet({ policy, orgId, onClose }: PolicyDetailSheetProps) {
  const policyKey = policy?.policy_key ?? '';
  const detailQuery = usePolicyDetail(orgId, policyKey);

  return (
    <DetailSheet
      open={policy != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={policy ? policy.policy_key : undefined}
      description={
        policy ? (
          <span className="font-mono text-xs">
            {policy.policy_id} · v{policy.policy_version}
          </span>
        ) : undefined
      }
    >
      {policy == null ? null : detailQuery.isLoading ? (
        <LoadingState variant="list" count={policy.rule_count} />
      ) : detailQuery.isError ? (
        <ErrorState
          error={detailQuery.error}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : (
        <>
          <SheetSection
            title="Summary"
            fields={[
              {
                label: 'Access role',
                value: <span className="font-medium">{policy.policy_key}</span>,
              },
              {
                label: 'Policy ID',
                value: <span className="font-mono text-xs">{policy.policy_id}</span>,
              },
              {
                label: 'Version',
                value: policy.policy_version,
              },
              {
                label: 'Rule count',
                value: String(policy.rule_count),
              },
            ]}
          />

          {policy.description ? (
            <SheetSection title="Description">
              <p className="text-sm leading-relaxed">{policy.description}</p>
            </SheetSection>
          ) : null}

          <SheetSection title="Rules">
            <p className="text-muted-foreground text-xs">
              Priority-ordered — first match wins.
            </p>
            {detailQuery.data?.policy.rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rules defined.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {detailQuery.data?.policy.rules.map((rule, index) => (
                  <li
                    key={rule.rule_id}
                    className="bg-muted/30 rounded-md border border-border/60 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-muted-foreground font-mono text-xs"
                        aria-label={`Rule priority ${index + 1}`}
                      >
                        #{index + 1}
                      </span>
                      <span className="font-mono text-xs">{rule.rule_id}</span>
                      <DecisionBadge type={rule.decision_type} />
                    </div>
                    <p className="text-muted-foreground mt-2 font-mono text-xs leading-relaxed">
                      {formatPolicyCondition(rule.condition)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SheetSection>
        </>
      )}
    </DetailSheet>
  );
}
