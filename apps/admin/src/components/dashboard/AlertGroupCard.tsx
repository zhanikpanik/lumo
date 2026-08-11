import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertGroup } from '@/types/dashboard';

const severityConfig = {
  critical: {
    Icon: AlertOctagon,
    bg: 'bg-destructive/5 border-destructive/30',
    headerBg: 'bg-destructive/5',
    iconColor: 'text-destructive',
    textColor: 'text-destructive',
    dot: 'bg-destructive',
  },
  warning: {
    Icon: AlertTriangle,
    bg: 'bg-warning/5 border-warning/20',
    headerBg: 'bg-warning/5',
    iconColor: 'text-warning-foreground',
    textColor: 'text-warning-foreground',
    dot: 'bg-warning',
  },
  info: {
    Icon: Info,
    bg: 'bg-info/5 border-info/20',
    headerBg: 'bg-info/5',
    iconColor: 'text-info',
    textColor: 'text-info',
    dot: 'bg-info',
  },
};

interface Props {
  group: AlertGroup;
  onDismissAlert?: (alertId: string) => void;
}

export function AlertGroupCard({ group, onDismissAlert }: Props) {
  const [expanded, setExpanded] = useState(group.defaultExpanded);
  const config = severityConfig[group.severity];
  const { Icon: SeverityIcon } = config;

  return (
    <div className={cn('rounded-xl border overflow-hidden', config.bg)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn('w-full flex items-center gap-2 px-4 py-2.5 text-left', config.headerBg)}
      >
        <SeverityIcon className={cn('w-4 h-4 shrink-0', config.iconColor)} />
        <span className={cn('text-sm font-semibold flex-1', config.textColor)}>
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-1">
          {group.alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-2 py-1.5"
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
              <span className="text-sm text-foreground flex-1 min-w-0">
                {alert.message}
              </span>
              {alert.actionLabel && alert.actionHref && (
                <Link
                  to={alert.actionHref}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  {alert.actionLabel}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
