import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstantDeleteProduct } from '@/hooks/useInstantDeleteProduct';
import {
 useInstantIngredient,
 useInstantUpdateIngredient,
} from '@/hooks/useInstantIngredientMutations';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { EditPage } from '@/components/ui/EditPage';
import { Field } from '@/components/ui/Field';
import { toast } from 'sonner';

const UNITS = ['кг', 'л', 'шт'] as const;

function normalizeUnitFromDb(unit: string | null | undefined): string {
 const u = unit?.trim() || 'кг';
 if ((UNITS as readonly string[]).includes(u)) return u;
 if (u === 'г' || u === 'мл') return u === 'мл' ? 'л' : 'кг';
 return 'кг';
}

export function EditIngredient() {
 const { id } = useParams<{ id: string }>();
 const navigate = useNavigate();
 const [params] = useSearchParams();
  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
 const ingredient = useInstantIngredient(id ?? null);
 const updateIngredient = useInstantUpdateIngredient();
 const deleteIngredient = useInstantDeleteProduct();
 const warehouseIdFromContext = params.get('warehouse') ?? '';
 const returnToWarehouse = params.get('back') === 'warehouse' && warehouseIdFromContext;

 const loading = ingredient.isLoading;
 const [saving, setSaving] = useState(false);
 const [name, setName] = useState('');
 const [unit, setUnit] = useState('кг');
 const [warehouseIds, setWarehouseIds] = useState<string[]>([]);

 useEffect(() => {
  if (!ingredient.data) return;
  setName(ingredient.data.name);
  setUnit(normalizeUnitFromDb(ingredient.data.unit));
  setWarehouseIds(ingredient.data.warehouseIds);
 }, [ingredient.data]);

 async function handleSave() {
  if (!id || !name.trim()) { toast.error('Укажите название'); return; }
  const u = (UNITS as readonly string[]).includes(unit) ? unit : 'кг';
  setSaving(true);
  try {
   await updateIngredient.update({
    productId: id,
    name: name.trim(),
    unit: u,
    warehouseIds,
   });
  } catch (cause) {
   toast.error('Ошибка: ' + (cause instanceof Error ? cause.message : 'Не удалось сохранить'));
   return;
  } finally {
   setSaving(false);
  }
  toast.success('Сохранено');
  navigate(returnToWarehouse ? '/warehouse' : '/menu/ingredients');
 }

 async function handleDelete() {
  if (!id) return;
  try {
   await deleteIngredient.remove(id);
  } catch (cause) {
   toast.error('Ошибка: ' + (cause instanceof Error ? cause.message : 'Не удалось удалить'));
   return;
  }
  toast.success('Удалено');
  navigate('/menu/ingredients');
 }

 if (loading) return <div className="p-8 text-muted-foreground">Загрузка…</div>;
 if (!ingredient.data) return <div className="p-8 text-muted-foreground">Ингредиент не найден</div>;

 return (
  <EditPage
   title="Редактирование ингредиента"
   backTo={returnToWarehouse ? '/warehouse' : '/menu/ingredients'}
   onDelete={handleDelete}
   onSave={handleSave}
   saving={saving}
  >
   <Field label="Название">
    <input className="w-full px-3 py-2 border border-border rounded-lg text-sm " value={name} onChange={(e) => setName(e.target.value)} />
   </Field>

   <Field label="Ед. измерения">
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
     {UNITS.map((opt) => (
      <button key={opt} type="button" onClick={() => setUnit(unit === opt ? 'кг' : opt)}
       className={`px-4 py-1.5 rounded-lg text-sm transition-all ${unit === opt ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
       style={unit === opt ? {  } : {}}>
       {opt}
      </button>
     ))}
    </div>
   </Field>


   <Field label="Склады">
    {warehousesPending ? <p className="text-sm text-muted-foreground">Загрузка…</p> :
     warehouses.length > 0 ? (
     <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Можно выбрать несколько складов</p>
      {warehouses.map((w) => {
       const active = warehouseIds.includes(w.id);
       return (
        <label key={w.id} className="flex items-center gap-2 text-sm text-foreground">
         <input type="checkbox" checked={active} onChange={() => setWarehouseIds((prev) => active ? prev.filter((id) => id !== w.id) : [...prev, w.id])} className="w-4 h-4" />
         {w.name}
        </label>
       );
      })}
     </div>
    ) : <p className="text-sm text-muted-foreground">Нет складов.</p>}
   </Field>
  </EditPage>
 );
}
