'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ENVELOPE_FIELD_OPTIONS,
  getRequiredFieldStatuses,
  getUnassignedColumns,
  isColumnAssigned,
  isMappingComplete,
} from '@/lib/upload/mapping';
import type { FieldMapping, ParsedTable } from '@/lib/upload/types';

const UNASSIGNED_VALUE = '__unassigned__';

type StepMapProps = {
  table: ParsedTable;
  mapping: FieldMapping;
  defaults: { source_system: string; schema_version: string };
  onMappingChange: (mapping: FieldMapping) => void;
  onDefaultsChange: (defaults: { source_system: string; schema_version: string }) => void;
  onBack: () => void;
  onNext: () => void;
};

export function StepMap({
  table,
  mapping,
  defaults,
  onMappingChange,
  onDefaultsChange,
  onBack,
  onNext,
}: StepMapProps) {
  const unassignedColumns = getUnassignedColumns(table.columns, mapping);
  const requiredStatuses = getRequiredFieldStatuses(mapping, defaults);
  const missingRequired = requiredStatuses.filter((s) => !s.satisfied);
  const canProceed = isMappingComplete(mapping, defaults, table.columns);

  function assignColumn(column: string, target: string) {
    const next: FieldMapping = {
      ...mapping,
      payloadColumns: [...mapping.payloadColumns],
    };

    for (const field of ENVELOPE_FIELD_OPTIONS) {
      if (field.value !== 'payload' && next[field.value] === column) {
        delete next[field.value];
      }
    }
    next.payloadColumns = next.payloadColumns.filter((c) => c !== column);

    if (target === 'payload') {
      if (!next.payloadColumns.includes(column)) next.payloadColumns.push(column);
    } else if (target !== UNASSIGNED_VALUE) {
      next[target as keyof Omit<FieldMapping, 'payloadColumns'>] = column;
    }

    onMappingChange(next);
  }

  function currentTarget(column: string): string {
    for (const field of ENVELOPE_FIELD_OPTIONS) {
      if (field.value !== 'payload' && mapping[field.value] === column) return field.value;
    }
    if (mapping.payloadColumns.includes(column)) return 'payload';
    return UNASSIGNED_VALUE;
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          <code className="font-mono text-xs">org_id</code> is injected automatically by the
          server — you do not need to map it.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="default-source">Default source system (when column absent)</Label>
          <Input
            id="default-source"
            value={defaults.source_system}
            onChange={(e) =>
              onDefaultsChange({ ...defaults, source_system: e.target.value.trim() })
            }
            placeholder="e.g. lms-demo"
            aria-required={!mapping.source_system}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="default-schema">Default schema version (when column absent)</Label>
          <Input
            id="default-schema"
            value={defaults.schema_version}
            onChange={(e) =>
              onDefaultsChange({ ...defaults, schema_version: e.target.value.trim() })
            }
            placeholder="v1"
            aria-required={!mapping.schema_version}
          />
        </div>
      </div>

      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Required field mapping status">
        {requiredStatuses.map((status) => (
          <li key={status.field}>
            <Badge
              variant={status.satisfied ? 'secondary' : 'outline'}
              className={status.satisfied ? undefined : 'border-destructive text-destructive'}
            >
              {status.label}
              {status.satisfied && status.detail
                ? `: ${status.detail}${status.source === 'default' ? ' (default)' : ''}`
                : ''}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Column</th>
              <th className="px-3 py-2 text-left font-medium">Sample</th>
              <th className="px-3 py-2 text-left font-medium">Maps to</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((column) => (
              <tr key={column} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{column}</td>
                <td className="text-muted-foreground px-3 py-2 text-xs">
                  {String(table.rows[0]?.[column] ?? '—')}
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={currentTarget(column)}
                    onValueChange={(value) => assignColumn(column, value ?? UNASSIGNED_VALUE)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full min-w-40"
                      aria-invalid={!isColumnAssigned(column, mapping)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>— Not assigned —</SelectItem>
                      {ENVELOPE_FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">Payload columns</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Unmapped envelope fields stay on the row; extra columns are nested under{' '}
          <code className="font-mono">payload</code>.
        </p>
        {mapping.payloadColumns.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mapping.payloadColumns.map((col) => (
              <Badge key={col} variant="secondary" className="font-mono text-xs">
                {col}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">No columns assigned to payload.</p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Preview: {table.rows.length} row{table.rows.length === 1 ? '' : 's'} detected from{' '}
        {table.sourceFormat.toUpperCase()}.
      </p>

      {!canProceed ? (
        <Alert variant="destructive">
          <AlertDescription>
            {missingRequired.length > 0
              ? `Map or set defaults for required fields: ${missingRequired
                  .map((s) => s.label)
                  .join(', ')}.`
              : null}
            {unassignedColumns.length > 0
              ? ` Assign every column: ${unassignedColumns.join(', ')}.`
              : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={!canProceed}>
          Next: Validate
        </Button>
      </div>
    </div>
  );
}
