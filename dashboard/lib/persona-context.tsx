'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { DashboardPersona } from '@/lib/persona';

const DashboardPersonaContext = createContext<DashboardPersona>('compliance');

export function DashboardPersonaProvider({
  persona,
  children,
}: {
  persona: DashboardPersona;
  children: ReactNode;
}) {
  return (
    <DashboardPersonaContext.Provider value={persona}>{children}</DashboardPersonaContext.Provider>
  );
}

/** Session persona for client components under the dashboard shell. */
export function useDashboardPersona(): DashboardPersona {
  return useContext(DashboardPersonaContext);
}
