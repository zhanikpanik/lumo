import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertCardProps {
  type: 'critical' | 'warning' | 'info';
  message: string;
  detail?: string;
  actionLabel: string | null;
  actionHref: string | null;
}


const severityDot = {
  critical: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-muted-foreground',
};

export function AlertCard({
  type,
  message,
  detail,
  actionLabel,
  actionHref,
}: AlertCardProps) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', severityDot[type])}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-5 text-foreground">{message}</span>
          {detail && (
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
          )}
        </span>
        {actionHref && actionLabel && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary sm:pt-0.5">
            {actionLabel}
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </span>
    </>
  );

  const className = cn(
    'group -mx-2 flex min-h-[72px] items-start gap-3 border-t border-border px-2 py-3',
    actionHref && 'transition-colors hover:bg-muted/40',
  );

  if (actionHref) {
    return (
      <Link to={actionHref} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
