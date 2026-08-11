import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

/** Compact tag/badge for inline metadata. */
export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center text-sm font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground', className)}>
      {children}
    </span>
  );
}
