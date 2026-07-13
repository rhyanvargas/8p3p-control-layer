'use client';

import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Inline card/list actions — pick a variant by how loud the control needs to be:
 *
 * - `ghost` — dense rows; padded chip so it reads as a control, not metadata
 * - `outline` — bordered micro-button when the action must compete with badges
 * - `link` — primary-colored text; secondary CTAs in card bodies
 * - `underline` — always-underlined; quiet but unambiguously interactive
 * - `disclosure` — expand/collapse (Why / Hide) with rotating chevron
 * - `arrow` — navigation (“View learner →”, “Open attention →”)
 *
 * For Next.js `<Link>`, apply `cardInlineActionVariants({ variant })` directly
 * (and add `<ArrowRight />` yourself for `arrow`).
 */
const cardInlineActionVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1 text-xs font-medium whitespace-nowrap transition-colors select-none',
  {
    variants: {
      variant: {
        ghost:
          'rounded-md px-2 py-1 text-foreground/80 hover:bg-muted hover:text-foreground',
        outline:
          'rounded-md border border-border bg-background px-2 py-1 text-foreground hover:bg-muted',
        link: 'px-0 text-primary underline-offset-4 hover:underline',
        underline:
          'px-0 text-foreground underline underline-offset-4 decoration-foreground/35 hover:decoration-foreground',
        disclosure:
          'rounded-md px-2 py-1 text-foreground/80 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        arrow: 'gap-1 px-0 text-foreground underline-offset-2 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'ghost',
    },
  }
);

type CardInlineActionVariant = NonNullable<
  VariantProps<typeof cardInlineActionVariants>['variant']
>;

type CardInlineActionProps = {
  variant?: CardInlineActionVariant;
  /** For `disclosure` — rotates the chevron and drives aria-expanded. */
  expanded?: boolean;
  /**
   * Use `span` when the parent row is already the interactive control
   * (avoids nested buttons). Prefer `button` when this is the sole control.
   */
  as?: 'button' | 'span';
  className?: string;
  children: React.ReactNode;
} & Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'children' | 'className'>;

function ActionGlyph({
  variant,
  expanded,
}: {
  variant: CardInlineActionVariant;
  expanded: boolean;
}) {
  if (variant === 'disclosure') {
    return (
      <ChevronDown
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 transition-transform duration-200',
          expanded && 'rotate-180'
        )}
      />
    );
  }
  if (variant === 'arrow') {
    return <ArrowRight aria-hidden className="size-3 shrink-0" />;
  }
  return null;
}

function buttonVariantFor(variant: CardInlineActionVariant) {
  if (variant === 'outline') return 'outline' as const;
  if (variant === 'link' || variant === 'underline') return 'link' as const;
  return 'ghost' as const;
}

export function CardInlineAction({
  variant = 'ghost',
  expanded = false,
  as = 'button',
  className,
  children,
  ...props
}: CardInlineActionProps) {
  const classes = cn(cardInlineActionVariants({ variant }), className);
  const glyph = <ActionGlyph variant={variant} expanded={expanded} />;

  if (as === 'span') {
    return (
      <span
        className={classes}
        data-slot="card-inline-action"
        data-variant={variant}
        aria-hidden={props['aria-hidden'] ?? true}
      >
        {children}
        {glyph}
      </span>
    );
  }

  const { 'aria-expanded': ariaExpandedProp, ...rest } = props;

  return (
    <Button
      type="button"
      variant={buttonVariantFor(variant)}
      size="xs"
      data-slot="card-inline-action"
      data-variant={variant}
      aria-expanded={variant === 'disclosure' ? expanded : ariaExpandedProp}
      className={cn(
        'h-auto shadow-none',
        variant !== 'outline' && 'border-transparent bg-transparent',
        classes
      )}
      {...rest}
    >
      {children}
      {glyph}
    </Button>
  );
}

export { cardInlineActionVariants };
export type { CardInlineActionVariant };
