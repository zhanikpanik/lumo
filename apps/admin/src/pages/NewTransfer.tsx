import { useState, useEffect, useMemo } from 'react';
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
 useInstantCreateTransferBridge as useCreateTransfer,
 useInstantUpdateTransferBridge as useUpdateTransfer,
} from '@/hooks/useInstantTransferMutationBridge';
import { useInstantTransferRow as useWarehouseTransfer } from '@/hooks/useInstantTransferRow';
import type { TransferRow } from '@/hooks/useInstantTransferRow';
import { useWarehouseLines } from '@/hooks/useWarehouseLines';
import { toast } from 'sonner';
import { DecimalSuffixInput } from '@/components/DecimalSuffixInput';
import { parseDecimalField, quantitySuffix } from '@/lib/decimalMask';
import { localDateTimeFromIso, qtyToString } from '@/lib/warehouse-form-utils';

interface LineItem {
 key: number;
 product_id: string;
 name: string;
 unit: string;
 quantity: string;
}

let nextKey = 1;

function emptyLine(): LineItem {
 return { key: nextKey++, product_id: '', name: '', unit: '', quantity: '' };
}

function linesFromTransferItems(items: TransferRow['items']): LineItem[] {
 if (!items.length) return [emptyLine()];
 return items.map((it) => ({
  key: nextKey++,
  product_id: it.product_id || '',
  name: it.name,
  unit: it.unit,
  quantity: qtyToString(it.quantity),
 }));
}

function TransferFormInner({
 initialTransfer,
 preselectedFromWarehouseId,
}: {
 initialTransfer: TransferRow | null;
 preselectedFromWarehouseId?: string;
}) {
 const navigate = useNavigate();
  const { data: warehouses = [] } = useInstantWarehouses();
 const createTransfer = useCreateTransfer();
 const updateTransfer = useUpdateTransfer();

 const editId = initialTransfer?.id ?? null;

 const [fromWarehouseId, setFromWarehouseId] = useState(
  () => initialTransfer?.fromWarehouseId ?? initialTransfer?.fromWorkshopId ?? preselectedFromWarehouseId ?? ''
 );
 const [toWarehouseId, setToWarehouseId] = useState(
  () => initialTransfer?.toWarehouseId ?? initialTransfer?.toWorkshopId ?? ''
 );
 const [date, setDate] = useState(() =>
  initialTransfer ? localDateTimeFromIso(initialTransfer.date).date : new Date().toISOString().slice(0, 10)
 );
 const [time, setTime] = useState(() =>
  initialTransfer ? localDateTimeFromIso(initialTransfer.date).time : new Date().toTimeString().slice(0, 5)
 );
 const [comment, setComment] = useState(() => initialTransfer?.comment ?? '');
 const machine = useFormMachine();

 const { lines, setLines, addRow, removeLine, patchLine, usedIds } = useWarehouseLines(
  emptyLine,
  linesFromTransferItems,
  initialTransfer?.items,
 );

  const {
   data: ingRows = [],
   isLoading: ingredientsListPending,
  } = useInstantWarehouseIngredients(fromWarehouseId || null);

 const ingredients = useMemo(
  () =>
   ingRows.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit || 'кг',
   })),
  [ingRows],
 );

 useEffect(() => {
  if (fromWarehouseId && toWarehouseId === fromWarehouseId) {
   setToWarehouseId('');
  }
 }, [fromWarehouseId, toWarehouseId]);

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
  if (!fromWarehouseId || !toWarehouseId) {
   toast.error('Выберите склады «Откуда» и «Куда»');
   return;
  }
  if (fromWarehouseId === toWarehouseId) {
   toast.error('Склад-источник и склад-назначение должны отличаться');
   return;
  }

  const validLines = lines.filter((l) => l.product_id && parseDecimalField(l.quantity) > 0);
  if (validLines.length === 0) {
   toast.error('Добавьте хотя бы один ингредиент');
   return;
  }

  machine.send({ type: 'SUBMIT' });
  try {
   const payloadItems = validLines.map((l) => ({
    product_id: l.product_id,
    name: l.name,
    quantity: parseDecimalField(l.quantity),
    unit: l.unit,
   }));

   if (editId) {
    await updateTransfer.mutateAsync({
     id: editId,
     from_warehouse_id: fromWarehouseId,
     to_warehouse_id: toWarehouseId,
     date: `${date}T${time}`,
     comment: comment.trim(),
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Изменения сохранены');
    navigate('/warehouse/operations');
   } else {
    await createTransfer.mutateAsync({
     from_warehouse_id: fromWarehouseId,
     to_warehouse_id: toWarehouseId,
     date: `${date}T${time}`,
     comment: comment.trim(),
     items: payloadItems,
    });
    machine.send({ type: 'SUCCESS' });
    toast.success('Перемещение создано');
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
   title={editId ? 'Редактирование перемещения' : 'Новое перемещение'}
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
    <Field label="Откуда">
     <Tabs value={fromWarehouseId} onValueChange={setFromWarehouseId}>
      <TabsList className="flex-wrap h-auto">
       {warehouses.map((w) => (
        <TabsTrigger key={w.id} value={w.id}>{w.name}</TabsTrigger>
       ))}
      </TabsList>
     </Tabs>
    </Field>

    <Field label="Куда">
     <Tabs value={toWarehouseId} onValueChange={setToWarehouseId}>
      <TabsList className="flex-wrap h-auto">
       {warehouses.filter(w => w.id !== fromWarehouseId).map((w) => (
        <TabsTrigger key={w.id} value={w.id}>{w.name}</TabsTrigger>
       ))}
      </TabsList>
     </Tabs>
    </Field>

    <div className="flex items-center gap-4">
          <label className="w-32 text-sm text-foreground shrink-0 sm:w-36">Дата и время</label>
          <div className="flex items-center gap-2">
            <DatePicker value={date} onChange={setDate} />
            <TimePicker value={time} onChange={setTime} />
          </div>
        </div>

    <Field label="Комментарий" topLabel>
     <textarea
      className="w-full max-w-sm px-3 py-2 border border-border rounded-lg text-sm resize-none"
      rows={2}
      placeholder="Необязательно"
      value={comment}
      onChange={(e) => setComment(e.target.value)}
     />
    </Field>
   </div>

   <div className="mb-8">
    <div className="flex items-center gap-2 pb-2 mb-1 text-xs font-normal text-foreground">
     <div className="flex-[3] min-w-0">Ингредиент</div>
     <div className="w-24 shrink-0 text-right">Кол-во</div>
     <div className="w-9" />
    </div>

    <div className="space-y-2">
     {lines.map((line) => (
      <div key={line.key} className="flex items-center gap-2">
       <div className="flex-[3] min-w-0">
        <SearchableSelect
         ingredients={ingredients}
         valueId={line.product_id || null}
         onSelect={(id) => pickIngredient(line.key, id)}
         excludeIds={usedIds}
        />
       </div>
       <div className="w-24 shrink-0">
        <DecimalSuffixInput
         value={line.quantity}
         onChange={(v) => patchLine(line.key, 'quantity', v)}
         suffix={quantitySuffix(line.unit)}
        />
       </div>
       <div className="w-9 flex justify-center">
        <DeleteButton variant="line" onClick={() => removeLine(line.key)} />
       </div>
      </div>
     ))}
    </div>

    <button
     type="button"
     onClick={addRow}
     className="flex items-center gap-1.5 mt-6 px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-secondary transition-colors"
    >
     <Plus className="w-4 h-4" />
     Добавить строку
    </button>
   </div>
  </EditPage>
 );
}

export function NewTransfer() {
 const navigate = useNavigate();
 const { pathname } = useLocation();
 const [searchParams] = useSearchParams();
 const editMatch = matchPath({ path: '/warehouse/transfers/:id/edit', end: true }, pathname);
 const editId = editMatch?.params.id;
 const isEdit = Boolean(editId);
  const { data: t, isLoading } = useWarehouseTransfer(isEdit ? (editId ?? null) : null);
  const preselectedFromWarehouseId = searchParams.get('from') || undefined;

  if (isEdit && isLoading) {
   return <div className="p-8 text-sm text-muted-foreground">Загрузка…</div>;
  }

  if (isEdit && !t) {
   return (
    <div className="p-8 space-y-4">
     <p className="text-sm text-destructive">Перемещение не найдено</p>
     <button
      type="button"
      onClick={() => navigate('/warehouse/operations')}
      className="text-sm text-primary font-medium"
     >
      К списку перемещений
     </button>
    </div>
   );
  }

 if (isEdit && t?.status === 'Отменено') {
  return (
   <div className="p-8 max-w-lg space-y-4">
    <p className="text-muted-foreground">Отменённое перемещение нельзя редактировать.</p>
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
  <TransferFormInner
   key={isEdit ? t!.id : 'new'}
   initialTransfer={isEdit ? t! : null}
   preselectedFromWarehouseId={preselectedFromWarehouseId}
  />
 );
}
