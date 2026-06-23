import { cn } from '@/lib/utils';

type SheetSectionField = {
  label: string;
  value: React.ReactNode;
};

type SheetSectionProps = {
  title: string;
  fields?: SheetSectionField[];
  children?: React.ReactNode;
  className?: string;
};

export function SheetSection({
  title,
  fields,
  children,
  className,
}: SheetSectionProps) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      {fields && fields.length > 0 ? (
        <dl className="flex flex-col gap-2">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">{field.label}</dt>
              <dd className="text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}
