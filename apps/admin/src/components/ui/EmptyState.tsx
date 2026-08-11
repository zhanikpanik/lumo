import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Main message */
  title: string;
  /** Hint text below title */
  hint?: string;
  /** Optional CTA */
  action?: { label: string; onClick: () => void };
  /** Error variant */
  error?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Unified empty/error/loading state. Use on all list pages. */
export function EmptyState({ title, hint, action, error, className = '', children }: EmptyStateProps) {
  return (
    <div className={`py-16 text-center ${className}`}>
      <p className={`text-sm font-medium mb-1 ${error ? 'text-destructive' : ''}`}>{title}</p>
      {hint && <p className="text-sm text-muted-foreground mb-4">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-3 py-1 text-sm font-medium border rounded-md hover:bg-accent transition-colors"
        >
          {action.label} →
        </button>
      )}
      {children}
    </div>
  );
}
