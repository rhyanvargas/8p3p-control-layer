'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import type { Theme } from '@/lib/theme';

export function Providers({
  children,
  theme = 'light',
}: {
  children: ReactNode;
  theme?: Theme;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={theme}
        enableSystem={false}
        disableTransitionOnChange
        storageKey="dashboard-theme"
        themes={['light', 'dark']}
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
