import { useState, useEffect } from 'react';

interface IngredientPickerProps {
 ingredients: Array<{ id: string; name: string }>;
 valueId: string | null;
 onSelect: (id: string) => void;
 placeholder?: string;
 disabled?: boolean;
 autoFocus?: boolean;
 excludeIds?: Set<string>;
 className?: string;
}

export function IngredientPicker({
 ingredients,
 valueId,
 onSelect,
 placeholder = 'Поиск ингредиента...',
 disabled = false,
 autoFocus = false,
 excludeIds,
 className = 'w-[200px]',
}: IngredientPickerProps) {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState('');

 useEffect(() => {
  const selected = ingredients.find((i) => i.id === valueId);
  setQuery(selected?.name || '');
 }, [valueId, ingredients]);

 const filtered = (query.trim()
  ? ingredients.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
  : ingredients
 ).filter((i) => !excludeIds?.has(i.id));

 return (
  <div className={`${className} relative`}>
   <input
    className="w-full px-3 py-2 border border-border rounded-lg text-sm "
    placeholder={disabled ? 'Сначала выберите склад' : placeholder}
    value={query}
    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
    onFocus={() => !disabled && setOpen(true)}
    onBlur={() => setTimeout(() => setOpen(false), 150)}
    autoFocus={autoFocus}
    disabled={disabled}
   />
   {open && !disabled && filtered.length > 0 && (
    <div className="absolute top-full left-0 right-0 bg-white border border-border rounded-lg mt-1 shadow-lg z-20 max-h-48 overflow-auto">
     {filtered.slice(0, 8).map((ing) => (
      <button
       key={ing.id}
       type="button"
       className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFF0F4] transition-colors"
       onMouseDown={() => {
        setQuery(ing.name);
        setOpen(false);
        onSelect(ing.id);
       }}
      >
       {ing.name}
      </button>
     ))}
    </div>
   )}
  </div>
 );
}
