/**
 * Educator-facing semantic colors — Tailwind v4 palette only.
 *
 * Badge pairs use -50/-950 backgrounds with -700/-400 text for WCAG AA (4.5:1+).
 * Icon and chart tokens use -600/-400 shades (icons, strokes, legend dots).
 */

/** Soft badge: background + foreground for chips and status pills. */
export const badge = {
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
  neutral: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive/10 text-destructive',
  /** Solid fill for pass/success badges with white label text (blue-600 ≈ 4.6:1). */
  infoSolid: 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white',
} as const;

/** Standalone icon / stat accent (no background). */
export const icon = {
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-blue-600 dark:text-blue-400',
  neutral: 'text-neutral-500 dark:text-neutral-400',
} as const;

/** Border, ring, and tinted surface accents. */
export const surface = {
  dangerBorder: 'border-red-600/40',
  dangerMuted: 'border-red-600/30 bg-red-50/50 dark:border-red-500/30 dark:bg-red-950/20',
  warningBorder: 'border-amber-600/30',
  warningRing: 'ring-amber-600/30',
  warningTopBorder: 'border-t-amber-600',
  warningMutedBg: 'bg-amber-50 dark:bg-amber-950/40',
  warningMutedIcon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400',
  infoBorder: 'border-blue-600/30',
  infoMuted: 'border-blue-600/30 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-950/20',
  infoMutedIcon: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
  pauseBorder: 'border-neutral-500/30 bg-neutral-500/5',
} as const;

/** Recharts / inline styles — references Tailwind default `--color-*` CSS vars. */
export const chart = {
  danger: 'var(--color-red-600)',
  warning: 'var(--color-amber-600)',
  success: 'var(--color-emerald-600)',
  info: 'var(--color-blue-600)',
  neutral: 'var(--color-neutral-500)',
} as const;
