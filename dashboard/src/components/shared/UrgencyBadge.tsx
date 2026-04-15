function priorityToLabel(priority: number): { label: string; className: string } {
  if (priority === 1) return { label: 'high', className: 'text-[var(--urgency-high)]' };
  if (priority <= 3) return { label: 'medium', className: 'text-[var(--urgency-medium)]' };
  return { label: 'low', className: 'text-muted-foreground' };
}

export function UrgencyBadge({ priority }: { priority: number | null | undefined }) {
  const p = priority ?? 99;
  const { label, className } = priorityToLabel(p);
  return (
    <span className={`text-xs font-semibold uppercase ${className}`} aria-label={`Urgency ${label}`}>
      {label}
    </span>
  );
}
