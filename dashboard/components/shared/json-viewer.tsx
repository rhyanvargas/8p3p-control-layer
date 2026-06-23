'use client';

import { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type JsonViewerProps = {
  data: unknown;
  title?: string;
  /** Collapsed by default per L3 drill-down doctrine. */
  defaultOpen?: boolean;
  className?: string;
};

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function JsonViewer({
  data,
  title = 'Raw JSON',
  defaultOpen = false,
  className,
}: JsonViewerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const formatted = formatJson(data);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      toast.success('Copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('border-border rounded-lg border', className)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <CollapsibleTrigger
          className="text-muted-foreground hover:text-foreground flex flex-1 items-center gap-2 text-left text-sm font-medium transition-colors"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
          {title}
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          aria-label="Copy JSON"
        >
          {copied ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </div>
      <CollapsibleContent>
        <pre className="border-border bg-muted/30 max-h-96 overflow-auto border-t p-3 font-mono text-xs leading-relaxed">
          <code>{formatted}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
