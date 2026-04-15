const progressVariants: Record<string, string> = {
  improving: 'text-[var(--progress-improved)]',
  declining: 'text-[var(--progress-declining)]',
  stable: 'text-[var(--progress-stable)]',
};

export function ProgressBadge({ variant }: { variant: keyof typeof progressVariants }) {
  const cls = progressVariants[variant] ?? progressVariants.stable;
  const label = variant === 'improving' ? 'improved' : variant;
  return (
    <span className={`text-xs font-semibold uppercase ${cls}`} aria-label={`Progress ${label}`}>
      {label}
    </span>
  );
}
