import { Pencil } from 'lucide-react';

interface EditButtonProps {
  onClick: () => void;
  className?: string;
}

/** Row-level edit button — canonical pattern.
 *  td: py-1.5 px-3 opacity-40 group-hover:opacity-100 transition-opacity
 *  Mirrors DeleteButton variant="row" but with Pencil instead of X.
 */
export function EditButton({ onClick, className = '' }: EditButtonProps) {
  return (
    <button
      type="button"
      aria-label="Редактировать"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-2 rounded-md text-muted-foreground group-hover:bg-secondary hover:bg-accent hover:text-foreground transition-colors cursor-pointer ${className}`}
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}
