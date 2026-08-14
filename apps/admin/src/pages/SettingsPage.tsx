import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { toast } from 'sonner';
import { useVenue, useUpdateVenue } from '@/hooks/useVenueSettings';
import {
 useTransactionCategories,
 useAddCategory,
 useDeleteCategory,
} from '@/hooks/useTransactionCategories';

export function SettingsPage() {
 const { data: venue, isLoading, isError, error } = useVenue();
 const updateVenue = useUpdateVenue();

 const [name, setName] = useState('');
 const [address, setAddress] = useState('');
 const [phone, setPhone] = useState('');

 useEffect(() => {
  if (venue) {
   setName(venue.name ?? '');
   setAddress(venue.address ?? '');
   setPhone(venue.phone ?? '');
  }
 }, [venue]);

 async function handleSave(e: React.FormEvent) {
  e.preventDefault();
  await updateVenue.mutateAsync({ name, address, phone });
 }

 return (
  <div className="page-shell page-shell--form"><h2 className="text-2xl font-bold mb-2">Настройки</h2>
  <p className="text-sm text-muted-foreground mb-6">
   Название, адрес и телефон заведения.
  </p>
  
  {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
  
  {isError && (
   <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-6">
    <p className="font-medium mb-1">Не удалось загрузить venues</p>
    <p className="text-sm opacity-90">{(error as Error)?.message}</p>
   </div>
  )}
  
  {!isLoading && !isError && venue && (
   <form onSubmit={handleSave} className="space-y-4">
    <div>
     <label className="text-sm font-medium text-muted-foreground">Название</label>
     <input
      className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm "
      value={name}
      onChange={(e) => setName(e.target.value)}
     />
    </div>
    <div>
     <label className="text-sm font-medium text-muted-foreground">Адрес</label>
     <input
      className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm "
      value={address}
      onChange={(e) => setAddress(e.target.value)}
     />
    </div>
    <div>
     <label className="text-sm font-medium text-muted-foreground">Телефон</label>
     <input
      className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm "
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
     />
    </div>
    {updateVenue.isSuccess && (
     <p className="text-sm text-green-600">Сохранено</p>
    )}
    {updateVenue.isError && (
     <p className="text-sm text-destructive">{(updateVenue.error as Error)?.message}</p>
    )}
    <button
     type="submit"
     disabled={updateVenue.isPending}
     className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
    >
     {updateVenue.isPending ? 'Применение…' : 'Применить'}
    </button>
   </form>
  )}
  
  <hr className="my-8 border-muted/30" />
  <TransactionCategoriesSection /></div>
 );
}

// ─── Transaction Categories ──────────────────────────────────────────────────

function TransactionCategoriesSection() {
 const { data: categories = [], isLoading, isError } = useTransactionCategories();
 const addCat = useAddCategory();
 const deleteCat = useDeleteCategory();

 const [newName, setNewName] = useState('');
 const [newType, setNewType] = useState<'expense' | 'income'>('expense');

 async function handleAdd() {
  const trimmed = newName.trim();
  if (!trimmed) return;
  try {
   await addCat.mutateAsync({ name: trimmed, type: newType });
   setNewName('');
  } catch (e: unknown) {
   toast.error(e instanceof Error ? e.message : 'Не удалось создать');
  }
 }

 const expenseCats = categories.filter((c) => c.type === 'expense');
 const incomeCats = categories.filter((c) => c.type === 'income');

 return (
  <div>
   <h3 className="text-lg font-bold mb-1">Категории транзакций</h3>
   <p className="text-sm text-muted-foreground mb-5">
    Категории для расхода и прихода в кассовых сменах. Инкассация не требует категории.
   </p>

   {/* Add form */}
   <div className="flex items-end gap-2 mb-6">
    <div className="flex-1 min-w-0">
     <label className="text-sm font-medium text-muted-foreground block mb-1">Название</label>
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary transition-colors"
      placeholder="Хоз. расходы"
      value={newName}
      onChange={(e) => setNewName(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
     />
    </div>
    <div>
     <label className="text-sm font-medium text-muted-foreground block mb-1">Тип</label>
     <select
      className="px-3 py-2 border border-border rounded-lg text-sm outline-none"
      value={newType}
      onChange={(e) => setNewType(e.target.value as 'expense' | 'income')}
     >
      <option value="expense">Расход</option>
      <option value="income">Приход</option>
     </select>
    </div>
    <button
     type="button"
     disabled={addCat.isPending || !newName.trim()}
     onClick={handleAdd}
     className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
    >
     <Plus className="w-4 h-4" />
     Добавить
    </button>
   </div>

   {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
   {isError && <p className="text-sm text-destructive">Не удалось загрузить категории</p>}

   <div className="grid grid-cols-2 gap-8">
    <CategoryList
     title="Расход"
     items={expenseCats}
     onDelete={async (id) => {
      try { await deleteCat.mutateAsync(id); }
      catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
     }}
     deleting={deleteCat.isPending}
    />
    <CategoryList
     title="Приход"
     items={incomeCats}
     onDelete={async (id) => {
      try { await deleteCat.mutateAsync(id); }
      catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
     }}
     deleting={deleteCat.isPending}
    />
   </div>
  </div>
 );
}

function CategoryList({
 title,
 items,
 onDelete,
 deleting,
}: {
 title: string;
 items: { id: string; name: string }[];
 onDelete: (id: string) => void;
 deleting: boolean;
}) {
 return (
  <div>
   <h4 className="text-sm font-medium text-foreground mb-2">{title}</h4>
   {items.length === 0 && (
    <p className="text-sm text-muted-foreground">Нет категорий</p>
   )}
   <div className="space-y-1">
    {items.map((c) => (
     <div
      key={c.id}
      className="group flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-muted/10 transition-colors"
     >
      <span className="text-sm">{c.name}</span>
      <DeleteButton variant="line" onClick={() => onDelete(c.id)} />
     </div>
    ))}
   </div>
  </div>
 );
}
