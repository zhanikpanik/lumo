import { Plus, AlertOctagon, AlertTriangle, CheckCircle, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface ActionBarProps {
  criticalCount: number;
  totalAlertCount: number;
}

const actions = [
  { label: 'Добавить расход', href: '/transactions?create=expense' },
  { label: 'Списать', href: '/warehouse/write-offs/new' },
  { label: 'Принять поставку', href: '/warehouse/deliveries/new' },
  { label: 'Инвентаризация', href: '/warehouse/inventory?create=true' },
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
    <div className="sticky top-0 z-10 bg-background border-b px-4 sm:px-6 py-2.5 flex items-center gap-2 sm:gap-3 min-h-[52px]">
      {showHealth && (
        <a
          href="#alerts"
          className={cn('flex min-h-11 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm cursor-pointer no-underline hover:opacity-80 transition-opacity', hc.bg)}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <HealthIcon className={cn('w-3.5 h-3.5', hc.text)} />
          <span className={cn('font-medium max-sm:hidden', hc.text)}>{healthLabel}</span>
          <span className={cn('font-medium sm:hidden', hc.text)}>{totalAlertCount}</span>
        </a>
      )}

      <div className="flex-1" />

      <div className="hidden sm:flex items-center gap-1.5">
        {actions.map((action) => (
          <Link
            key={action.href}
            to={action.href}
            className="inline-flex min-h-11 items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {action.label}
          </Link>
        ))}
      </div>

      <Link
        to={actions[0].href}
        className="sm:hidden inline-flex min-h-11 items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground"
      >
        <Plus className="w-4 h-4" />
        Расход
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="sm:hidden inline-flex size-11 items-center justify-center rounded-lg border bg-background text-foreground"
            aria-label="Другие действия"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {actions.slice(1).map((action) => (
              <DropdownMenu.Item key={action.href} asChild>
                <Link
                  to={action.href}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm outline-none focus:bg-accent"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  {action.label}
                </Link>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
