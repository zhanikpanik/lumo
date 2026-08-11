import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Calendar } from '@/components/shadcn/calendar';
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from '@/components/shadcn/popover';

interface DatePickerProps {
 value: string;
 onChange: (value: string) => void;
}

export function DatePicker({ value, onChange }: DatePickerProps) {
 const [open, setOpen] = useState(false);
 const date = value ? new Date(value) : undefined;

 return (
  <Popover open={open} onOpenChange={setOpen}>
   <PopoverTrigger asChild>
    <Button
     variant="outline"
     className={cn(
      'w-[160px] justify-start text-left font-normal',
      !date && 'text-muted-foreground',
     )}
    >
     {date ? format(date, 'dd MMMM yyyy', { locale: ru }) : <span>Выберите дату</span>}
    </Button>
   </PopoverTrigger>
   <PopoverContent className="w-[280px] p-0" align="start">
    <Calendar
     mode="single"
     selected={date}
     onSelect={(d) => {
      if (d) {
       onChange(format(d, 'yyyy-MM-dd'));
       setOpen(false);
      }
     }}
     captionLayout="dropdown"
     locale={ru}
    />
   </PopoverContent>
  </Popover>
 );
}
