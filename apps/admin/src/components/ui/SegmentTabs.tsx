import { cn } from '@/lib/utils';

interface SegmentTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
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
        'inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]',
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
              'px-4 py-1 text-sm font-medium rounded-md transition-all duration-150',
              active
                ? 'bg-white text-foreground shadow-sm'
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
