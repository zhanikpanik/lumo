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
 useInstantCreateWriteOffBridge as useCreateWriteOff,
 useInstantUpdateWriteOffBridge as useUpdateWriteOff,
} from '@/hooks/useInstantWriteOffMutationBridge';
import { useInstantWriteOffRow as useWarehouseWriteOff } from '@/hooks/useInstantWriteOffRow';
import type { WriteOffRow } from '@/hooks/useInstantWriteOffRow';
import { useWarehouseLines } from '@/hooks/useWarehouseLines';
import { toast } from 'sonner';
import { DecimalSuffixInput } from '@/components/DecimalSuffixInput';
import { parseDecimalField, quantitySuffix } from '@/lib/decimalMask';
import { localDateTimeFromIso, qtyToString } from '@/lib/warehouse-form-utils';

const REASONS = ['Испорчено', 'Просрочка', 'Служебное питание', 'Пересорт', 'Другое'] as const;

interface LineItem {
 key: number;
 product_id: string;
 name: string;
 unit: string;
 quantity: string;
 reason: string;
}

let nextKey = 1;

function emptyLine(): LineItem {
 return { key: nextKey++, product_id: '', name: '', unit: '', quantity: '', reason: REASONS[0] };
}

function linesFromWriteOffItems(items: WriteOffRow['items']): LineItem[] {
 if (!items.length) return [emptyLine()];
 return items.map((it) => ({
  key: nextKey++,
  product_id: it.product_id || '',
  name: it.name,
  unit: it.unit,
  quantity: qtyToString(it.quantity),
  reason: it.reason?.trim() || REASONS[0],
 }));
}

function WriteOffFormInner({
 initialWriteOff,
 preselectedWarehouseId,
}: {
 initialWriteOff: WriteOffRow | null;
 preselectedWarehouseId?: string;
}) {
 const navigate = useNavigate();
 const [warehouseId, setWarehouseId] = useState(
  () => (initialWriteOff as any)?.warehouse_id || preselectedWarehouseId || ''
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
    })),
   [ingRows],
  );
  const { data: warehouses = [], isLoading: warehousesPending } = useInstantWarehouses();
 const createWriteOff = useCreateWriteOff();
 const updateWriteOff = useUpdateWriteOff();

 const editId = initialWriteOff?.id ?? null;

 const [date, setDate] = useState(() =>
  initialWriteOff ? localDateTimeFromIso(initialWriteOff.date).date : new Date().toISOString().slice(0, 10)
 );
 const [time, setTime] = useState(() =>
  initialWriteOff ? localDateTimeFromIso(initialWriteOff.date).time : new Date().toTimeString().slice(0, 5)
 );
 const [comment, setComment] = useState(() => initialWriteOff?.comment ?? '');
 const machine = useFormMachine();

 const { lines, setLines, addRow, removeLine, patchLine, usedIds } = useWarehouseLines(
  emptyLine,
  linesFromWriteOffItems,
  initialWriteOff?.items,
 );

 const reasonOptions = useMemo(() => {
  const o: string[] = [...REASONS];
  for (const l of lines) {
   const r = l.reason?.trim();
   if (r && !o.includes(r)) o.push(r);
  }
  return o;
 }, [lines]);

 function pickIngredient(key: number, ingredientId: string) {
  const ing = ingredients.find((i) => i.id === ingredientId);
  if (!ing) return;
  setLines((prev) =>
   prev.map((l) =>
    l.key === key ? { ...l, product_id: ing.id, name: ing.name, unit: ing.unit } : l
   )
  );
 }

 function goBack() {
  navigate('/warehouse/operations');
 }

 async function handleSave() {
  const validLines = lines.filter((l) => l.product_id && parseDecimalField(l.quantity) > 0);
  if (validLines.length === 0) {
   toast.error('Добавьте хотя бы один ингредиент');
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
    reason: l.reason,
   }));

   if (editId) {
    await updateWriteOff.mutateAsync({
     id: editId,
     date: `${date}T${time}`,
     comment: comment.trim(),
     warehouse_id: warehouseId || undefined,
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Изменения сохранены');
    navigate('/warehouse/operations');
   } else {
    const id = await createWriteOff.mutateAsync({
     date: `${date}T${time}`,
     comment: comment.trim(),
     warehouse_id: warehouseId || undefined,
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Списание создано');
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
   title={editId ? 'Редактирование списания' : 'Новое списание'}
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

    <Field label="Склад">
     {warehousesPending ? (
      <p className="text-sm text-muted-foreground">Загрузка…</p>
     ) : (
      <Tabs value={warehouseId} onValueChange={setWarehouseId}>
       <TabsList className="flex-wrap h-auto">
        {warehouses.map((w) => (
         <TabsTrigger key={w.id} value={w.id}>{w.name}</TabsTrigger>
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
    <div className="hidden sm:flex items-center gap-2 pb-2 mb-1 text-xs font-normal text-foreground">
     <div className="flex-[3] min-w-0">Ингредиент</div>
     <div className="w-24 shrink-0 text-right">Кол-во</div>
     <div className="w-40">Причина</div>
     <div className="w-9" />
    </div>

    <div className="space-y-2">
     {lines.map((line) => (
      <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_2.75rem] items-center gap-2 sm:flex">
       <div className="col-span-3 min-w-0 sm:col-span-1 sm:flex-[3]">
        <SearchableSelect
         ingredients={ingredients}
         valueId={line.product_id || null}
         onSelect={(id) => pickIngredient(line.key, id)}
         excludeIds={usedIds}
        />
       </div>
       <div className="min-w-0 sm:w-24 sm:shrink-0">
        <DecimalSuffixInput
         value={line.quantity}
         onChange={(v) => patchLine(line.key, 'quantity', v)}
         suffix={quantitySuffix(line.unit)}
        />
       </div>
       <div className="min-w-0 sm:w-40">
        <select
         className="w-full px-2 py-1.5 border border-border rounded-lg text-sm "
         value={line.reason}
         onChange={(e) => patchLine(line.key, 'reason', e.target.value)}
        >
         {reasonOptions.map((r) => (
          <option key={r} value={r}>
           {r}
          </option>
         ))}
        </select>
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
  </EditPage>
 );
}

export function NewWriteOff() {
 const navigate = useNavigate();
 const { pathname } = useLocation();
 const [searchParams] = useSearchParams();
 const editMatch = matchPath({ path: '/warehouse/write-offs/:id/edit', end: true }, pathname);
 const editId = editMatch?.params.id;
 const isEdit = Boolean(editId);
  const { data: w, isLoading } = useWarehouseWriteOff(isEdit ? (editId ?? null) : null);
  const preselectedWarehouseId = searchParams.get('warehouse') || undefined;

  if (isEdit && isLoading) {
   return <div className="p-8 text-muted-foreground">Загрузка…</div>;
  }

  if (isEdit && !w) {
   return (
    <div className="p-8 space-y-4">
     <p className="text-muted-foreground">Списание не найдено</p>
     <button
      type="button"
      onClick={() => navigate('/warehouse/operations')}
      className="text-sm text-primary font-medium"
     >
      К списку списаний
     </button>
    </div>
   );
  }

 if (isEdit && w?.status === 'Отменено') {
  return (
   <div className="p-8 max-w-lg space-y-4">
    <p className="text-muted-foreground">Отменённое списание нельзя редактировать.</p>
    <button
     type="button"
     onClick={() => navigate('/warehouse/operations')}
     className="text-sm text-primary font-medium"
    >
     К документу
    </button>
   </div>
  );
 }

 return (
  <WriteOffFormInner
   key={isEdit ? w!.id : 'new'}
   initialWriteOff={isEdit ? w! : null}
   preselectedWarehouseId={preselectedWarehouseId}
  />
 );
}
