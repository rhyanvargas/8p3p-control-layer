import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { cn } from '@/lib/utils';
import { getThemeFromCookies } from '@/lib/theme.server';

import { Toaster } from '@/components/ui/sonner';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: '8P3P Dashboard',
  description: '8P3P Control Layer educator dashboard',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemeFromCookies();

  return (
    <html
      lang="en"
      className={cn(theme === 'dark' && 'dark', GeistSans.variable, GeistMono.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Providers theme={theme}>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
