import { useState, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  const [activePreset, setActivePreset] = useState<Preset>('this_month');

  const handlePreset = useCallback((preset: Preset) => {
    setActivePreset(preset);
    const { start: s, end: e } = computePreset(preset);
    onChange(s, e);
  }, [onChange]);

  const handleCustomStart = useCallback((val: string) => {
    setActivePreset(null as unknown as Preset);
    onChange(val, end);
  }, [end, onChange]);

  const handleCustomEnd = useCallback((val: string) => {
    setActivePreset(null as unknown as Preset);
    onChange(start, val);
  }, [start, onChange]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <SegmentTabs
        options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        value={activePreset ?? ('' as Preset)}
        onChange={(v) => handlePreset(v as Preset)}
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
