import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const variantIconClass: Record<'danger' | 'warning' | 'action' | 'success', string> = {
  danger: 'text-[var(--urgency-high)]',
  warning: 'text-[var(--urgency-medium)]',
  action: 'text-[var(--progress-improved)]',
  success: 'text-[var(--progress-improved)]',
};

interface PanelCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  variant: keyof typeof variantIconClass;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function PanelCard({ title, description, icon: Icon, variant, children, footer }: PanelCardProps) {
  const infoId = `panel-info-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Card className="flex h-[600px] flex-col gap-0 py-0" aria-labelledby={infoId}>
      <CardHeader className="flex flex-row items-center gap-2 border-b pb-3 pt-4">
        <Icon className={`h-5 w-5 shrink-0 ${variantIconClass[variant]}`} aria-hidden />
        <CardTitle id={infoId} className="text-lg font-semibold" role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="ml-auto inline-flex rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`About ${title}`}
          >
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">{children}</div>
      </CardContent>
      {footer ? <CardFooter className="border-t py-3">{footer}</CardFooter> : null}
    </Card>
  );
}
