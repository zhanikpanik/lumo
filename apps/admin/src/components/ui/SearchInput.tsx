import searchIcon from '@/assets/icons/search.svg';

interface SearchInputProps {
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
 className?: string;
}

export function SearchInput({
 value,
 onChange,
 placeholder = 'Быстрый поиск',
 className = '',
}: SearchInputProps) {
 return (
  <div className={`flex min-h-11 items-center gap-2 border rounded-lg px-3 py-1.5 bg-background ${className}`}>
   <img src={searchIcon} className="w-3.5 h-3.5 opacity-40" alt="" />
   <input
    className="min-w-0 bg-transparent text-base outline-none flex-1 sm:text-sm"
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
   />
  </div>
 );
}
