import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { toast } from 'sonner';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { somRounded } from '@/lib/formatSom';
import { operationalStatusLabel } from '@/lib/operationalLabels';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { useInstantWarehouseIngredients } from '@/hooks/useInstantWarehouseIngredients';
import { useVenueId } from '@/hooks/useVenueId';
import {
 useInstantInventoriesList as useWarehouseInventorySessions,
 type InventoryActRow,
} from '@/hooks/useInstantInventoriesList';
import {
 useInstantCancelInventorySession,
 useInstantCreateInventorySession,
 useInstantSaveInventoryLines,
 useInstantPostInventorySession,
} from '@/hooks/useInstantInventoryMutations';
import { getInstantClient } from '@/data/instant';
import {
 fetchAdminInventoryPeriodMovements,
 mergePeriodMovementsIntoCountRows,
 resolveInventoryMovementWindow,
} from '@/lib/inventoryPeriodMovements';
type InventoryUiStatus = string;

type InventoryStep = 'history' | 'setup' | 'counting';

interface CountRow {
 id: string;
 name: string;
 unit: string;
 start: number;
 incoming: number;
 consumption: number;
 writeoff: number;
 theoretical: number;
 actual: string;
 price: number;
}


function getStatusColor(status: InventoryUiStatus) {
 switch (status) {
  case 'Проведено':
   return 'text-green-600';
  case 'Черновик':
   return 'text-amber-600';
  case 'Отменено':
   return 'text-red-600';
  default:
   return 'text-muted-foreground';
 }
}

function SetupField({ label, children }: { label: string; children: React.ReactNode }) {
 return (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
   <label className="text-sm sm:w-36 sm:shrink-0 sm:pt-2">{label}</label>
   <div className="min-w-0 flex-1">{children}</div>
  </div>
 );
 }

/** Fetch counting rows from InstantDB stockItems for a warehouse. */
async function fetchIngredients(warehouseId: string, productIds?: string[]): Promise<CountRow[]> {
  if (!warehouseId) return [];

  const client = getInstantClient();
  const { data: result } = await client.queryOnce({
    stockItems: { $: { where: { 'warehouse.id': warehouseId } }, product: {} },
  });
  const stockItems = result.stockItems;
  let filtered = stockItems;
  if (productIds?.length) {
    const idSet = new Set(productIds);
    filtered = stockItems.filter((s) => idSet.has(String(((s.product as Record<string, unknown>)?.id) ?? '')));
  }

  return filtered.map((s) => {
    const p = (s.product ?? {}) as Record<string, unknown>;
    const stock = Number(s.quantityMilli ?? 0) / 1000;
    const price = Number(p.costTiyin ?? 0) / 100;
    return {
      id: String(p.id ?? ''),
      name: String(p.name ?? ''),
      unit: String(s.unit ?? p.unit ?? 'кг'),
      start: stock,
      incoming: 0,
      consumption: 0,
      writeoff: 0,
      theoretical: stock,
      actual: '',
      price,
    };
  });
}

type LoadCountingOpts = { mode: 'full' | 'partial'; partialIds: string[] };

export function Inventory() {
 const venueId = useVenueId();
 const [step, setStep] = useState<InventoryStep>('history');
 const [search, setSearch] = useState('');
 const [selectedWorkshopId, setSelectedWorkshopId] = useState('');
 const [inventoryType, setInventoryType] = useState<'full' | 'partial'>('full');
 const [partialSelectedIds, setPartialSelectedIds] = useState<string[]>([]);
 const [partialSearch, setPartialSearch] = useState('');
 const [conductDate, setConductDate] = useState(() => new Date().toISOString().slice(0, 10));
 const [conductTime, setConductTime] = useState(() => new Date().toTimeString().slice(0, 5));
 const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
 const [countingItems, setCountingItems] = useState<CountRow[]>([]);
 const [countingRowsLoading, setCountingRowsLoading] = useState(false);
 const [countingError, setCountingError] = useState<string | null>(null);
  const { data: warehouses = [] } = useInstantWarehouses();
  const [movementPeriodHint, setMovementPeriodHint] = useState<string | null>(null);
  const { data: inventories = [], isLoading: invLoading } = useWarehouseInventorySessions();
  const {
   data: partialIngredientList = [],
   isLoading: partialListPending,
  } = useInstantWarehouseIngredients(
   step === 'setup' && inventoryType === 'partial' ? selectedWorkshopId : null,
  );
  const createSession = useInstantCreateInventorySession();
  const saveLines = useInstantSaveInventoryLines();
  const postSession = useInstantPostInventorySession();
  const cancelSession = useInstantCancelInventorySession();
 const [searchParams, setSearchParams] = useSearchParams();

 // Quick-start from dashboard: skip setup, auto-create partial session
 useEffect(() => {
   if (searchParams.get('create') === 'true') {
    setStep('setup');
    setSearchParams({}, { replace: true });
    return;
   }
   const quick = searchParams.get('quick');
   const products = searchParams.get('products');
   const warehouse = searchParams.get('warehouse');
   if (quick !== 'true' || !products || !warehouse || activeSessionId) return;

   const productIds = products.split(',').filter(Boolean);
   if (productIds.length === 0) return;

   let cancelled = false;
   setSelectedWorkshopId(warehouse);
   setInventoryType('partial');
   setPartialSelectedIds(productIds);

   (async () => {
     try {
      const id = await createSession.create({
        operationId: crypto.randomUUID(),
        warehouseId: warehouse,
        inventoryType: 'partial',
        conductedAt: new Date().toISOString(),
      });
       if (cancelled) return;
       setActiveSessionId(id);
       setStep('counting');
       setCountingRowsLoading(true);
       try {
         await loadCountingRows(id, warehouse, { mode: 'partial', partialIds: productIds });
       } finally {
         if (!cancelled) setCountingRowsLoading(false);
       }
       setSearchParams({}, { replace: true });
     } catch (err) {
       if (!cancelled) {
         toast.error('Не удалось создать быструю инвентаризацию');
         setStep('history');
         setSearchParams({}, { replace: true });
       }
     }
   })();

   return () => { cancelled = true; };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const ingredientsForPartialSelect = useMemo(() => {
  const q = partialSearch.trim().toLowerCase();
  const sel = new Set(partialSelectedIds);
  return [...partialIngredientList]
   .filter((i) => sel.has(i.id) || i.name.toLowerCase().includes(q))
   .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
 }, [partialIngredientList, partialSearch, partialSelectedIds]);

 const loadCountingRows = useCallback(
  async (sessionId: string, workshopId: string, opts?: LoadCountingOpts) => {
   setCountingError(null);
   try {
    const attachPeriodMovements = async (baseRows: CountRow[]): Promise<CountRow[]> => {
     if (baseRows.length === 0) {
      setMovementPeriodHint(null);
      return baseRows;
     }
     const warehouseId = workshopId;
     if (!warehouseId) {
      setMovementPeriodHint(null);
      return baseRows;
     }
     const window = await resolveInventoryMovementWindow(sessionId, warehouseId);
     if (!window) {
      setMovementPeriodHint(null);
      return baseRows;
     }
     const map = await fetchAdminInventoryPeriodMovements(
      venueId,
      warehouseId,
      window.pFrom,
      window.pTo
     );
     setMovementPeriodHint(window.label);
     return mergePeriodMovementsIntoCountRows(baseRows, map);
    };

    const { data: detail } = await getInstantClient().queryOnce({
     inventorySessions: {
      $: { where: { id: sessionId }, limit: 1 },
      lines: { product: {} },
     },
    });
    const lines = detail.inventorySessions[0]?.lines ?? [];

    if (lines.length > 0) {
     const baseRows = lines.map((line) => {
      const product = Array.isArray(line.product) ? line.product[0] : line.product;
      const theoretical = line.theoreticalMilli / 1000;
      return {
       id: product?.id ?? line.id,
       name: line.name,
       unit: line.unit,
       start: theoretical,
       incoming: 0,
       consumption: 0,
       writeoff: 0,
       theoretical,
       actual: line.actualMilli == null ? '' : String(line.actualMilli / 1000),
       price: line.unitPriceTiyin / 100,
      };
     });
     const merged = await attachPeriodMovements(baseRows);
     setCountingItems(merged);
     return;
    }

    if (opts?.mode === 'partial') {
     if (!opts.partialIds.length) {
      setMovementPeriodHint(null);
      setCountingItems([]);
      return;
     }
     const baseRows = await fetchIngredients(workshopId, opts.partialIds);
     const merged = await attachPeriodMovements(baseRows);
     setCountingItems(merged);
     return;
    }

    const baseRows = await fetchIngredients(workshopId);
    const merged = await attachPeriodMovements(baseRows);
    setCountingItems(merged);
   } catch (err) {
    setCountingError(err instanceof Error ? err.message : 'Не удалось загрузить позиции');
   }
  },
  [venueId]
 );

 const handleActualChange = (id: string, value: string) => {
  setCountingItems((items) =>
   items.map((item) => (item.id === id ? { ...item, actual: value } : item))
  );
 };

 const handleStartFromSetup = async () => {
  if (!selectedWorkshopId) return;
  if (inventoryType === 'partial' && partialSelectedIds.length === 0) return;
  const id = await createSession.create({
   operationId: crypto.randomUUID(),
   warehouseId: selectedWorkshopId,
   inventoryType: inventoryType,
   conductedAt: new Date(`${conductDate}T${conductTime}`).toISOString(),
  });
  setActiveSessionId(id);
  setStep('counting');
  setCountingRowsLoading(true);
  try {
   await loadCountingRows(id, selectedWorkshopId, {
    mode: inventoryType,
    partialIds: partialSelectedIds,
   });
  } finally {
   setCountingRowsLoading(false);
  }
 };

 const handleContinueDraft = async (inv: InventoryActRow) => {
  if (!inv.warehouse_id) return;
  setActiveSessionId(inv.id);
  setSelectedWorkshopId(inv.warehouse_id);
  setStep('counting');
  setCountingRowsLoading(true);
  try {
   await loadCountingRows(inv.id, inv.warehouse_id);
  } finally {
   setCountingRowsLoading(false);
  }
 };

 const handleDeleteSession = async (id: string) => {
  try {
   await cancelSession.cancel(id);
  } catch (cause) {
   toast.error('Ошибка: ' + (cause instanceof Error ? cause.message : 'Не удалось отменить инвентаризацию'));
   return;
  }
  if (activeSessionId === id) {
   setActiveSessionId(null);
   setCountingItems([]);
  }
 };

 const handlePostCounting = async () => {
  if (!activeSessionId) return;
  await saveLines.save(
   activeSessionId,
   countingItems.map((i) => ({
    productId: i.id,
    name: i.name,
    unit: i.unit,
    theoreticalMilli: Math.round(i.theoretical * 1000),
    actualMilli: Math.round((i.actual === '' ? 0 : parseFloat(i.actual)) * 1000),
    unitPriceTiyin: Math.round(i.price * 100),
   })),
  );
  await postSession.post(activeSessionId, selectedWorkshopId, {
   warehouseId: selectedWorkshopId,
   status: 'draft',
   lines: countingItems.map((i) => ({
    productId: i.id,
    name: i.name,
    unit: i.unit,
    theoreticalMilli: Math.round(i.theoretical * 1000),
    actualMilli: Math.round((i.actual === '' ? 0 : parseFloat(i.actual)) * 1000),
    unitPriceTiyin: Math.round(i.price * 100),
   })),
  });
  toast.success('Инвентаризация проведена');
  setStep('history');
 };

 // --- History columns ---
 const historyColumns = useMemo<ColumnDef<InventoryActRow, any>[]>(() => [
  {
   id: 'date',
   header: 'Дата',
   cell: ({ row }) => (
    <span className="text-sm">
     {new Date(row.original.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
    </span>
   ),
  },
  {
   id: 'warehouse',
   header: 'Склад',
   meta: { align: 'text-left', className: 'text-left' },
   cell: ({ row }) => <span className="text-sm truncate block">{row.original.warehouse}</span>,
  },
  {
   id: 'status',
   header: 'Статус',
   meta: { align: 'text-left', className: 'text-left' },
   cell: ({ row }) => <span className={`text-sm ${getStatusColor(row.original.status)}`}>{operationalStatusLabel(row.original.status)}</span>,
  },
  {
   id: 'type',
   header: 'Тип',
   meta: { align: 'text-left', className: 'text-left' },
   cell: ({ row }) => <span className="text-sm">{row.original.inventory_type === 'partial' ? 'Частичная' : 'Полная'}</span>,
  },
  {
   id: 'result',
   header: 'Результат',
   cell: ({ row }) => {
    const inv = row.original;
    return (
     <span className={`text-sm font-medium ${inv.result < 0 ? 'text-red-600' : 'text-green-600'}`}>
      {inv.result > 0 ? '+' : ''}{somRounded(inv.result)} сом
     </span>
    );
   },
   meta: { align: 'text-right' },
  },
  {
   id: 'actions',
   header: '',
   cell: ({ row }) => {
    const inv = row.original;
    if (inv.status !== 'Черновик') return null;
    return (
     <div className="flex items-center gap-1">
      <button
       type="button"
       onClick={(e) => { e.stopPropagation(); handleContinueDraft(inv); }}
       className="text-sm font-medium text-primary hover:text-primary/70 transition-colors px-2"
      >
       Продолжить
      </button>
      <DeleteButton onClick={() => { handleDeleteSession(inv.id); }} />
     </div>
    );
   },
  },
 ], [handleContinueDraft, handleDeleteSession]);

 // --- Counting columns ---
 const countingColumns = useMemo<ColumnDef<CountRow, any>[]>(() => [
  {
   id: 'name',
   header: 'Наименование',
   meta: { align: 'text-left', className: 'text-left' },
   cell: ({ row }) => <div className="text-sm truncate">{row.original.name}</div>,
  },
  {
   id: 'start',
   header: 'Нач. ост.',
   cell: ({ row }) => <span className="text-sm">{row.original.start} {row.original.unit}</span>,
   meta: { align: 'text-right' },
  },
  {
   id: 'incoming',
   header: 'Поступл.',
   cell: ({ row }) => <span className="text-sm text-blue-600 font-medium">+{row.original.incoming} {row.original.unit}</span>,
   meta: { align: 'text-right' },
  },
  {
   id: 'consumption',
   header: 'Расход',
   cell: ({ row }) => <span className="text-sm text-amber-600 font-medium">-{row.original.consumption} {row.original.unit}</span>,
   meta: { align: 'text-right' },
  },
  {
   id: 'writeoff',
   header: 'Списано',
   cell: ({ row }) => <span className="text-sm text-red-600 font-medium">-{row.original.writeoff} {row.original.unit}</span>,
   meta: { align: 'text-right' },
  },
  {
   id: 'theoretical',
   header: 'План. ост.',
   cell: ({ row }) => <span className="text-sm bg-blue-50/50 py-1 rounded">{row.original.theoretical} {row.original.unit}</span>,
   meta: { align: 'text-right' },
  },
  {
   id: 'actual',
   header: 'Факт. ост.',
   cell: ({ row }) => {
    const item = row.original;
    return (
     <div className="relative">
      <input
       type="number"
       className="w-full pl-2 pr-8 py-0.5 border rounded text-sm bg-background text-right outline-none focus:border-primary"
       placeholder="0.00"
       value={item.actual}
       onChange={(e) => handleActualChange(item.id, e.target.value)}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
       {item.unit}
      </span>
     </div>
    );
   },
   meta: { align: 'text-right' },
  },
  {
   id: 'diff',
   header: 'Разница',
   cell: ({ row }) => {
    const item = row.original;
    if (item.actual === '') return <span className="text-muted-foreground text-sm">—</span>;
    const actualNum = parseFloat(item.actual) || 0;
    const diff = actualNum - item.theoretical;
    const color = diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-muted-foreground';
    const label = (diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)) + ` ${item.unit}`;
    return <span className={`text-sm ${color}`}>{label}</span>;
   },
   meta: { align: 'text-right' },
  },
  {
   id: 'diffSom',
   header: 'Разница, сом',
   cell: ({ row }) => {
    const item = row.original;
    if (item.actual === '') return <span className="text-muted-foreground text-sm">—</span>;
    const actualNum = parseFloat(item.actual) || 0;
    const diff = actualNum - item.theoretical;
    const diffSom = diff * item.price;
    const color = diffSom < 0 ? 'text-red-600' : diffSom > 0 ? 'text-green-600' : 'text-muted-foreground';
    const label = (diffSom > 0 ? `+${somRounded(diffSom)}` : somRounded(diffSom)) + ' сом';
    return <span className={`text-sm ${color}`}>{label}</span>;
   },
   meta: { align: 'text-right' },
  },
 ], [handleActualChange]);

 // --- History ---
 if (step === 'history') {
  const filtered = inventories.filter(
   (inv) =>
    inv.warehouse.toLowerCase().includes(search.toLowerCase()) ||
    inv.date.includes(search)
  );

  return (
   <div className="page-shell [&_button]:cursor-pointer"><div className="flex items-center justify-between mb-6">
     <h2 className="text-2xl font-bold">Инвентаризация</h2>
     <button
      onClick={() => {
       setPartialSelectedIds([]);
       setPartialSearch('');
       setStep('setup');
      }}
      className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
     >
      + Начать инвентаризацию
     </button>
    </div>
   
    <div className="flex items-center gap-2 mb-4">
     <SearchInput value={search} onChange={setSearch} placeholder="Поиск по складу или дате..." className="w-full sm:w-64" />
    </div>
   
    {invLoading && <p className="text-sm text-muted-foreground py-4">Загрузка…</p>}
   
    {!invLoading && (
     <DataTable
      data={filtered}
      columns={historyColumns}
      dense
      emptyMessage="Нет записей"
      className="max-w-4xl"
     />
    )}</div>
  );
 }

 // --- Setup ---
 if (step === 'setup') {
  return (
   <div className="page-shell page-shell--narrow pb-24 [&_button]:cursor-pointer"><button
    type="button"
    onClick={() => {
     setPartialSelectedIds([]);
     setPartialSearch('');
     setStep('history');
    }}
    className="flex items-center gap-1.5 text-sm hover:text-foreground transition-colors mb-8"
   >
    <ArrowLeft className="w-4 h-4" />
    Инвентаризации
   </button>
   
   <h2 className="text-2xl font-bold mb-8">Новая инвентаризация</h2>
   
   <div className="space-y-4 mb-10">
    <SetupField label="Дата">
     <input
      type="date"
      className="min-h-11 w-full px-3 py-2 border rounded-lg text-base bg-background sm:w-40 sm:text-sm"
      value={conductDate}
      onChange={(e) => setConductDate(e.target.value)}
     />
    </SetupField>
   
    <SetupField label="Время">
     <input
      type="time"
      className="min-h-11 w-full px-3 py-2 border rounded-lg text-base bg-background sm:w-32 sm:text-sm"
      value={conductTime}
      onChange={(e) => setConductTime(e.target.value)}
     />
    </SetupField>
   
    <SetupField label="Склад">
     <div
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
   
     >
      {warehouses.map((w) => (
       <button
        key={w.id}
        type="button"
        onClick={() => {
         setSelectedWorkshopId(w.id);
         setPartialSelectedIds([]);
        }}
        className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
         selectedWorkshopId === w.id
          ? 'bg-white text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
        }`}
        
       >
        {w.name}
       </button>
      ))}
     </div>
    </SetupField>
   
    <SetupField label="Тип">
     <div
      className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
   
     >
      <button
       type="button"
       onClick={() => {
        setInventoryType('full');
        setPartialSelectedIds([]);
       }}
       className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
        inventoryType === 'full'
         ? 'bg-white text-foreground shadow-sm'
         : 'text-muted-foreground hover:text-foreground'
       }`}
       
      >
       Полная
      </button>
      <button
       type="button"
       onClick={() => setInventoryType('partial')}
       className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
        inventoryType === 'partial'
         ? 'bg-white text-foreground shadow-sm'
         : 'text-muted-foreground hover:text-foreground'
       }`}
      >
       Частичная
      </button>
     </div>
    </SetupField>
   
    {inventoryType === 'partial' && selectedWorkshopId && (
     <SetupField label="Позиции">
      <div className="space-y-2 max-w-md">
       <p className="text-sm text-muted-foreground">
        Удерживайте Cmd (Mac) или Ctrl (Windows) для нескольких позиций.
       </p>
       <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground opacity-40 shrink-0" />
        <input
         className="bg-transparent text-base outline-none flex-1 min-w-0 sm:text-sm"
         placeholder="Поиск по названию…"
         value={partialSearch}
         onChange={(e) => setPartialSearch(e.target.value)}
        />
       </div>
       {partialListPending ? (
        <p className="text-sm text-muted-foreground py-2">Загрузка…</p>
       ) : (
        <select
         multiple
         size={12}
         className="w-full min-h-[12rem] px-2 py-1 border rounded-lg text-sm bg-background"
         value={partialSelectedIds}
         onChange={(e) =>
          setPartialSelectedIds(
           Array.from(e.target.selectedOptions, (o) => o.value)
          )
         }
        >
         {ingredientsForPartialSelect.map((i) => (
          <option key={i.id} value={i.id}>
           {i.name} · {i.unit}
          </option>
         ))}
        </select>
       )}
      </div>
     </SetupField>
    )}
   </div>
   
   <div className="flex gap-3">
    <button
     type="button"
     disabled={
      !selectedWorkshopId ||
     createSession.loading ||
      (inventoryType === 'partial' && partialSelectedIds.length === 0)
     }
     onClick={handleStartFromSetup}
     className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
     Начать инвентаризацию
    </button>
    <button
     type="button"
     onClick={() => setStep('history')}
     className="px-6 py-2.5 border rounded-lg text-sm hover:bg-secondary transition-colors"
    >
     Отмена
    </button>
   </div></div>
  );
 }

 // --- Counting ---
 const selectedSkladName =
  warehouses.find((w) => w.id === selectedWorkshopId)?.name || 'Склад';

 return (
  <div className="page-shell [&_button]:cursor-pointer"><div className="flex items-center justify-between mb-6">
   <div>
    <button
     type="button"
     onClick={() => {
      setMovementPeriodHint(null);
      setStep('history');
     }}
     className="flex items-center gap-1.5 text-sm hover:text-foreground transition-colors mb-2"
    >
     <ArrowLeft className="w-4 h-4" />
     Инвентаризации
    </button>
    <h2 className="text-2xl font-bold">Инвентаризация: {selectedSkladName}</h2>
    {movementPeriodHint && (
     <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{movementPeriodHint}</p>
    )}
   </div>
   <div className="flex gap-2">
    <button
     type="button"
     disabled={saveLines.loading || postSession.loading}
     onClick={handlePostCounting}
     className="inline-flex cursor-pointer items-center justify-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
     <Check className="w-4 h-4 shrink-0" aria-hidden />
     Провести
    </button>
   </div>
  </div>
  
  {countingError && (
   <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
    {countingError}
   </div>
  )}
  
  <DataTable
   data={countingItems}
   columns={countingColumns}
   dense
   isLoading={countingRowsLoading}
   error={countingError ? new Error(countingError) : null}
   emptyMessage="Нет позиций для сверки"
   className="max-w-4xl"
  /></div>
 );
}
