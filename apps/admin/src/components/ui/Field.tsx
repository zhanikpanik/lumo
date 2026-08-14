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
  <div className={`flex flex-col gap-2 sm:flex-row sm:gap-4 ${topLabel ? 'sm:items-start' : 'sm:items-center'} ${className}`}>
   <label className={`text-sm text-foreground sm:w-36 sm:shrink-0 ${topLabel ? 'sm:pt-1.5' : ''}`}>{label}</label>
   <div className="min-w-0 flex-1 sm:max-w-sm">{children}</div>
  </div>
 );
}
