import { AlertTriangle, Package, Receipt, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { MigrationCard as MigrationCardType } from '@/types/dashboard';

const domainIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Склад': Package,
  'Чеки': Receipt,
  'Касса': Wallet,
};

interface Props {
  card: MigrationCardType;
  onDismiss?: (id: string) => void;
}

export function MigrationCard({ card, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const DomainIcon = domainIcons[card.domain] || AlertTriangle;

  const handleAction = () => {
    // Set baseline for mark_checked and close_period types
    if (card.actionType === 'mark_checked' || card.actionType === 'close_period') {
      try {
        localStorage.setItem('rkeeper_baseline_date', card.baselineDate);
      } catch { /* noop */ }
    }
    if (card.actionHref) {
      navigate(card.actionHref);
    }
  };

  if (dismissed) return null;

  return (
    <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0 mt-0.5">
          <DomainIcon className="w-4 h-4 text-warning-foreground" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-warning-foreground">
              {card.domain} — {card.problemCount} {pluralize(card.problemCount, 'проблема', 'проблемы', 'проблем')}
            </h3>
          </div>

          <ul className="mt-1.5 space-y-0.5">
            {card.problems.map((p, i) => (
              <li key={i} className="text-sm text-warning-foreground/80 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-warning shrink-0" />
                {p}
              </li>
            ))}
          </ul>

          <p className="text-sm text-warning-foreground/70 mt-2">
            {card.contextMessage}
          </p>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={handleAction}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-warning text-warning-foreground rounded-lg hover:bg-warning/90 transition-colors"
            >
              {card.actionLabel}
            </button>

            {onDismiss && (
              <button
                type="button"
                className="text-sm text-warning-foreground/70 hover:text-warning-foreground transition-colors"
                onClick={() => {
                  setDismissed(true);
                  onDismiss(card.id);
                }}
              >
                Скрыть
              </button>
            )}
          </div>
        </div>
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
