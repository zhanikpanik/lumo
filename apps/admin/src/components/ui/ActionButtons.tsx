interface AddButtonProps {
 onClick: () => void;
 label?: string;
 variant?: 'primary' | 'outline';
}

export function AddButton({ onClick, label = '+ Добавить', variant = 'primary' }: AddButtonProps) {
 return (
  <button
   type="button"
   onClick={onClick}
   className={variant === 'primary'
    ? 'min-h-11 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors'
    : 'min-h-11 px-4 py-1.5 border border-primary/30 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors'}
  >
   {label}
  </button>
 );
}


