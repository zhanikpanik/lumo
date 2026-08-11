import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SvgIcon } from '@/components/dashboard/SvgIcon';

interface AlertCardProps {
  type: 'critical' | 'warning' | 'info';
  message: string;
  actionLabel: string | null;
  actionHref: string | null;
  onDismiss: () => void;
  onAction?: () => void;
  icon?: LucideIcon;
  iconRaw?: string;
  grouped?: boolean;
  variant?: 'chip';
}

const severityFallback = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const severityColor = {
  critical: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

const severityDot = {
  critical: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-muted-foreground',
};

export function AlertCard({
  type, message, actionLabel, actionHref, onDismiss, onAction,
  icon, iconRaw, grouped, variant,
}: AlertCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // ── Chip variant: цветная точка + текст + ×, без фона-обёртки ──
  if (variant === 'chip') {
    const chipContent = (
      <>
        <span className={cn('w-2 h-2 rounded-full shrink-0', severityDot[type])} />
        <span className="text-sm text-foreground">{message}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDismissed(true); onDismiss(); }}
          className="shrink-0 rounded-sm opacity-40 hover:opacity-70 transition-opacity"
          aria-label="Скрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </>
    );

    const chipClasses = cn(
      'inline-flex items-center gap-1.5 mr-2.5 mb-2',
      'transition-opacity cursor-pointer select-none',
      'hover:opacity-70',
    );

    if (actionHref) {
      return (
        <Link to={actionHref} className={chipClasses}>
          {chipContent}
        </Link>
      );
    }
    return <span className={chipClasses}>{chipContent}</span>;
  }

  // ── Default / grouped variant ──
  const IconComponent: LucideIcon = icon || severityFallback[type];

  const actionElement = onAction ? (
    <button
      type="button"
      onClick={onAction}
      className="shrink-0 text-sm font-medium text-primary hover:underline transition-colors"
    >
      {actionLabel}
    </button>
  ) : actionLabel && actionHref ? (
    <Link
      to={actionHref}
      className="shrink-0 text-sm font-medium text-primary hover:underline transition-colors"
    >
      {actionLabel}
    </Link>
  ) : null;

  return (
    <div className={cn(
      'inline-flex items-center gap-2',
      grouped
        ? 'px-2 py-1.5 mr-1.5 mb-1.5'
        : 'bg-[#EFF1F3] rounded-xl px-4 py-4'
    )}>
      {iconRaw ? (
        <SvgIcon raw={iconRaw} className={cn('w-auto h-10 shrink-0', severityColor[type])} />
      ) : (
        <IconComponent className={cn('w-10 h-10 shrink-0', severityColor[type])} />
      )}

      <span className="text-sm text-foreground min-w-0 truncate">
        {message}
      </span>

      {actionElement}

      <button
        type="button"
        onClick={() => { setDismissed(true); onDismiss(); }}
        className="shrink-0 p-2 rounded-md hover:bg-muted transition-colors"
        aria-label="Скрыть"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
