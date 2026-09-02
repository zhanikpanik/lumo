import { cn } from '@/lib/utils';

interface SegmentTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentTabsProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-11 shrink-0 px-4 py-1 text-sm font-medium rounded-md transition-all duration-150 sm:min-h-0',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
