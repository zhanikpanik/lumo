import { sanitizeDecimalString } from '@/lib/decimalMask';

export function DecimalSuffixInput({
 value,
 onChange,
 suffix,
 placeholder = '0',
 bold,
}: {
 value: string;
 onChange: (next: string) => void;
 suffix: string;
 placeholder?: string;
 bold?: boolean;
}) {
 const pad = suffix ? (suffix.length >= 3 ? 'pr-11' : 'pr-9') : 'pr-2';

 return (
  <div className="relative min-w-0">
   <input
    type="text"
    inputMode="decimal"
    autoComplete="off"
    spellCheck={false}
    placeholder={placeholder}
    className={`w-full pl-3 py-2 border border-border rounded-lg text-sm text-right tabular-nums ${pad} ${bold ? 'font-medium' : ''}`}
    value={value}
    onChange={(e) => onChange(sanitizeDecimalString(e.target.value))}
    onKeyDown={(e) => {
     if (e.ctrlKey || e.metaKey || e.altKey) return;
     if (['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Enter', 'Home', 'End'].includes(e.key)) return;
     if (/^[0-9.,]$/.test(e.key)) return;
     e.preventDefault();
    }}
   />
   {suffix ? (
    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">
     {suffix}
    </span>
   ) : null}
  </div>
 );
}
