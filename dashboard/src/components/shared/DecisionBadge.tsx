import { Badge } from '@/components/ui/badge';

const variants: Record<string, string> = {
  intervene: 'bg-[var(--status-intervene)] text-white',
  reinforce: 'bg-[var(--status-reinforce)] text-white',
  advance: 'bg-[var(--status-advance)] text-white',
  pause: 'bg-[var(--status-pause)] text-white',
};

export function DecisionBadge({ type }: { type: string }) {
  return (
    <Badge className={variants[type] ?? 'bg-muted text-muted-foreground'} aria-label={`Decision type ${type}`}>
      {type.toUpperCase()}
    </Badge>
  );
}
