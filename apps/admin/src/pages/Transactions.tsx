import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EditButton } from '@/components/ui/EditButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { DataTable } from '@/components/ui/DataTable';
import { toast } from 'sonner';
import { EditTransactionModal } from '@/pages/CashShifts';
import {
 useInstantCashShifts,
 useInstantShiftTransactions,
 type CashShift,
 type CashTransaction,
 type TransactionType,
} from '@/hooks/useInstantCashShifts';
import { useInstantCashMovements } from '@/hooks/useInstantCashMovements';
import { useInstantAddCashMovement, useInstantDeleteCashMovement } from '@/hooks/useInstantCashMovementMutations';
import { matchShiftIdForTimestamp } from '@/lib/matchShiftForTimestamp';
import { formatSom } from '@/lib/formatSom';
import { TableToolbar } from '@/components/ui/TableToolbar';

const TYPE_LABELS: Record<TransactionType, string> = {
 sale: 'Продажа',
 refund: 'Возврат',
 cancel_refund: 'Отмена возврата',
 float_in: 'Внесение',
 float_out: 'Изъятие',
 income: 'Приход',
 expense: 'Расход',
 collection: 'Инкассация',
 other: 'Прочее',
};

const TYPE_COLOR: Record<TransactionType, string> = {
 sale: 'text-green-600',
 refund: 'text-red-600',
 cancel_refund: 'text-green-600',
 float_in: 'text-green-600',
 float_out: 'text-red-600',
 income: 'text-green-600',
 expense: 'text-red-600',
 collection: 'text-muted-foreground',
 other: 'text-muted-foreground',
};

const NOTE_LABELS: Record<string, string> = {
 payment_insert: 'Внесение наличных',
 float_in: 'Приход',
 float_out: 'Расход',
 sale: 'Продажа',
 refund: 'Возврат',
 opening_balance: 'Открытие смены',
 closing_balance: 'Закрытие смены',
 backfill_from_payments: 'Синхронизация платежей',
 backfill_refund_from_payments: 'Синхронизация возвратов',
};

function humanizeNote(note: string | null | undefined): string {
 if (!note) return '';
 const trimmed = note.trim();
 return NOTE_LABELS[trimmed] || trimmed.replace(/_/g, ' ');
}


function nowLocalISO() {
 const d = new Date();
 const pad = (n: number) => String(n).padStart(2, '0');
 return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateLabel(isoDate: string) {
 const d = new Date(isoDate);
 return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
 shifts: CashShift[];
 onClose: () => void;
}

function AddTransactionModal({ shifts, onClose }: ModalProps) {
 const [type, setType] = useState<'expense' | 'income' | 'collection'>('expense');
 const [amount, setAmount] = useState('');
 const [datetime, setDatetime] = useState(nowLocalISO());
 const [note, setNote] = useState('');
 const [error, setError] = useState('');
 const [linkToShift, setLinkToShift] = useState(true);

 const { add: addTx, loading: isPending } = useInstantAddCashMovement();

 async function handleSave() {
  const amt = parseFloat(amount);
  if (!amount || isNaN(amt) || amt <= 0) { setError('Введите корректную сумму'); return; }
  try {
   const atIso = new Date(datetime).toISOString();
   const shiftId =
    linkToShift ? matchShiftIdForTimestamp(atIso, shifts) : null;
   await addTx({
    type,
    amount: amt,
    note: note.trim(),
    transaction_at: atIso,
    shift_id: shiftId,
   });
   toast.success('Транзакция добавлена');
   onClose();
  } catch (e: unknown) {
   toast.error('Не удалось сохранить');
  }
 }

 return (
  <Modal title="Новая транзакция" onClose={onClose}>
    {/* Type */}
    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Тип</label>
     <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
      {(['expense', 'income', 'collection'] as const).map((t) => (
       <button
        key={t}
        onClick={() => setType(t)}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
         type === t
          ? 'bg-white text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
        }`
       }
       >
        {TYPE_LABELS[t]}
       </button>
      ))}
     </div>
    </div>

    {/* Amount */}
    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Сумма</label>
     <div className="relative">
      <input
       type="number"
       className="w-full px-3 py-2 border rounded-lg text-sm bg-background pr-10 outline-none focus:border-primary transition-colors"
       placeholder="0"
       value={amount}
       onChange={(e) => { setAmount(e.target.value); setError(''); }}
       autoFocus
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">сом</span>
     </div>
     {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>


    {/* Datetime */}
    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Дата и время</label>
     <div className="flex gap-2">
      <input
       type="date"
       className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
       value={datetime.slice(0, 10)}
       onChange={(e) => setDatetime(e.target.value + 'T' + (datetime.slice(11) || '00:00'))}
      />
      <div className="flex items-center gap-1">
       <input
        type="number"
        min={0} max={23}
        className="w-14 px-2 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors text-center"
        value={datetime.slice(11, 13)}
        onChange={(e) => {
         const h = String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, '0');
         setDatetime(datetime.slice(0, 11) + h + ':' + datetime.slice(14, 16));
        }}
       />
       <span className="text-muted-foreground font-medium">:</span>
       <input
        type="number"
        min={0} max={59}
        className="w-14 px-2 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors text-center"
        value={datetime.slice(14, 16)}
        onChange={(e) => {
         const m = String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, '0');
         setDatetime(datetime.slice(0, 11) + datetime.slice(11, 13) + ':' + m);
        }}
       />
      </div>
     </div>
     {(() => {
      const sid = matchShiftIdForTimestamp(new Date(datetime).toISOString(), shifts);
      const s = shifts.find((x) => x.id === sid);
      if (!linkToShift) {
       return <p className="text-sm text-muted-foreground mt-1">Без привязки к смене</p>;
      }
      return sid ? (
       <p className="text-sm text-green-700 mt-1 font-medium">→ Смена: {s?.openTime ?? sid}</p>
      ) : (
       <p className="text-sm text-amber-600 mt-1">Не попадает ни в одну смену (смена не будет указана)</p>
      );
     })()}
    </div>

    <div className="mb-4">
     <label className="flex items-center gap-2 text-sm">
      <input
       type="checkbox"
       checked={linkToShift}
       onChange={(e) => setLinkToShift(e.target.checked)}
       className="rounded border-muted-foreground"
      />
      <span className="text-muted-foreground">Привязать к смене по дате и времени</span>
     </label>
    </div>

    {/* Note */}
    <div className="mb-6">
     <label className="text-sm text-foreground mb-2 block">Комментарий</label>
     <input
      type="text"
      className="w-full px-3 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
      placeholder="Например: оплата поставщику"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
     />
    </div>

    <div className="flex gap-2 justify-end">
     <button
      onClick={onClose}
      className="px-5 py-2.5 border rounded-lg bg-background text-sm hover:bg-secondary transition-colors"
     >
      Закрыть
     </button>
     <button
      onClick={handleSave}
      disabled={isPending}
      className="px-8 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-all disabled:opacity-50 active:shadow-[inset_0_1px_3px_rgba(0,0,0,.2)]"
     >
      {isPending ? 'Добавление...' : 'Добавить'}
     </button>
    </div>
  </Modal>
 );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Transactions() {
 const [showModal, setShowModal] = useState(false);
 const [searchParams, setSearchParams] = useSearchParams();

 useEffect(() => {
  if (searchParams.get('create') !== 'expense') return;
  setShowModal(true);
  setSearchParams({}, { replace: true });
 }, [searchParams, setSearchParams]);
 const [page, setPage] = useState(0);
 const { data: rawTxs = [], isLoading, error, hasNextPage } = useInstantCashMovements({ page });
 const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
 const [search, setSearch] = useState('');

 const txs = useMemo(() => {
   let filtered = rawTxs.map(m => ({
    id: m.id,
    shift_id: m.shiftId,
    type: m.type as TransactionType,
    amount: m.amountTiyin / 100,
    note: m.note,
    transaction_at: m.occurredAt,
   } satisfies CashTransaction));
   if (typeFilter !== 'all') filtered = filtered.filter(tx => tx.type === typeFilter);
   if (search.trim()) {
     const q = search.trim().toLowerCase();
     filtered = filtered.filter(tx =>
       (tx.note && tx.note.toLowerCase().includes(q)) ||
       humanizeNote(tx.note).toLowerCase().includes(q) ||
       TYPE_LABELS[tx.type].toLowerCase().includes(q)
     );
   }
   return filtered;
 }, [rawTxs, typeFilter, search]);
 const { data: shifts = [] } = useInstantCashShifts();
 const { remove: deleteTx } = useInstantDeleteCashMovement();
 const [editTx, setEditTx] = useState<{ id: string; type: string; amount: number; note: string | null; transaction_at: string } | null>(null);

 const shiftById = useMemo(
  () => new Map(shifts.map((s) => [s.id.toLowerCase(), s])),
  [shifts],
 );

 const columns = useMemo<ColumnDef<CashTransaction, any>[]>(() => [
  {
   accessorKey: 'transaction_at',
   header: 'Дата',
   cell: ({ getValue }) => (
    <span className="text-sm text-foreground">{formatDateLabel(getValue<string>())}</span>
   ),
  },
  {
   id: 'shift',
   header: 'Смена',
   cell: ({ row }) => {
    const tx = row.original;
    const shift = tx.shift_id ? shiftById.get(tx.shift_id.toLowerCase()) : undefined;
    if (!tx.shift_id) return <span>—</span>;
    if (!shift) return <Link to={`/cash-shifts?shift=${tx.shift_id}`} className="text-primary hover:text-primary/70 text-sm truncate block">Открыть смену</Link>;
    return (
     <Link to={`/cash-shifts?shift=${tx.shift_id}`} className="text-primary hover:text-primary/70 font-medium truncate block" title={`${shift.openTime} — ${shift.closeTime ?? '…'}`}>
      {shift.openTime}
     </Link>
    );
   },
  },
  {
   id: 'type',
   header: 'Тип',
   cell: ({ row }) => {
    const tx = row.original;
    return (
     <div>
      <span className="text-sm">{TYPE_LABELS[tx.type]}</span>
     </div>
    );
   },
  },
  {
   accessorKey: 'amount',
   header: 'Сумма',
   cell: ({ row }) => {
    const tx = row.original;
    return <span className={`text-sm ${TYPE_COLOR[tx.type]}`}>{formatSom(tx.amount, { maximumFractionDigits: 2 })}</span>;
   },
  },
  {
   id: 'note',
   header: 'Комментарий',
   cell: ({ row }) => {
    const note = row.original.note;
    return <div className="truncate">{note?.trim() ? humanizeNote(note) : '—'}</div>;
   },
  },
  {
   id: 'edit',
   header: '',
   cell: ({ row }) => <EditButton onClick={() => setEditTx(row.original)} />,
  },
  {
   id: 'delete',
   header: '',
   cell: ({ row }) => <DeleteButton onClick={() => deleteTx(row.original.id)} />,
  },
 ], [deleteTx, shiftById]);

 return (
  <div className="page-shell">{showModal && <AddTransactionModal shifts={shifts} onClose={() => setShowModal(false)} />}
  {editTx && <EditTransactionModal tx={editTx} onClose={() => setEditTx(null)} />}
  
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <h2 className="text-2xl font-bold">Транзакции</h2>
   <button
    onClick={() => setShowModal(true)}
    className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
   >
    <Plus className="w-4 h-4" />
    Добавить транзакцию
   </button>
  </div>
  
  <TableToolbar
   search={search}
   onSearchChange={setSearch}
   searchPlaceholder="Поиск по комментарию…"
   resultCount={txs.length}
   onReset={search || typeFilter !== 'all' ? () => { setSearch(''); setTypeFilter('all'); } : undefined}
   filters={(
    <SegmentTabs
      options={[
        { value: 'all' as const, label: 'Все' },
        { value: 'income' as const, label: 'Приход' },
        { value: 'expense' as const, label: 'Расход' },
        { value: 'collection' as const, label: 'Инкассация' },
      ]}
      value={typeFilter}
      onChange={setTypeFilter}
    />
   )}
  />
  
  {txs.length === 0 && !isLoading && !error ? (
   <EmptyState
    title="Транзакций пока нет"
    hint="Добавьте первую транзакцию — приход, расход или инкассацию"
    action={{ label: 'Добавить транзакцию', onClick: () => setShowModal(true) }}
   />
  ) : (
   <>
   <DataTable
    data={txs}
    columns={columns}
    dense
    isLoading={isLoading}
    error={error ? (error instanceof Error ? error : new Error('Не удалось загрузить транзакции')) : null}
    emptyMessage="Нет транзакций по выбранным фильтрам"
    className="max-w-4xl"
   />
   <div className="mt-4 flex max-w-4xl items-center justify-end gap-2">
    <button
     type="button"
     className="min-h-11 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
     disabled={page === 0 || isLoading}
     onClick={() => setPage((current) => Math.max(0, current - 1))}
    >
     Назад
    </button>
    <span className="text-sm text-muted-foreground">Страница {page + 1}</span>
    <button
     type="button"
     className="min-h-11 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
     disabled={!hasNextPage || isLoading}
     onClick={() => setPage((current) => current + 1)}
    >
     Далее
    </button>
   </div>
   </>
  )}</div>
 );
}
