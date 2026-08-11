interface AddButtonProps {
 onClick: () => void;
 label?: string;
}

export function AddButton({ onClick, label = '+ Добавить' }: AddButtonProps) {
 return (
  <button
   type="button"
   onClick={onClick}
   className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
  >
   {label}
  </button>
 );
}


