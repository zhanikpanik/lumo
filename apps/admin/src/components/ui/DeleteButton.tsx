import { X } from 'lucide-react';

interface DeleteButtonProps {
  onClick: () => void;
  className?: string;
  /** 'row' (default) — table row action. 'line' — smaller, muted for form line items. */
  variant?: 'row' | 'line';
  /** Only for page-level delete — shows text label instead of icon. */
  label?: string;
}

/** Unified delete button. Three modes via props:
 *  - variant='row' (default): icon-only, row-level, table action
 *  - variant='line': icon-only, smaller, muted, for form line items
 *  - label='...': text label, page-level (polar with Save on right)
 */
export function DeleteButton({ onClick, className = '', variant = 'row', label }: DeleteButtonProps) {
  // Page-level: text label
  if (label) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${className}`}
      >
        {label}
      </button>
    );
  }

  // Line-item: smaller, muted
  if (variant === 'line') {
    return (
      <button
        type="button"
        aria-label="Удалить"
        onClick={onClick}
        className={`p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-md hover:bg-red-50 cursor-pointer ${className}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    );
  }

  // Row-level: default — subtle until row hover, then visible button shape
  return (
    <button
      type="button"
      aria-label="Удалить"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-2 rounded-md text-muted-foreground group-hover:bg-secondary hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer ${className}`}
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}
