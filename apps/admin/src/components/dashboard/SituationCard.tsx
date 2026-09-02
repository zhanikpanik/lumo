import { Link } from 'react-router-dom';
import { AlertOctagon, ChevronRight, CircleGauge, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OverviewSituation, OverviewSituationClass } from '@/types/dashboard';

interface SituationCardProps {
  situation: OverviewSituation;
}

interface SituationStyle {
  icon: LucideIcon;
  iconClass: string;
}

const STYLE_BY_CLASS: Record<OverviewSituationClass, SituationStyle> = {
  blocked: {
    icon: AlertOctagon,
    iconClass: 'text-destructive',
  },
  probable_loss: {
    icon: TrendingDown,
    iconClass: 'text-warning-foreground',
  },
  degrading: {
    icon: CircleGauge,
    iconClass: 'text-muted-foreground',
  },
};


export function SituationCard({ situation }: SituationCardProps) {
  const style = STYLE_BY_CLASS[situation.class];
  const Icon = style.icon;

  return (
    <article className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={cn('mt-0.5 size-4 shrink-0', style.iconClass)} aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {situation.title}
          </h3>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground sm:line-clamp-1">
            {situation.impact}
          </p>
        </div>
      </div>

      <Link
        to={situation.actionHref}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 self-end text-sm font-medium text-primary transition-colors hover:text-primary/80 sm:min-h-0 sm:self-center"
      >
        {situation.actionLabel}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
