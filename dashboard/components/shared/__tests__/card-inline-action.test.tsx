import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CardInlineAction,
  cardInlineActionVariants,
} from '@/components/shared/card-inline-action';

describe('CardInlineAction', () => {
  it('renders disclosure with chevron and toggles expanded state styling', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <CardInlineAction variant="disclosure" expanded={false} onClick={onClick}>
        Why
      </CardInlineAction>
    );

    const button = screen.getByRole('button', { name: 'Why' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('data-variant', 'disclosure');

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <CardInlineAction variant="disclosure" expanded onClick={onClick}>
        Hide
      </CardInlineAction>
    );
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('supports presentational span mode for nested row buttons', () => {
    render(
      <CardInlineAction as="span" variant="ghost">
        Why
      </CardInlineAction>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Why').closest('[data-slot="card-inline-action"]')).toHaveAttribute(
      'data-variant',
      'ghost'
    );
  });

  it('exports distinct class recipes for each variant', () => {
    const variants = [
      'ghost',
      'outline',
      'link',
      'underline',
      'disclosure',
      'arrow',
    ] as const;

    const recipes = variants.map((variant) => cardInlineActionVariants({ variant }));
    expect(new Set(recipes).size).toBe(variants.length);
  });
});
