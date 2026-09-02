import { useCallback } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import { DatePicker } from '@/components/shadcn/date-picker';
import { SegmentTabs } from '@/components/ui/SegmentTabs';

type Preset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month';

interface PeriodPickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

function iso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function computePreset(preset: Preset): { start: string; end: string } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: iso(now), end: iso(now) };
    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { start: iso(y), end: iso(y) };
    }
    case 'this_week':
      return { start: iso(startOfWeek(now, { weekStartsOn: 1 })), end: iso(now) };
    case 'last_week': {
      const lw = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      return { start: iso(lw), end: iso(endOfWeek(lw, { weekStartsOn: 1 })) };
    }
    case 'this_month':
      return { start: iso(startOfMonth(now)), end: iso(now) };
    case 'last_month': {
      const lm = startOfMonth(subMonths(now, 1));
      return { start: iso(lm), end: iso(endOfMonth(lm)) };
    }
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: 'this_week', label: 'Неделя' },
  { key: 'this_month', label: 'Месяц' },
];

export function PeriodPicker({ start, end, onChange }: PeriodPickerProps) {
  const activePreset = PRESETS.find(({ key }) => {
    const preset = computePreset(key);
    return preset.start === start && preset.end === end;
  })?.key ?? null;

  const handlePreset = useCallback((preset: Preset) => {
    const { start: nextStart, end: nextEnd } = computePreset(preset);
    onChange(nextStart, nextEnd);
  }, [onChange]);

  const handleCustomStart = useCallback((value: string) => {
    onChange(value, end);
  }, [end, onChange]);

  const handleCustomEnd = useCallback((value: string) => {
    onChange(start, value);
  }, [start, onChange]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <SegmentTabs
        options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        value={activePreset}
        onChange={handlePreset}
      />

      <span className="text-muted-foreground text-sm mx-1">или</span>

      <div className="flex items-center gap-2">
        <DatePicker value={start} onChange={handleCustomStart} />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker value={end} onChange={handleCustomEnd} />
      </div>
    </div>
  );
}
