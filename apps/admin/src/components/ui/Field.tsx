import type { ReactNode } from 'react';

interface FieldProps {
 label: string;
 children: ReactNode;
 className?: string;
 /** Align label to top (for textareas). */
 topLabel?: boolean;
}

/** Uniform form field: label on the left, input on the right. */
export function Field({ label, children, className = '', topLabel = false }: FieldProps) {
 return (
  <div className={`flex gap-4 ${topLabel ? 'items-start' : 'items-center'} ${className}`}>
   <label className={`w-32 text-sm text-foreground shrink-0 sm:w-36 ${topLabel ? 'pt-1.5' : ''}`}>{label}</label>
   <div className="min-w-0 flex-1 max-w-sm">{children}</div>
  </div>
 );
}
