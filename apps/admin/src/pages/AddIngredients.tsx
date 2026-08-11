import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2, Plus, ArrowLeft } from 'lucide-react';
import { useInstantCreateIngredient } from '@/hooks/useInstantIngredientMutations';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { toast } from 'sonner';

const UNITS = ['кг', 'л', 'шт'] as const;

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
 return (
  <div className={`flex items-center gap-4 ${className}`}>
   <label className="w-32 text-sm text-muted-foreground shrink-0 sm:w-36">{label}</label>
   <div className="min-w-0 flex-1 max-w-md">{children}</div>
  </div>
 );
}

function SegmentedRow({
 options,
 value,
 onChange,
}: {
 options: readonly string[];
 value: string;
 onChange: (v: string) => void;
}) {
 return (
  <div
   className="inline-flex flex-wrap gap-0.5 rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"

  >
   {options.map((opt) => (
    <button
     key={opt}
     type="button"
     onClick={() => onChange(value === opt ? '' : opt)}
     className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
      value === opt ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
     }`}
     style={value === opt ? {  } : {}}
    >
     {opt}
    </button>
   ))}
  </div>
 );
}

interface IngredientDraft {
  key: number;
  name: string;
  unit: string;
  stockQuantity: string;
  warehouseIds: string[];
}

function emptyDraft(
  key: number,
  defaultWarehouseId: string
): IngredientDraft {
  return {
    key,
    name: '',
    unit: 'кг',
    stockQuantity: '',
    warehouseIds: defaultWarehouseId ? [defaultWarehouseId] : [],
  };
}

let nextKey = 1;

export function AddIngredients() {
 const navigate = useNavigate();
 const [params] = useSearchParams();
 const defaultWarehouse = params.get('warehouse') ?? '';
 const returnToWarehouse = params.get('back') === 'warehouse' && defaultWarehouse;

  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
  const createIngredient = useInstantCreateIngredient();

 const [blocks, setBlocks] = useState<IngredientDraft[]>(() => [
    emptyDraft(nextKey++, defaultWarehouse),
 ]);
 const [saving, setSaving] = useState(false);

 const addBlock = useCallback(() => {
    setBlocks((prev) => [...prev, emptyDraft(nextKey++, defaultWarehouse)]);
  }, [defaultWarehouse]);

 const removeBlock = useCallback(
  (key: number) => {
   setBlocks((prev) => {
      if (prev.length === 1) return [emptyDraft(nextKey++, defaultWarehouse)];
    return prev.filter((b) => b.key !== key);
   });
  },
    [defaultWarehouse]
 );

 const patchBlock = useCallback((key: number, patch: Partial<IngredientDraft>) => {
  setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
 }, []);

 async function handleSave() {
  const valid = blocks.filter((b) => b.name.trim());
  if (valid.length === 0) {
   toast.error('Введите хотя бы одно название');
   return;
  }

  const unitOrDefault = (u: string) => (UNITS as readonly string[]).includes(u) ? u : 'кг';

  setSaving(true);
  try {
   await Promise.all(valid.map((draft) => createIngredient.create({
    name: draft.name.trim(),
    unit: unitOrDefault(draft.unit),
    initialQuantityMilli: Math.round((parseFloat(draft.stockQuantity) || 0) * 1000),
    warehouseIds: draft.warehouseIds,
   })));
  } catch (cause) {
   toast.error('Ошибка: ' + (cause instanceof Error ? cause.message : 'Не удалось добавить ингредиенты'));
   return;
  } finally {
   setSaving(false);
  }

  toast.success(
   valid.length === 1
    ? `Ингредиент «${valid[0].name}» добавлен`
    : `Добавлено ${valid.length} ингредиентов`
  );
  navigate(returnToWarehouse ? '/warehouse' : '/menu/ingredients');
 }

 return (
  <div className="p-8 pb-24 max-w-[640px] [&_button]:cursor-pointer">
   <button
    type="button"
    onClick={() => navigate(returnToWarehouse ? '/warehouse' : '/menu/ingredients')}
    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
   >
    <ArrowLeft className="w-4 h-4" />
    Ингредиенты
   </button>

   <h2 className="text-2xl font-bold mb-1">Добавить ингредиенты</h2>
   <p className="text-sm text-muted-foreground mb-8">
    Заполните карточки и нажмите «Добавить». Пустые названия будут пропущены.
   </p>

   <div className="space-y-6 mb-8">
    {blocks.map((block, index) => (
     <div
      key={block.key}
      className="rounded-xl border border-border/60 bg-background p-6 space-y-4 shadow-sm"
     >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
       <span className="text-sm font-medium text-muted-foreground">
        {blocks.length > 1 ? `Ингредиент ${index + 1}` : 'Новый ингредиент'}
       </span>
       {blocks.length > 1 && (
        <button
         type="button"
         onClick={() => removeBlock(block.key)}
         className="flex items-center gap-1 text-sm text-muted-foreground hover:text-red-600 transition-colors"
        >
         <Trash2 className="w-3.5 h-3.5" />
         Удалить
        </button>
       )}
      </div>

      <Field label="Название">
       <input
        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
        placeholder="Например: Куриное филе"
        value={block.name}
        onChange={(e) => patchBlock(block.key, { name: e.target.value })}
       />
      </Field>

      <Field label="Ед. измерения">
       <SegmentedRow
        options={UNITS}
        value={block.unit}
        onChange={(u) => patchBlock(block.key, { unit: u || 'кг' })}
       />
      </Field>

      <Field label="Остаток на складе">
       <input
        type="number"
        className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm bg-background text-right tabular-nums"
        placeholder="0"
        value={block.stockQuantity}
        onChange={(e) => patchBlock(block.key, { stockQuantity: e.target.value })}
       />
      </Field>


      <Field label="Склады">
       {warehousesPending ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
       ) : warehouses.length > 0 ? (
        <div className="space-y-1.5">
         <p className="text-sm text-muted-foreground">Можно выбрать несколько складов</p>
         {warehouses.map((w) => {
          const active = block.warehouseIds.includes(w.id);
          return (
           <label
            key={w.id}
            className="flex items-center gap-2 text-sm text-foreground"
           >
            <input
             type="checkbox"
             checked={active}
             onChange={() =>
              patchBlock(block.key, {
               warehouseIds: active
                ? block.warehouseIds.filter((id) => id !== w.id)
                : [...block.warehouseIds, w.id],
              })
             }
             className="w-4 h-4"
            />
            {w.name}
           </label>
          );
         })}
        </div>
       ) : (
        <p className="text-sm text-muted-foreground">Нет складов.</p>
       )}
      </Field>
     </div>
    ))}
   </div>

   <button
    type="button"
    onClick={addBlock}
    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-dashed rounded-lg hover:border-foreground hover:text-foreground transition-colors mb-10"
   >
    <Plus className="w-4 h-4" />
    Добавить ещё один
   </button>

   <div className="flex items-center justify-end gap-3 pt-4 border-t">
    <button
     type="button"
     onClick={() => navigate(returnToWarehouse ? `/warehouse/${defaultWarehouse}` : '/menu/ingredients')}
     className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
     Отмена
    </button>
    <button
     type="button"
     disabled={saving}
     onClick={handleSave}
     className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors disabled:opacity-50"
    >
     {saving ? 'Добавление…' : 'Добавить'}
    </button>
   </div>
  </div>
 );
}
