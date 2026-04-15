import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from '@/components/layout/Header';
import { SignalsPrefetch } from '@/components/layout/SignalsPrefetch';
import { DidItWork } from '@/components/panels/DidItWork';
import { WhatToDo } from '@/components/panels/WhatToDo';
import { WhoNeedsAttention } from '@/components/panels/WhoNeedsAttention';
import { WhyAreTheyStuck } from '@/components/panels/WhyAreTheyStuck';
import { queryClient } from '@/lib/query-client';

export default function App() {
  const envOrg = import.meta.env.VITE_ORG_ID as string | undefined;
  const [orgId, setOrgId] = useState(() => envOrg ?? 'org_demo');
  const activeOrg = envOrg ?? orgId;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <SignalsPrefetch orgId={activeOrg} />
          <Header orgId={activeOrg} onOrgChange={envOrg ? undefined : setOrgId} />
          <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 p-6 md:grid-cols-2 xl:grid-cols-4">
            <WhoNeedsAttention orgId={activeOrg} />
            <WhyAreTheyStuck orgId={activeOrg} />
            <WhatToDo orgId={activeOrg} />
            <DidItWork orgId={activeOrg} />
          </main>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
