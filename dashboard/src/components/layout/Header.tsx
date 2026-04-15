import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryClient } from '@/lib/query-client';

const ORG_OPTIONS = [{ id: 'org_demo', label: 'Demo organization (org_demo)' }];

interface HeaderProps {
  orgId: string;
  onOrgChange?: (orgId: string) => void;
}

export function Header({ orgId, onOrgChange }: HeaderProps) {
  const envOrg = import.meta.env.VITE_ORG_ID as string | undefined;
  const showOrgSelect = !envOrg && typeof onOrgChange === 'function';

  const onRefresh = () => {
    void queryClient.invalidateQueries();
  };

  return (
    <header className="bg-primary px-6 py-4 text-primary-foreground">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-lg font-bold tracking-tight" aria-hidden>
              8P3P
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Decision Panel</h1>
          </div>
          <p className="text-sm text-primary-foreground/80">
            Intelligence-driven insights from student learning data
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showOrgSelect ? (
            <Select
              value={orgId}
              onValueChange={(v) => {
                if (v) onOrgChange?.(v);
              }}
            >
              <SelectTrigger
                className="min-w-[220px] border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                aria-label="Organization"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="default"
            onClick={onRefresh}
            aria-label="Refresh decisions and panel data"
          >
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>
    </header>
  );
}
