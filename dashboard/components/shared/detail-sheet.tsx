'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type DetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Optional custom header; overrides title/description when set. */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Single primary footer CTA (typically DrillDownLink). */
  footer?: React.ReactNode;
  className?: string;
};

export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  header,
  children,
  footer,
  className,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex h-full w-full flex-col gap-0 p-0 sm:max-w-[480px]',
          className,
        )}
      >
        {header ?? (
          <SheetHeader className="border-border shrink-0 border-b px-4 py-4">
            {title ? <SheetTitle>{title}</SheetTitle> : null}
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
        </ScrollArea>

        {footer ? (
          <SheetFooter className="border-border shrink-0 border-t px-4 py-4">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
