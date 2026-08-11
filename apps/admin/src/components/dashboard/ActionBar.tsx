import { Plus, AlertOctagon, AlertTriangle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  criticalCount: number;
  totalAlertCount: number;
}

const actions = [
  { label: 'Добавить расход', href: '/transactions' },
  { label: 'Списать', href: '/warehouse/write-offs' },
  { label: 'Принять поставку', href: '/warehouse/deliveries' },
  { label: 'Инвентаризация', href: '/warehouse/inventory' },
];

const healthConfig = {
  critical: { Icon: AlertOctagon, dot: 'bg-destructive', text: 'text-destructive', bg: 'bg-destructive/5' },
  warning: { Icon: AlertTriangle, dot: 'bg-warning', text: 'text-warning-foreground', bg: 'bg-warning/5' },
  good: { Icon: CheckCircle, dot: 'bg-success', text: 'text-success', bg: 'bg-success/5' },
};

export function ActionBar({ criticalCount, totalAlertCount }: ActionBarProps) {
  const health = criticalCount > 0 ? 'critical' : totalAlertCount > 0 ? 'warning' : 'good';
  const hc = healthConfig[health];
  const { Icon: HealthIcon } = hc;

  const healthLabel = health === 'critical'
    ? `${criticalCount} критич., ${totalAlertCount} всего`
    : health === 'warning'
      ? `${totalAlertCount} ${pluralize(totalAlertCount, 'проблема', 'проблемы', 'проблем')}`
      : 'Всё под контролем';

  // Hide health bar when everything is fine
  const showHealth = health !== 'good';

  return (
    <div className="sticky top-0 z-10 bg-background border-b px-4 sm:px-6 py-2.5 flex items-center gap-2 sm:gap-3 min-h-[44px]">
      {showHealth && (
        <a
          href="#alerts"
          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm cursor-pointer no-underline hover:opacity-80 transition-opacity', hc.bg)}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <HealthIcon className={cn('w-3.5 h-3.5', hc.text)} />
          <span className={cn('font-medium', hc.text)}>{healthLabel}</span>
        </a>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {actions.map((a) => (
          <Link key={a.href} to={a.href}>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {a.label}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}

function pluralize(n: number, one: string, two: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return two;
  return many;
}
