import { useState, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams, matchPath } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useFormMachine } from '@/hooks/useFormMachine';
import { EditPage } from '@/components/ui/EditPage';
import { Field } from '@/components/ui/Field';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { SearchableSelect } from '@/components/shadcn/searchable-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { DatePicker } from '@/components/shadcn/date-picker';
import { TimePicker } from '@/components/shadcn/time-picker';
import { useInstantWarehouseIngredients } from '@/hooks/useInstantWarehouseIngredients';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import {
 useInstantCreateDeliveryBridge as useCreateDelivery,
 useInstantUpdateDeliveryBridge as useUpdateDelivery,
} from '@/hooks/useInstantDeliveryMutationBridge';
import { useInstantDeliveryRow as useWarehouseDelivery } from '@/hooks/useInstantDeliveryRow';
import type { DeliveryRow } from '@/hooks/useInstantDeliveryRow';
import { useWarehouseLines } from '@/hooks/useWarehouseLines';
import { toast } from 'sonner';
import { DecimalSuffixInput } from '@/components/DecimalSuffixInput';
import { parseDecimalField, quantitySuffix } from '@/lib/decimalMask';
import { localDateTimeFromIso, qtyToString } from '@/lib/warehouse-form-utils';
import { formatSom } from '@/lib/formatSom';

interface LineItem {
 key: number;
 product_id: string;
 name: string;
 unit: string;
 quantity: string;
 price: string;
 sum: string;
}

function roundMoney(n: number): string {
 if (!Number.isFinite(n)) return '';
 return String(Math.round(n * 100) / 100);
}

let nextKey = 1;

function emptyLine(): LineItem {
 return { key: nextKey++, product_id: '', name: '', unit: '', quantity: '', price: '', sum: '' };
}

function linesFromDeliveryItems(items: DeliveryRow['items']): LineItem[] {
 if (!items.length) return [emptyLine()];
 return items.map((it) => {
  const q = it.quantity;
  const p = it.price;
  return {
   key: nextKey++,
   product_id: it.product_id || '',
   name: it.name,
   unit: it.unit,
   quantity: qtyToString(q),
   price: roundMoney(p),
   sum: roundMoney(q * p),
  };
 });
}

function DeliveryFormInner({
 initialDelivery,
 preselectedWarehouseId,
}: {
 initialDelivery: DeliveryRow | null;
 preselectedWarehouseId?: string;
}) {
 const navigate = useNavigate();
 const [warehouseId, setWarehouseId] = useState(
  () => (initialDelivery as any)?.warehouse_id || preselectedWarehouseId || ''
 );
  const {
   data: ingRows = [],
   isLoading: ingredientsListPending,
  } = useInstantWarehouseIngredients(warehouseId || null);
 const ingredients = useMemo(
  () =>
   ingRows.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit || 'кг',
    price: Number(i.price) || 0,
   })),
  [ingRows],
 );
  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();

 const editId = initialDelivery?.id ?? null;

 const [supplier, setSupplier] = useState(() => initialDelivery?.supplier ?? '');
 const [date, setDate] = useState(() =>
  initialDelivery ? localDateTimeFromIso(initialDelivery.date).date : new Date().toISOString().slice(0, 10)
 );
 const [time, setTime] = useState(() =>
  initialDelivery ? localDateTimeFromIso(initialDelivery.date).time : new Date().toTimeString().slice(0, 5)
 );
 const [comment, setComment] = useState(() => initialDelivery?.comment ?? '');
 const machine = useFormMachine();

 const { lines, setLines, addRow, removeLine, usedIds } = useWarehouseLines(
  emptyLine,
  linesFromDeliveryItems,
  initialDelivery?.items,
 );

 function pickIngredient(key: number, ingredientId: string) {
  const ing = ingredients.find((i) => i.id === ingredientId);
  if (!ing) return;
  setLines((prev) =>
   prev.map((l) => {
    if (l.key !== key) return l;
    const q = parseDecimalField(l.quantity);
    const p = Number(ing.price) || 0;
    const priceStr = roundMoney(Number(ing.price) || 0);
    const sumStr = q > 0 && p ? roundMoney(q * p) : l.sum;
    return {
     ...l,
     product_id: ing.id,
     name: ing.name,
     unit: ing.unit,
     price: priceStr,
     sum: sumStr,
    };
   })
  );
 }

 function updateQuantity(key: number, quantity: string) {
  setLines((prev) =>
   prev.map((l) => {
    if (l.key !== key) return l;
    const q = parseDecimalField(quantity);
    const p = parseDecimalField(l.price);
    const s = parseDecimalField(l.sum);
    if (q > 0 && p > 0) {
     return { ...l, quantity, sum: roundMoney(q * p) };
    }
    if (q > 0 && s > 0) {
     return { ...l, quantity, price: roundMoney(s / q) };
    }
    return { ...l, quantity };
   })
  );
 }

 function updatePrice(key: number, price: string) {
  setLines((prev) =>
   prev.map((l) => {
    if (l.key !== key) return l;
    const q = parseDecimalField(l.quantity);
    const p = parseDecimalField(price);
    if (q > 0) {
     return { ...l, price, sum: roundMoney(q * p) };
    }
    return { ...l, price };
   })
  );
 }

 function updateSum(key: number, sum: string) {
  setLines((prev) =>
   prev.map((l) => {
    if (l.key !== key) return l;
    const q = parseDecimalField(l.quantity);
    const s = parseDecimalField(sum);
    if (q > 0 && sum.trim() !== '') {
     return { ...l, sum, price: roundMoney(s / q) };
    }
    return { ...l, sum };
   })
  );
 }

 const total = lines.reduce((acc, l) => {
  const q = parseDecimalField(l.quantity);
  const p = parseDecimalField(l.price);
  if (q > 0) return acc + q * p;
  return acc;
 }, 0);

 function goBack() {
  navigate('/warehouse/operations');
 }

 async function handleSave() {
  const validLines = lines.filter((l) => l.product_id && parseDecimalField(l.quantity) > 0);
  if (validLines.length === 0) {
   toast.error('Добавьте хотя бы один ингредиент');
   return;
  }
  if (!supplier.trim()) {
   toast.error('Укажите поставщика');
   return;
  }
  if (!warehouseId) {
   toast.error('Выберите склад');
   return;
  }

  machine.send({ type: 'SUBMIT' });
  try {
   const payloadItems = validLines.map((l) => ({
    product_id: l.product_id,
    name: l.name,
    quantity: parseDecimalField(l.quantity),
    unit: l.unit,
    price: parseDecimalField(l.price),
   }));

   if (editId) {
    await updateDelivery.mutateAsync({
     id: editId,
     supplier: supplier.trim(),
     date: `${date}T${time}`,
     comment: comment.trim(),
     warehouse_id: warehouseId || undefined,
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Изменения сохранены');
    navigate('/warehouse/operations');
   } else {
    const id = await createDelivery.mutateAsync({
     supplier: supplier.trim(),
     date: `${date}T${time}`,
     comment: comment.trim(),
     warehouse_id: warehouseId || undefined,
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Поставка создана');
    navigate('/warehouse/operations');
   }
  } catch (e: unknown) {
   const msg = (e as Error)?.message || 'неизвестная ошибка';
   machine.send({ type: 'ERROR', message: msg });
   toast.error('Ошибка: ' + msg);
  }
 }

 return (
  <EditPage
   title={editId ? 'Редактирование поставки' : 'Новая поставка'}
   backTo={goBack}
   onSave={handleSave}
   saving={machine.isBusy}
  >
   {machine.isError && machine.context.errorMessage && (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-center justify-between gap-3">
     <span>{machine.context.errorMessage}</span>
     <button
      type="button"
      onClick={() => machine.send({ type: 'RETRY' })}
      className="text-sm font-medium underline whitespace-nowrap shrink-0"
     >
      Попробовать снова
     </button>
    </div>
   )}
   <div className="space-y-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
     <label className="text-sm text-foreground sm:w-36 sm:shrink-0">Дата и время</label>
     <div className="flex flex-wrap items-center gap-2">
      <DatePicker value={date} onChange={setDate} />
      <TimePicker value={time} onChange={setTime} />
     </div>
    </div>

    <Field label="Поставщик">
     <input
      className="w-full px-3 py-2 border border-border rounded-lg text-base sm:max-w-sm sm:text-sm"
      placeholder="Название компании"
      value={supplier}
      onChange={(e) => setSupplier(e.target.value)}
     />
    </Field>

    <Field label="Склад">
     {warehousesPending ? (
      <p className="text-sm text-muted-foreground">Загрузка…</p>
     ) : (
      <Tabs value={warehouseId} onValueChange={setWarehouseId}>
       <TabsList className="flex-wrap h-auto">
        {warehouses.map((w) => (
         <TabsTrigger key={w.id} value={w.id}>
          {w.name}
         </TabsTrigger>
        ))}
       </TabsList>
      </Tabs>
     )}
    </Field>

    <Field label="Комментарий" topLabel>
     <textarea
      className="w-full px-3 py-2 border border-border rounded-lg text-base resize-none sm:max-w-sm sm:text-sm"
      rows={2}
      placeholder="Необязательно"
      value={comment}
      onChange={(e) => setComment(e.target.value)}
     />
    </Field>
   </div>

   <div className="mb-8">
    {!warehouseId && (
     <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Выберите склад, чтобы открыть список ингредиентов.
     </div>
    )}
    {warehouseId && !ingredientsListPending && ingredients.length === 0 && (
     <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-center justify-between gap-3">
      <span>Для этого склада пока не назначены ингредиенты.</span>
      <button
       type="button"
       onClick={() => navigate('/warehouse/operations')}
       className="px-3 py-1 text-sm font-medium border rounded-md hover:bg-secondary transition-colors whitespace-nowrap"
       >
       Открыть склад
      </button>
     </div>
    )}

    <div className="hidden sm:flex items-center gap-2 pb-2 mb-1 text-xs font-normal text-foreground">
     <div className="flex-[3] min-w-0">Ингредиент</div>
     <div className="w-24 shrink-0 text-right">Кол-во</div>
     <div className="w-28 shrink-0 text-right">Цена</div>
     <div className="w-28 shrink-0 text-right">Сумма</div>
     <div className="w-9 shrink-0" />
    </div>

    <div className="space-y-2">
     {lines.map((line) => (
      <div key={line.key} className="grid grid-cols-[repeat(3,minmax(0,1fr))_2.75rem] items-center gap-2 sm:flex">
       <div className="col-span-4 min-w-0 sm:col-span-1 sm:flex-[3]">
        <SearchableSelect
         ingredients={ingredients}
         valueId={line.product_id || null}
         onSelect={(id) => pickIngredient(line.key, id)}
         excludeIds={usedIds}
         disabled={!warehouseId}
        />
       </div>
       <div className="min-w-0 sm:w-24 sm:shrink-0">
        <DecimalSuffixInput
         value={line.quantity}
         onChange={(v) => updateQuantity(line.key, v)}
         suffix={quantitySuffix(line.unit)}
        />
       </div>
       <div className="min-w-0 sm:w-28 sm:shrink-0">
        <DecimalSuffixInput
         value={line.price}
         onChange={(v) => updatePrice(line.key, v)}
         suffix="сом"
        />
       </div>
       <div className="min-w-0 sm:w-28 sm:shrink-0">
        <DecimalSuffixInput
         value={line.sum}
         onChange={(v) => updateSum(line.key, v)}
         suffix="сом"
         bold
        />
       </div>
       <div className="flex size-11 items-center justify-center sm:w-9">
        <DeleteButton variant="line" onClick={() => removeLine(line.key)} />
       </div>
      </div>
     ))}
    </div>

    <button
     type="button"
     onClick={addRow}
     className="flex min-h-11 items-center gap-1.5 mt-6 px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-secondary transition-colors"
    >
     <Plus className="w-4 h-4" />
     Добавить строку
    </button>
   </div>

   {total > 0 && (
    <div className="flex justify-end mb-8">
     <div className="text-sm text-muted-foreground">
      Итого:{' '}
      <span className="text-foreground font-bold text-base">
       {formatSom(total)}
      </span>
     </div>
    </div>
   )}
  </EditPage>
 );
}

export function NewDelivery() {
 const navigate = useNavigate();
 const { pathname } = useLocation();
 const [searchParams] = useSearchParams();
 const editMatch = matchPath({ path: '/warehouse/deliveries/:id/edit', end: true }, pathname);
 const editId = editMatch?.params.id;
 const isEdit = Boolean(editId);
  const { data: d, isLoading } = useWarehouseDelivery(isEdit ? (editId ?? null) : null);
  const preselectedWarehouseId = searchParams.get('warehouse') || undefined;

  if (isEdit && (isLoading || !d)) {
   if (isLoading) return <div className="p-8 text-muted-foreground">Загрузка…</div>;
   return (
    <div className="p-8 space-y-4">
     <p className="text-muted-foreground">Поставка не найдена</p>
     <button
      type="button"
      onClick={() => navigate('/warehouse/operations')}
      className="text-sm text-primary font-medium"
     >
      ← Назад к операциям
     </button>
    </div>
   );
  }

 if (isEdit && d?.status === 'Отменено') {
  return (
   <div className="p-8 max-w-lg space-y-4">
    <p className="text-muted-foreground">Отменённую поставку нельзя редактировать.</p>
    <button
     type="button"
     onClick={() => navigate('/warehouse/operations')}
     className="text-sm text-primary font-medium"
    >
     Все операции
    </button>
   </div>
  );
 }

 return (
  <DeliveryFormInner
   key={isEdit ? d!.id : 'new'}
   initialDelivery={isEdit ? d! : null}
   preselectedWarehouseId={preselectedWarehouseId}
  />
 );
}
