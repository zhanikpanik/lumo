import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import {
 Command,
 CommandEmpty,
 CommandGroup,
 CommandInput,
 CommandItem,
 CommandList,
} from '@/components/shadcn/command';
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from '@/components/shadcn/popover';

interface Ingredient {
 id: string;
 name: string;
}

interface SearchableSelectProps {
 ingredients: Ingredient[];
 valueId: string | null;
 onSelect: (id: string) => void;
 placeholder?: string;
 disabled?: boolean;
 excludeIds?: Set<string>;
}

export function SearchableSelect({
 ingredients,
 valueId,
 onSelect,
 placeholder = 'Поиск ингредиента...',
 disabled = false,
 excludeIds,
}: SearchableSelectProps) {
 const [open, setOpen] = useState(false);
 const selected = ingredients.find((i) => i.id === valueId);
 const filtered = ingredients.filter((i) => !excludeIds?.has(i.id));

 return (
  <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
   <PopoverTrigger asChild>
    <Button
     variant="outline"
     role="combobox"
     aria-expanded={open}
     disabled={disabled}
     className="w-full justify-between px-3 py-2 h-auto font-normal text-sm border-border rounded-lg"
    >
     <span className={selected ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
      {selected?.name || (disabled ? 'Сначала выберите склад' : placeholder)}
     </span>
     <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
   </PopoverTrigger>
   <PopoverContent className="w-[250px] p-0" align="start">
    <Command>
     <CommandInput placeholder={placeholder} />
     <CommandList>
      <CommandEmpty>Ничего не найдено</CommandEmpty>
      <CommandGroup>
       {filtered.slice(0, 12).map((ing) => (
        <CommandItem
         key={ing.id}
         value={ing.name}
         onSelect={() => {
          onSelect(ing.id);
          setOpen(false);
         }}
        >
         {ing.name}
        </CommandItem>
       ))}
      </CommandGroup>
     </CommandList>
    </Command>
   </PopoverContent>
  </Popover>
 );
}
