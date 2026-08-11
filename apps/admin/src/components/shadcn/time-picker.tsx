import { cn } from '@/lib/utils';

interface TimePickerProps {
 value: string;
 onChange: (value: string) => void;
}

/** Native time input, styled like shadcn — browser picker icon hidden. */
export function TimePicker({ value, onChange }: TimePickerProps) {
 return (
  <input
   type="time"
   step="60"
   value={value || '00:00'}
   onChange={(e) => onChange(e.target.value)}
   className={cn(
    'w-[90px] h-10 px-3 py-2 rounded-md border border-input bg-background',
    'text-sm font-normal',
    '[&::-webkit-calendar-picker-indicator]:hidden',
    '[&::-webkit-calendar-picker-indicator]:appearance-none',
   )}
  />
 );
}
