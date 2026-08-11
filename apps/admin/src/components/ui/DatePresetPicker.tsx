import { useMemo } from 'react';

export interface DatePreset {
  key: string;
  label: string;
  /** Returns ISO date string (YYYY-MM-DD) for this preset. 'all' returns empty string. */
  getDate: () => string;
}

interface DatePresetPickerProps {
  value: string;
  onChange: (date: string) => void;
  presets?: DatePreset[];
  showDateInput?: boolean;
  className?: string;
}

/** Canonical presets: today, yesterday, week, all */
export function useDatePresets(): DatePreset[] {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return [
      { key: 'today', label: 'Сегодня', getDate: () => fmt(today) },
      { key: 'yesterday', label: 'Вчера', getDate: () => fmt(yesterday) },
      { key: 'week', label: 'Неделя', getDate: () => fmt(weekAgo) },
      { key: 'all', label: 'Всё', getDate: () => '' },
    ];
  }, []);
}

export function DatePresetPicker({ value, onChange, presets, showDateInput = true, className = '' }: DatePresetPickerProps) {
  const defaultPresets = useDatePresets();
  const p = presets ?? defaultPresets;

  const isPresetActive = (preset: DatePreset) => {
    if (preset.key === 'all') return value === '';
    return value === preset.getDate();
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
        {p.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(preset.getDate())}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
              isPresetActive(preset)
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {showDateInput && (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
        />
      )}
    </div>
  );
}
