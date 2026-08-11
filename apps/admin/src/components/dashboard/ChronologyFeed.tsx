import { Link } from 'react-router-dom';
import { Clock, Play, ArrowDownRight, Truck, Trash2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChronologyEvent, ChronologyEventType } from '@/types/dashboard';

const eventIcons: Partial<Record<ChronologyEventType, { Icon: LucideIcon; color: string }>> = {
  shift_open: { Icon: Play, color: 'text-success bg-success/10' },
  expense: { Icon: ArrowDownRight, color: 'text-warning bg-warning/10' },
  delivery: { Icon: Truck, color: 'text-info bg-info/10' },
  write_off: { Icon: Trash2, color: 'text-destructive bg-destructive/10' },
};

interface ChronologyFeedProps {
  events: ChronologyEvent[];
  title?: string;
}

export function ChronologyFeed({ events, title = 'События' }: ChronologyFeedProps) {
  if (events.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground">За сегодня событий нет</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>

      <div>
        {events.map((event, i) => {
          const eventMeta = event.type ? eventIcons[event.type] : null;
          const EventIcon = eventMeta?.Icon;

          return (
          <div
            key={event.id}
            className={cn(
              'flex items-baseline gap-2 flex-wrap py-2',
            )}
          >
            <div className="flex items-center gap-2 shrink-0">
              {EventIcon && eventMeta && (
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center', eventMeta.color)}>
                  <EventIcon className="w-3 h-3" />
                </span>
              )}
              <span className="text-sm text-muted-foreground w-10 tabular-nums">
                {event.time}
              </span>
            </div>

            <span className="text-sm font-medium text-foreground">
              {event.actor}
            </span>
            <span className="text-sm text-foreground">{event.action}</span>

            {event.detail && (
              <span className="text-sm text-muted-foreground">
                — {event.detail}
              </span>
            )}

            {event.actionLabel && event.actionHref && (
              <Link to={event.actionHref} className="shrink-0">
                <span className="inline-flex items-center text-sm font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  {event.actionLabel}
                </span>
              </Link>
            )}
          </div>
        );
})}
      </div>
    </div>
  );
}
