import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCcw, Search, X, PackageCheck, Check } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { EditButton } from '@/components/ui/EditButton';
import { Badge } from '@/components/ui/Badge';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { AddButton } from '@/components/ui/ActionButtons';
import {
 useInstantDeliveriesList as useWarehouseDeliveries,
 type DeliveryRow,
} from '@/hooks/useInstantDeliveriesList';
import {
 useInstantWriteOffsList as useWarehouseWriteOffs,
 type WriteOffRow,
} from '@/hooks/useInstantWriteOffsList';
import {
 useInstantTransfersList as useWarehouseTransfers,
 type TransferRow,
} from '@/hooks/useInstantTransfersList';
import {
 useInstantInventoriesList as useWarehouseInventorySessions,
 type InventoryActRow,
} from '@/hooks/useInstantInventoriesList';
import {
 useInstantReceiveDeliveryBridge as useReceiveDelivery,
 useInstantCancelDeliveryBridge as useCancelDelivery,
 useInstantRestoreDeliveryBridge as useRestoreDelivery,
} from '@/hooks/useInstantDeliveryStatusMutations';
import {
 useInstantPostWriteOffBridge as usePostWriteOff,
 useInstantCancelWriteOffBridge as useCancelWriteOff,
 useInstantRestoreWriteOffBridge as useRestoreWriteOff,
} from '@/hooks/useInstantWriteOffStatusMutations';
import {
 useInstantPostTransferBridge as usePostTransfer,
 useInstantCancelTransferBridge as useCancelTransfer,
 useInstantRestoreTransferBridge as useRestoreTransfer,
} from '@/hooks/useInstantTransferStatusMutations';
import { useInstantWarehouses } from '@/hooks/useInstantWarehouses';
import { getInstantClient } from '@/data/instant';
import { somRounded } from '@/lib/formatSom';

// ─── Helpers ───

function getPositionPlural(count: number) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'позиций';
  if (n1 === 1) return 'позиция';
  if (n1 > 1 && n1 < 5) return 'позиции';
  return 'позиций';
}

// ─── Period filter ───

type Period = 'today' | 'week' | 'month' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'all', label: 'Всё' },
];

function isInPeriod(dateStr: string, period: Period): boolean {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return d >= today;
  if (period === 'week') {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }
  if (period === 'month') {
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);
    return d >= monthAgo;
  }
  return true;
}

// ─── Unified operation type ───

type OpType = 'delivery' | 'write-off' | 'transfer' | 'inventory';

interface UnifiedOp {
  id: string;
  date: string;
  warehouseId: string | null;
  warehouseName: string;
  type: OpType;
  typeLabel: string;
  typeClass: string;
  details: string;
  status: string;
  statusClass: string;
  amount: number | null;
  items: { name: string; quantity: number; unit: string; price?: number; reason?: string; total?: number }[];
  editUrl: string;
}

const TYPE_STYLE: Record<OpType, { label: string; cls: string }> = {
  'delivery':  { label: 'Поставка',      cls: 'text-blue-700 bg-blue-50' },
  'write-off': { label: 'Списание',      cls: 'text-red-700 bg-red-50' },
  'transfer':  { label: 'Перемещение',   cls: 'text-amber-700 bg-amber-50' },
  'inventory': { label: 'Инвентаризация',cls: 'text-emerald-700 bg-emerald-50' },
};

function statusBadge(status: string) {
  if (status === 'Принято' || status === 'Проведено') return 'text-green-600 bg-green-50';
  if (status === 'В пути') return 'text-blue-600 bg-blue-50';
  if (status === 'Черновик') return 'text-amber-600 bg-amber-50';
  if (status === 'Отменено') return 'text-red-600 bg-red-50';
  return 'text-muted-foreground bg-secondary';
}

// ─── Merging ───

function resolveProductCost(costMap: Map<string, number>, productId: string | null): number {
  if (!productId) return 0;
  if (!(costMap instanceof Map)) return 0;
  return costMap.get(productId) ?? 0;
}

function mergeOps(
  deliveries: DeliveryRow[],
  writeOffs: WriteOffRow[],
  transfers: TransferRow[],
  inventories: InventoryActRow[],
  costMap: Map<string, number>,
): UnifiedOp[] {
  const ops: UnifiedOp[] = [];

  for (const d of deliveries) {
    ops.push({
      id: d.id, date: d.date, warehouseId: d.warehouse_id,
      warehouseName: d.warehouse_name || '—',
      type: 'delivery', typeLabel: TYPE_STYLE['delivery'].label,
      typeClass: TYPE_STYLE['delivery'].cls,
      details: `${d.supplier || '—'}, ${d.items.length} ${getPositionPlural(d.items.length)}`,
      status: d.status, statusClass: statusBadge(d.status),
      amount: d.amount,
      items: d.items.map(i => ({
        name: i.name, quantity: i.quantity, unit: i.unit,
        price: i.price, total: i.quantity * i.price,
      })),
      editUrl: `/warehouse/deliveries/${d.id}/edit`,
    });
  }

  for (const w of writeOffs) {
    const woAmount = w.items.reduce(
      (sum, i) => sum + i.quantity * resolveProductCost(costMap, i.product_id),
      0,
    );
    ops.push({
      id: w.id, date: w.date, warehouseId: w.warehouse_id,
      warehouseName: w.warehouse_name || '—',
      type: 'write-off', typeLabel: TYPE_STYLE['write-off'].label,
      typeClass: TYPE_STYLE['write-off'].cls,
      details: `${w.reason_summary || '—'}, ${w.items.length} ${getPositionPlural(w.items.length)}`,
      status: w.status, statusClass: statusBadge(w.status),
      amount: woAmount > 0 ? -woAmount : null,
      items: w.items.map(i => ({
        name: i.name, quantity: i.quantity, unit: i.unit, reason: i.reason,
      })),
      editUrl: `/warehouse/write-offs/${w.id}/edit`,
    });
  }

  for (const t of transfers) {
    ops.push({
      id: t.id, date: t.date, warehouseId: t.fromWarehouseId,
      warehouseName: `${t.fromWarehouse || '—'} → ${t.toWarehouse || '—'}`,
      type: 'transfer', typeLabel: TYPE_STYLE['transfer'].label,
      typeClass: TYPE_STYLE['transfer'].cls,
      details: `${t.fromWarehouse || '—'} → ${t.toWarehouse || '—'}, ${t.items.length} ${getPositionPlural(t.items.length)}`,
      status: t.status, statusClass: statusBadge(t.status),
      amount: null,
      items: t.items.map(i => ({
        name: i.name, quantity: i.quantity, unit: i.unit,
      })),
      editUrl: `/warehouse/transfers/${t.id}/edit`,
    });
  }

  for (const inv of inventories) {
    ops.push({
      id: inv.id, date: inv.date, warehouseId: inv.warehouse_id,
      warehouseName: inv.warehouse || inv.workshop || '—',
      type: 'inventory', typeLabel: TYPE_STYLE['inventory'].label,
      typeClass: TYPE_STYLE['inventory'].cls,
      details: `Результат: ${inv.result > 0 ? '+' : ''}${somRounded(inv.result)} сом`,
      status: inv.status, statusClass: statusBadge(inv.status),
      amount: inv.result,
      items: [],
      editUrl: `/warehouse/inventory`,
    });
  }

  ops.sort((a, b) => b.date.localeCompare(a.date));
  return ops;
}

// ─── Component ───

export function AllOperations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [period, setPeriod] = useState<Period>(
    () => (searchParams.get('period') as Period) || 'month'
  );
  const [typeFilter, setTypeFilter] = useState<OpType | 'all'>(
    () => (searchParams.get('type') as OpType | 'all') || 'all'
  );
  const [whFilter, setWhFilter] = useState<string>(
    () => searchParams.get('warehouse') || 'all'
  );
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const { data: warehouses = [] } = useInstantWarehouses();
  const { data: deliveries = [] } = useWarehouseDeliveries();
  const { data: writeOffs = [] } = useWarehouseWriteOffs();
  const { data: transfers = [] } = useWarehouseTransfers();
  const { data: inventories = [] } = useWarehouseInventorySessions();

  // Product cost map from InstantDB products
  const db = getInstantClient();
  const productQuery = { products: {} } as const;
  const costQuery = db.useQuery(productQuery as unknown as Parameters<typeof db.useQuery>[0]);
  const costMap = (() => {
    const map = new Map<string, number>();
    for (const p of (costQuery.data?.products ?? [])) {
      const rec = p as Record<string, unknown>;
      const cost = Number(rec.costTiyin ?? 0) / 100;
      map.set(String(rec.id), cost);
    }
    return map;
  })();

  const receiveDelivery = useReceiveDelivery();
  const cancelDelivery = useCancelDelivery();
  const restoreDelivery = useRestoreDelivery();
  const postWo = usePostWriteOff();
  const cancelWo = useCancelWriteOff();
  const restoreWo = useRestoreWriteOff();
  const postTransfer = usePostTransfer();
  const cancelTransfer = useCancelTransfer();
  const restoreTransfer = useRestoreTransfer();

  const allOps = useMemo(
    () => mergeOps(deliveries, writeOffs, transfers, inventories, costMap),
    [deliveries, writeOffs, transfers, inventories, costMap]
  );

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    return allOps.filter((op) => {
      if (!isInPeriod(op.date, period)) return false;
      if (typeFilter !== 'all' && op.type !== typeFilter) return false;
      if (whFilter !== 'all' && op.warehouseId !== whFilter) return false;
      if (q) {
        const details = op.details.toLowerCase();
        const wh = op.warehouseName.toLowerCase();
        if (!details.includes(q) && !wh.includes(q)) {
          return op.items.some(i => i.name.toLowerCase().includes(q));
        }
      }
      return true;
    });
  }, [allOps, period, typeFilter, whFilter, q]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || value === 'month') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const isCancelledStatus = (op: UnifiedOp) => op.status === 'Отменено';

  const summary = useMemo(() => {
    const active = filtered.filter(op => !isCancelledStatus(op));
    const dels = active.filter(op => op.type === 'delivery');
    const wos = active.filter(op => op.type === 'write-off');
    const invs = active.filter(op => op.type === 'inventory');

    const delTotal = dels.reduce((s, op) => s + (op.amount ?? 0), 0);
    const woTotal = wos.reduce((s, op) => s + (op.amount ?? 0), 0);
    const invTotal = invs.reduce((s, op) => s + (op.amount ?? 0), 0);

    return { deliveries: dels.length, delTotal, writeOffs: wos.length, woTotal, inventories: invs.length, invTotal };
  }, [filtered]);

  const columns = useMemo<ColumnDef<UnifiedOp, any>[]>(() => [
    {
      id: 'date',
      header: 'Дата',
      cell: ({ row }) => {
        const op = row.original;
        const isCancelled = isCancelledStatus(op);
        return (
          <span className={`text-muted-foreground ${isCancelled ? 'line-through' : ''}`}>
            {new Date(op.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
          </span>
        );
      },
    },
    {
      id: 'warehouse',
      header: 'Склад',
      meta: { align: 'text-left', className: 'text-left' },
      cell: ({ row }) => {
        const op = row.original;
        const isCancelled = isCancelledStatus(op);
        return (
          <span className={`text-muted-foreground truncate block max-w-[80px] ${isCancelled ? 'line-through' : ''}`}>
            {op.warehouseName}
          </span>
        );
      },
    },
    {
      id: 'type',
      header: 'Тип',
      meta: { align: 'text-left', className: 'text-left' },
      cell: ({ row }) => {
        const op = row.original;
        return <Badge className={op.typeClass}>{op.typeLabel}</Badge>;
      },
    },
    {
      id: 'details',
      header: 'Детали',
      meta: { align: 'text-left', className: 'text-left' },
      cell: ({ row }) => {
        const op = row.original;
        const isCancelled = isCancelledStatus(op);
        return (
          <span className={`truncate block ${isCancelled ? 'line-through' : ''}`}>
            {op.details}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: 'Статус',
      meta: { align: 'text-left', className: 'text-left' },
      cell: ({ row }) => {
        const op = row.original;
        return (
          <span className={`text-sm font-medium ${
            op.status === 'Принято' || op.status === 'Проведено' ? 'text-green-600' :
            op.status === 'В пути' ? 'text-blue-600' :
            op.status === 'Черновик' ? 'text-amber-600' :
            op.status === 'Отменено' ? 'text-red-600' :
            'text-muted-foreground'
          }`}>
            {op.status}
          </span>
        );
      },
    },
    {
      id: 'amount',
      header: 'Сумма',
      cell: ({ row }) => {
        const op = row.original;
        const isCancelled = isCancelledStatus(op);
        return (
          <span className={`font-medium ${isCancelled ? 'line-through' : ''}`}>
            {op.amount != null
              ? (op.amount > 0 ? `+${op.amount.toLocaleString()}` : op.amount.toLocaleString()) + ' сом'
              : '—'}
          </span>
        );
      },
      meta: { align: 'text-right' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const op = row.original;
        const isCancelled = isCancelledStatus(op);

        // Primary action
        const primaryAction = op.type === 'delivery' && op.status === 'В пути' ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); receiveDelivery.mutate(op.id); }}
            className="p-2 cursor-pointer rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="Принять поставку"
          >
            <PackageCheck className="w-3.5 h-3.5" />
          </button>
        ) : (op.type === 'write-off' || op.type === 'transfer') && op.status === 'Черновик' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (op.type === 'write-off') postWo.mutate(op.id);
              else postTransfer.mutate(op.id);
            }}
            className="p-2 cursor-pointer rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="Провести"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : !isCancelled ? (
          <EditButton onClick={() => navigate(op.editUrl)} />
        ) : (
          <span className="inline-block w-[30px]" />
        );

        // Cancel / Restore
        const secondaryAction = isCancelled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (op.type === 'delivery') restoreDelivery.mutate(op.id);
              else if (op.type === 'write-off') restoreWo.mutate(op.id);
              else if (op.type === 'transfer') restoreTransfer.mutate(op.id);
            }}
            className="p-2 cursor-pointer rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Восстановить"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (op.type === 'delivery') cancelDelivery.mutate(op.id);
              else if (op.type === 'write-off') cancelWo.mutate(op.id);
              else if (op.type === 'transfer') cancelTransfer.mutate(op.id);
            }}
            className="p-2 cursor-pointer rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Отменить"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        );

        return (
          <div className="flex items-center">
            {primaryAction}
            {secondaryAction}
          </div>
        );
      },
    },
  ], [receiveDelivery, postWo, postTransfer, cancelDelivery, cancelWo, cancelTransfer, restoreDelivery, restoreWo, restoreTransfer, navigate]);

  const canExpand = (op: UnifiedOp) => op.items.length > 0;

  return (
    <div className="p-8">

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Все операции</h2>
        <div className="flex items-center gap-2">
          <AddButton onClick={() => navigate('/warehouse/deliveries/new')} label="+ Поставка" />
          <AddButton onClick={() => navigate('/warehouse/write-offs/new')} label="+ Списание" />
          <AddButton onClick={() => navigate('/warehouse/transfers/new')} label="+ Перемещение" />
          <AddButton onClick={() => navigate('/warehouse/inventory')} label="+ Инвентаризация" />
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="mb-4 space-y-2">
        {/* Search row */}
        <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 w-56">
          <Search className="w-3.5 h-3.5 opacity-40 shrink-0" />
          <input
            className="bg-transparent text-sm outline-none flex-1"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tabs row */}
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentTabs
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(v) => { setPeriod(v); updateParam('period', v); }}
          />

          <SegmentTabs
            options={[
              { value: 'all' as const, label: 'Все' },
              { value: 'delivery' as const, label: 'Поставки' },
              { value: 'write-off' as const, label: 'Списания' },
              { value: 'transfer' as const, label: 'Перемещения' },
              { value: 'inventory' as const, label: 'Инвентаризации' },
            ]}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); updateParam('type', v); }}
          />

          <SegmentTabs
            options={[
              { value: 'all', label: 'Все' },
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ]}
            value={whFilter}
            onChange={(v) => { setWhFilter(v); updateParam('warehouse', v); }}
          />
        </div>
      </div>

      {/* ═══ TABLE ═══ */}
      <DataTable
        data={filtered}
        columns={columns}
        dense
        emptyMessage={
          q || typeFilter !== 'all' || whFilter !== 'all'
            ? 'Ничего не найдено — попробуйте изменить фильтры'
            : 'Операций за период нет — создайте поставку или списание'
        }
        expandedRows={expandedRows}
        onExpandedChange={(rowId) => {
          setExpandedRows(prev => {
            const next = { ...prev };
            if (next[rowId]) {
              delete next[rowId];
            } else {
              next[rowId] = true;
            }
            return next;
          });
        }}
        renderExpandedRow={(row) => {
          const op = row.original;
          if (op.items.length === 0) return null;
          return (
            <table className="w-full max-w-lg text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium py-0.5 pr-2">Ингредиент</th>
                  <th className="text-right font-medium py-0.5 px-2 w-16">Кол-во</th>
                  <th className="text-right font-medium py-0.5 px-2 w-16">Цена</th>
                  <th className="text-right font-medium py-0.5 pl-2 w-20">Итого</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={4} className="py-0.5" /></tr>
                {op.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-0.5 pr-2">
                      {item.name}
                      {item.reason && <span className="text-muted-foreground"> ({item.reason})</span>}
                    </td>
                    <td className="py-0.5 px-2 text-right">{item.quantity} {item.unit}</td>
                    <td className="py-0.5 px-2 text-right">
                      {item.price != null ? `${item.price.toLocaleString('ru-RU')} сом` : '—'}
                    </td>
                    <td className="py-0.5 pl-2 text-right">
                      {item.total != null
                        ? `${(item.total ?? item.quantity * (item.price ?? 0)).toLocaleString('ru-RU')} сом`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }}
        getRowId={(op) => `${op.type}-${op.id}`}
        getRowClassName={(row) => {
          const op = row.original;
          const classes: string[] = ['group'];
          if (isCancelledStatus(op)) classes.push('opacity-50');
          if (canExpand(op) || op.type === 'inventory') classes.push('cursor-pointer');
          return classes.join(' ');
        }}
        onRowClick={(row) => {
          const op = row.original;
          if (canExpand(op)) {
            setExpandedRows(prev => {
              const rowId = `${op.type}-${op.id}`;
              const next = { ...prev };
              if (next[rowId]) {
                delete next[rowId];
              } else {
                next[rowId] = true;
              }
              return next;
            });
          } else if (op.type === 'inventory') {
            navigate(op.editUrl);
          }
        }}
        className="max-w-4xl"
      />

      {/* ═══ SUMMARY ═══ */}
      {(summary.deliveries > 0 || summary.writeOffs > 0 || summary.inventories > 0) && (
        <div className="max-w-4xl mt-2 py-2 text-sm border-t border-border/40">

          {summary.deliveries > 0 && (
            <span className="text-foreground font-medium">
              Поставки <span className="text-emerald-600">+{Math.round(summary.delTotal).toLocaleString()} сом</span>
            </span>
          )}
          {summary.deliveries > 0 && (summary.writeOffs > 0 || summary.inventories > 0) && <span className="mx-1.5">·</span>}
          {summary.writeOffs > 0 && (
            <span className="text-foreground font-medium">
              Списания <span className="text-red-600">−{Math.round(summary.woTotal).toLocaleString()} сом</span>
            </span>
          )}
          {summary.writeOffs > 0 && summary.inventories > 0 && <span className="mx-1.5">·</span>}
          {summary.inventories > 0 && (
            <span className="text-foreground font-medium">
              Инвентаризации{' '}
              <span className={summary.invTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {summary.invTotal >= 0 ? '+' : ''}{Math.round(summary.invTotal).toLocaleString()} сом
              </span>
            </span>
          )}
        </div>
      )}

    </div>
  );
}
