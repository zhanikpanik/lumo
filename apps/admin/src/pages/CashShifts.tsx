import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, ChevronDown, Plus } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EditButton } from '@/components/ui/EditButton';
import { Modal } from '@/components/ui/Modal';
import { DecimalSuffixInput } from '@/components/DecimalSuffixInput';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { DataTable } from '@/components/ui/DataTable';
import { toast } from 'sonner';
import {
 useInstantShiftTransactions,
 useInstantCashShifts,
 type CashShift,
 type CashTransaction,
 type TransactionType,
} from '@/hooks/useInstantCashShifts';
import { useInstantAddCashMovement, useInstantDeleteCashMovement, useInstantUpdateCashMovement } from '@/hooks/useInstantCashMovementMutations';
import { useInstantUpdateShift } from '@/hooks/useInstantShiftUpdate';
import { matchShiftIdForTimestamp } from '@/lib/matchShiftForTimestamp';

function formatCurrency(amount: number | null) {
 if (amount === null) return '';
 const formatted = amount.toLocaleString('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
 });
 return `${formatted} с`;
}

function formatDatetime(iso: string) {
 const d = new Date(iso);
 return d.toLocaleString('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
 });
}

function nowLocalISO() {
 const d = new Date();
 const pad = (n: number) => String(n).padStart(2, '0');
 return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

const TYPE_COLOR: Record<TransactionType, string> = {
 sale: 'text-success',
 refund: 'text-destructive',
 cancel_refund: 'text-success',
 float_in: 'text-success',
 float_out: 'text-destructive',
 income: 'text-success',
 expense: 'text-destructive',
 collection: 'text-muted-foreground',
 other: 'text-muted-foreground',
};

const TYPE_AMOUNT_COLOR: Record<TransactionType, string> = {
 sale: 'text-success',
 refund: 'text-destructive',
 cancel_refund: 'text-success',
 float_in: 'text-success',
 float_out: 'text-destructive',
 income: 'text-success',
 expense: 'text-destructive',
 collection: 'text-destructive',
 other: '',
};

// ─── Add Transaction Modal ────────────────────────────────────────────────────

interface AddModalProps {
 shifts: CashShift[];
 defaultDatetime?: string;
 onClose: () => void;
}

function AddTransactionModal({ shifts, defaultDatetime, onClose }: AddModalProps) {
 const [type, setType] = useState<'expense' | 'income' | 'collection'>('expense');
 const [amount, setAmount] = useState('');
 const [datetime, setDatetime] = useState(defaultDatetime ?? nowLocalISO());
 const [note, setNote] = useState('');
 const [error, setError] = useState('');

 const { add: addTx, loading: isPending } = useInstantAddCashMovement();

 async function handleSave() {
  const amt = parseFloat(amount);
  if (!amount || isNaN(amt) || amt <= 0) {
   setError('Введите корректную сумму');
   return;
  }
  const shiftId = matchShiftIdForTimestamp(new Date(datetime).toISOString(), shifts);
  try {
   await addTx({
    type,
    amount: amt,
    note: note.trim(),
    transaction_at: new Date(datetime).toISOString(),
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
     <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: '#FAFAFA', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' }}
     >
      {(['expense', 'income', 'collection'] as const).map((t) => (
       <button
        key={t}
        onClick={() => setType(t)}
        className={`px-4 py-1.5 rounded-md text-sm transition-all cursor-pointer ${
         type === t
          ? 'bg-white text-foreground'
          : 'text-muted-foreground hover:text-foreground'
        }`}
        style={type === t ? { boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' } : {}}
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
     {error && <p className="text-sm text-destructive mt-1">{error}</p>}
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
      const s = shifts.find(x => x.id === sid);
      return sid ? (
       <p className="text-sm text-success mt-1 font-medium">→ Смена ({s?.openTime})</p>
      ) : (
       <p className="text-sm text-warning mt-1">Не попадает ни в одну смену</p>
      );
     })()}
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

    <div className="flex gap-2">
     <button
      onClick={handleSave}
      disabled={isPending}
      className="flex-1 py-2.5 bg-foreground text-background rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
     >
      {isPending ? 'Сохранение...' : 'Сохранить'}
     </button>
     <button
      onClick={onClose}
      className="px-5 py-2.5 border-2 rounded-xl font-bold text-sm hover:bg-secondary transition-colors"
     >
      Отмена
     </button>
    </div>
  </Modal>
 );
}

type ShiftBoundaryEditMode = 'open' | 'close';

function ShiftBoundaryEditModal({
 mode,
 shift,
 onClose,
}: {
 mode: ShiftBoundaryEditMode;
 shift: CashShift;
 onClose: () => void;
}) {
 const { update: updateShift, loading: isSaving } = useInstantUpdateShift();
 const [amountStr, setAmountStr] = useState('');
 const [noteStr, setNoteStr] = useState('');

 useEffect(() => {
  if (mode === 'open') {
   setAmountStr(String(shift.startBalance).replace('.', ','));
   setNoteStr(shift.openingNote?.trim() ? shift.openingNote : '');
  } else {
   setAmountStr(
    shift.closingCashCount != null
     ? String(shift.closingCashCount).replace('.', ',')
     : '',
   );
   setNoteStr(shift.closingNote?.trim() ? shift.closingNote : '');
  }
 }, [mode, shift.id, shift.startBalance, shift.closingCashCount, shift.openingNote, shift.closingNote]);

 async function handleSave() {
  const noteTrim = noteStr.trim() || null;
  try {
   if (mode === 'open') {
    const normalized = amountStr.trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    if (normalized === '' || Number.isNaN(n) || n < 0) {
     toast.error('Введите неотрицательную сумму');
     return;
    }
    await updateShift(shift.id, { startingCashTiyin: Math.round(n * 100), openingNote: noteTrim });
   } else {
    const normalized = amountStr.trim().replace(/\s/g, '').replace(',', '.');
    let value: number | null = null;
    if (normalized !== '') {
     const n = parseFloat(normalized);
     if (Number.isNaN(n) || n < 0) {
      toast.error('Введите неотрицательное число или очистите сумму');
      return;
     }
     value = n;
    }
    await updateShift(shift.id, { countedCashTiyin: value != null ? Math.round(value * 100) : null, closingNote: noteTrim });
   }
   toast.success('Сохранено');
   onClose();
  } catch (e: unknown) {
   toast.error('Не удалось сохранить');
  }
 }

 const title = mode === 'open' ? 'Открытие смены' : 'Закрытие смены';

 return (
  <Modal title={title} onClose={onClose}>
    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">
      {mode === 'open' ? 'Наличные в кассе' : 'Наличные при закрытии'}
     </label>
     <DecimalSuffixInput value={amountStr} onChange={setAmountStr} suffix="с" />
    </div>
    <div className="mb-6">
     <label className="text-sm text-foreground mb-2 block">Комментарий кассира</label>
     <textarea
      rows={3}
      className="w-full px-3 py-2 border rounded-lg text-sm bg-background resize-none outline-none focus:border-primary transition-colors"
      value={noteStr}
      onChange={(e) => setNoteStr(e.target.value)}
     />
    </div>
    <div className="flex gap-2">
     <button
      type="button"
      onClick={handleSave}
      disabled={isSaving}
      className="flex-1 py-2.5 bg-foreground text-background rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
     >
      {isSaving ? 'Сохранение…' : 'Сохранить'}
     </button>
     <button
      type="button"
      onClick={onClose}
      className="px-5 py-2.5 border-2 rounded-xl font-bold text-sm hover:bg-secondary transition-colors"
     >
      Отмена
     </button>
    </div>
  </Modal>
 );
}

// ─── Shift Detail Panel ───────────────────────────────────────────────────────

function ShiftDetail({ shift, onAddTransaction }: { shift: CashShift; onAddTransaction: (dt?: string) => void }) {
 const {
  data: txs = [],
  isLoading: txsPending,
  error: txsErr,
 } = useInstantShiftTransactions(shift.id);
 const txsError = !!txsErr;
 const { remove: deleteTx, loading: deletePending } = useInstantDeleteCashMovement();
 const [editTx, setEditTx] = useState<{ id: string; type: string; amount: number; note: string | null; transaction_at: string } | null>(null);
 const [boundaryEdit, setBoundaryEdit] = useState<ShiftBoundaryEditMode | null>(null);

 /** Drawer-relevant totals: all InstantDB cashMovements affect cash drawer */
 const totalIncome = txs
  .filter((t) => t.type === 'income')
  .reduce((s, t) => s + t.amount, 0);
 const totalExpense = txs
  .filter((t) => t.type === 'expense')
  .reduce((s, t) => s + t.amount, 0);
 const totalCollection = txs
  .filter((t) => t.type === 'collection')
  .reduce((s, t) => s + t.amount, 0);

 const txsChrono = [...txs].sort(
  (a, b) => new Date(a.transaction_at).getTime() - new Date(b.transaction_at).getTime(),
 );

 const defaultDt = shift.openIso
  ? (() => {
    const d = new Date(shift.openIso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
   })()
  : undefined;

 const showTxTable = !txsPending && !txsError;

 return (
  <div>
   {boundaryEdit && (
    <ShiftBoundaryEditModal
     mode={boundaryEdit}
     shift={shift}
     onClose={() => setBoundaryEdit(null)}
    />
   )}
   {editTx && (
    <EditTransactionModal tx={editTx} onClose={() => setEditTx(null)} />
   )}

   {/* Transactions */}
   <div className="max-w-[800px]">

    {txsPending && (
     <p className="text-sm text-muted-foreground py-2">Загрузка…</p>
    )}
    {txsError && (
     <p className="text-sm text-destructive py-2">
      {txsErr instanceof Error ? txsErr.message : 'Не удалось загрузить'}
     </p>
    )}

    {showTxTable && (() => {
     type ShiftRow = {
      id: string;
      kind: 'opening' | 'transaction' | 'closing';
      typeLabel: string;
      typeColor: string;
      typeSub: string;
      datetime: string;
      amount: number | null;
      amountColor: string;
      isBold: boolean;
      tx?: typeof txsChrono[number];
      boundaryMode?: 'open' | 'close';
     };

     const rows: ShiftRow[] = [
      {
       id: 'opening',
       kind: 'opening',
       typeLabel: 'Открытие',
       typeColor: 'text-foreground',
       typeSub: shift.openingNote?.trim() ? humanizeNote(shift.openingNote) : '',
       datetime: formatDatetime(shift.openIso),
       amount: shift.startBalance,
       amountColor: 'text-foreground',
       isBold: true,
       boundaryMode: 'open',
      },
      ...txsChrono.map(tx => ({
       id: tx.id,
       kind: 'transaction' as const,
       typeLabel: TYPE_LABELS[tx.type],
       typeColor: TYPE_COLOR[tx.type],
      typeSub: tx.note?.trim() ? humanizeNote(tx.note) : '',
       datetime: formatDatetime(tx.transaction_at),
       amount: tx.amount,
       amountColor: TYPE_AMOUNT_COLOR[tx.type],
       isBold: false,
       tx,
      })),
      ...(shift.closeIso ? [{
       id: 'closing',
       kind: 'closing' as const,
       typeLabel: 'Закрытие',
       typeColor: 'text-foreground',
       typeSub: shift.closingNote?.trim() ? humanizeNote(shift.closingNote) : '',
       datetime: formatDatetime(shift.closeIso),
       amount: shift.closingCashCount,
       amountColor: 'text-foreground',
       isBold: true,
       boundaryMode: 'close' as const,
      }] : []),
     ];

     const shiftColumns: ColumnDef<ShiftRow, any>[] = [
      {
       id: 'type',
       header: 'Тип',
       cell: ({ row }) => (
        <div className="min-w-0 truncate">
         <span className={cn(row.original.isBold && 'font-medium', row.original.typeColor)}>{row.original.typeLabel}</span>
         {row.original.typeSub && <span> · {row.original.typeSub}</span>}
        </div>
       ),
      },
      {
       id: 'datetime',
       header: 'Дата/время',
       cell: ({ getValue, row }) => <span className={row.original.isBold ? 'font-medium' : ''}>{getValue<string>()}</span>,
       accessorKey: 'datetime',
       meta: { align: 'text-left' },
      },
      {
       id: 'amount',
       header: 'Сумма',
       cell: ({ row }) => {
        const r = row.original;
        const label = r.amount != null ? formatCurrency(r.amount) : '—';
        return <span className={`${r.amountColor}`}>{label}</span>;
       },
      },
      {
       id: 'edit',
       header: '',
       cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'transaction') return <EditButton onClick={() => setEditTx(r.tx!)} />;
        if (r.boundaryMode) return <EditButton onClick={() => setBoundaryEdit(r.boundaryMode!)} />;
        return null;
       },
      },
      {
       id: 'delete',
       header: '',
       cell: ({ row }) => {
        const r = row.original;
        if (r.kind !== 'transaction') return null;
        return <DeleteButton onClick={async () => {
         try { await deleteTx(r.tx!.id); }
         catch (e: unknown) { toast.error('Не удалось удалить'); }
        }} />;
       },
      },
     ];

     return (
      <DataTable
       data={rows}
       columns={shiftColumns}
       dense
      />
     );
    })()}
   </div>

   <button
    onClick={() => onAddTransaction(defaultDt)}
    className="flex items-center gap-1.5 text-sm text-primary hover:underline transition-colors cursor-pointer mt-1 mb-3"
   >
    <Plus className="w-3.5 h-3.5" /> Добавить транзакцию
   </button>

   <div className="flex items-center gap-3 py-1 text-sm">
    <span className="text-success">+{formatCurrency(totalIncome)} приход</span>
    <span className="text-destructive">−{formatCurrency(totalExpense)} расход</span>
    {totalCollection > 0 && <span>−{formatCurrency(totalCollection)} инкассация</span>}
    <span>→</span>
    <span className="font-medium">{formatCurrency(shift.expectedCash)} в кассе</span>
   </div>
  </div>
 );
}

// ─── Edit Transaction Modal ──────────────────────────────────────────────────

export function EditTransactionModal({
 tx,
 onClose,
}: {
 tx: { id: string; type: string; amount: number; note: string | null; transaction_at: string };
 onClose: () => void;
}) {
 const { update: updateTx, loading: isSaving } = useInstantUpdateCashMovement();
 const [type, setType] = useState<'expense' | 'income' | 'collection'>(
  tx.type === 'collection' || tx.type === 'other' ? 'expense' : tx.type as 'expense' | 'income' | 'collection'
 );
 const [amount, setAmount] = useState(String(tx.amount));
 const [datetime, setDatetime] = useState(() => {
  const d = new Date(tx.transaction_at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
 });
 const [note, setNote] = useState(tx.note || '');
 const [error, setError] = useState('');

 async function handleSave() {
  const amt = parseFloat(amount);
  if (!amount || isNaN(amt) || amt <= 0) {
   setError('Введите корректную сумму');
   return;
  }
  try {
   await updateTx(tx.id, {
    amount: amt,
    note: note.trim(),
    transaction_at: new Date(datetime).toISOString(),
   });
   toast.success('Транзакция обновлена');
   onClose();
  } catch (e: unknown) {
   toast.error('Не удалось обновить');
  }
 }

 return (
  <Modal title="Изменить транзакцию" onClose={onClose}>
    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Тип</label>
     <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: '#FAFAFA', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' }}>
      {(['expense', 'income'] as const).map((t) => (
       <button key={t} onClick={() => setType(t)}
        className={`px-4 py-1.5 rounded-md text-sm transition-all cursor-pointer ${type === t ? 'bg-white text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        style={type === t ? { boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' } : {}}
       >
        {TYPE_LABELS[t]}
       </button>
      ))}
     </div>
    </div>

    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Сумма</label>
     <div className="relative">
      <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm bg-background pr-10 outline-none focus:border-primary transition-colors"
       placeholder="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} autoFocus />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">сом</span>
     </div>
     {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>


    <div className="mb-4">
     <label className="text-sm text-foreground mb-2 block">Дата и время</label>
     <div className="flex gap-2">
      <input type="date" className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
       value={datetime.slice(0, 10)} onChange={(e) => setDatetime(e.target.value + 'T' + (datetime.slice(11) || '00:00'))} />
      <div className="flex items-center gap-1">
       <input type="number" min={0} max={23} className="w-14 px-2 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors text-center"
        value={datetime.slice(11, 13)}
        onChange={(e) => { const h = String(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, '0'); setDatetime(datetime.slice(0, 11) + h + ':' + datetime.slice(14, 16)); }} />
       <span className="text-muted-foreground font-medium">:</span>
       <input type="number" min={0} max={59} className="w-14 px-2 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors text-center"
        value={datetime.slice(14, 16)}
        onChange={(e) => { const m = String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))).padStart(2, '0'); setDatetime(datetime.slice(0, 11) + datetime.slice(11, 13) + ':' + m); }} />
      </div>
     </div>
    </div>

    <div className="mb-6">
     <label className="text-sm text-foreground mb-2 block">Комментарий</label>
     <input type="text" className="w-full px-3 py-2 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors"
      placeholder="Комментарий" value={note} onChange={(e) => setNote(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
    </div>

    <div className="flex gap-2 justify-end">
     <button onClick={onClose}
      className="px-5 py-2.5 border rounded-lg bg-background text-sm font-medium hover:bg-secondary transition-colors">
      Закрыть
     </button>
     <button onClick={handleSave} disabled={isSaving}
      className="px-8 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-all disabled:opacity-50 active:shadow-[inset_0_1px_3px_rgba(0,0,0,.2)]">
      {isSaving ? 'Сохранение...' : 'Обновить'}
     </button>
    </div>
  </Modal>
 );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CashShifts() {
 const [searchParams, setSearchParams] = useSearchParams();
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
 const [page, setPage] = useState(0);
 const from = useMemo(() => {
  if (period === 'all') return undefined;
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') cutoff.setDate(cutoff.getDate() - 7);
  if (period === 'month') cutoff.setDate(cutoff.getDate() - 30);
  return cutoff;
 }, [period]);
 const { data: shifts = [], isLoading, error, hasNextPage } = useInstantCashShifts({ from, page });
 const [showModal, setShowModal] = useState(false);
 const [modalDefaultDt, setModalDefaultDt] = useState<string | undefined>(undefined);

 useEffect(() => {
  const sid = searchParams.get('shift');
  if (!sid) return;
  setExpandedId(sid);
  const next = new URLSearchParams(searchParams);
  next.delete('shift');
  setSearchParams(next, { replace: true });
 }, [searchParams, setSearchParams]);

 const toggleExpand = (id: string) => {
  setExpandedId(expandedId === id ? null : id);
 };

 function openModal(dt?: string) {
  setModalDefaultDt(dt);
  setShowModal(true);
 }

 const expandedRows = useMemo(() => {
  if (!expandedId) return {} as Record<string, boolean>;
  return { [expandedId]: true };
 }, [expandedId]);

 const shiftColumns = useMemo((): ColumnDef<CashShift, any>[] => [
  {
   id: 'shift',
   header: 'Смена',
   cell: ({ row }) => (
    <div className="flex items-center gap-2 min-w-0">
     <span className="truncate text-sm">{row.original.openTime}</span>
     <span className="text-muted-foreground opacity-30">—</span>
     <span className="truncate text-sm">
      {row.original.closeTime || 'Не закрыта'}
     </span>
    </div>
   ),
  },
  {
   id: 'startBalance',
   header: 'Начало',
   cell: ({ row }) => (
    <span className="text-sm">{formatCurrency(row.original.startBalance)}</span>
   ),
  },
  {
   id: 'closingCash',
   header: 'В кассе',
   cell: ({ row }) => {
    const s = row.original;
    if (!s.closeIso) return null;
    return <span className="text-sm">{s.closingCashCount != null ? formatCurrency(s.closingCashCount) : '—'}</span>;
   },
  },
  {
   id: 'difference',
   header: 'Разница',
   cell: ({ row }) => {
    const s = row.original;
    if (s.difference == null) return <span className="text-muted-foreground text-sm">{s.closeIso ? '—' : ''}</span>;
    const prefix = s.difference > 0 ? '+' : '';
    return (
     <span className={`text-sm font-medium ${s.difference !== 0 ? (s.difference > 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
      {prefix}{formatCurrency(s.difference)}
     </span>
    );
   },
  },
  {
   id: 'collection',
   header: 'Инкассация',
   cell: ({ row }) => (
    <span className="text-sm">{formatCurrency(row.original.collection)}</span>
   ),
  },
 ], []);

 return (
  <div className="page-shell">{showModal && (
   <AddTransactionModal
    shifts={shifts}
    defaultDatetime={modalDefaultDt}
    onClose={() => setShowModal(false)}
   />
  )}
  
  {!!error && (
   <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-1.5 text-sm text-destructive">
    {error instanceof Error ? error.message : 'Не удалось загрузить смены'}
   </div>
  )}
  
  <div className="flex items-center justify-between mb-6">
   <h2 className="text-2xl font-bold">Кассовые смены</h2>
   <div className="flex gap-3">
    <button className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm text-[#5D4FF1] font-medium hover:bg-secondary/50 transition-colors">
     <Printer className="w-4 h-4" />
     Распечатать
    </button>
    <button className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm text-[#5D4FF1] font-medium hover:bg-secondary/50 transition-colors">
     12 марта — 12 апреля
     <ChevronDown className="w-4 h-4" />
    </button>
   </div>
  </div>
    <SegmentTabs
    options={[
      { value: 'today' as const, label: 'Сегодня' },
      { value: 'week' as const, label: 'Неделя' },
      { value: 'month' as const, label: 'Месяц' },
      { value: 'all' as const, label: 'Всё' },
    ]}
    value={period}
    onChange={(value) => { setPeriod(value); setPage(0); setExpandedId(null); }}
    className="mb-4"
  />
  
  <div className="max-w-4xl">
   <DataTable
     data={shifts}
     columns={shiftColumns}
     dense
     isLoading={isLoading}
     error={error ? new Error(error.message) : null}
     emptyMessage="Нет кассовых смен"
     expandedRows={expandedRows}
     onExpandedChange={toggleExpand}
     renderExpandedRow={(row) => (
       <ShiftDetail shift={row.original} onAddTransaction={openModal} />
     )}
     getRowClassName={(row) => {
       const s = row.original;
       if (expandedId === s.id) return 'bg-black/[0.03]';
       if (!s.closeTime) return 'bg-[#FDF6E3] hover:bg-[#F9EED4]';
       if (s.difference != null && s.difference !== 0) return 'bg-[#FCE8E8] hover:bg-[#FAD5D5]';
       return row.index % 2 === 1 ? 'bg-muted/10' : '';
     }}
   />
   <div className="mt-4 flex items-center justify-end gap-2">
    <button
     type="button"
     className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
     disabled={page === 0 || isLoading}
     onClick={() => { setExpandedId(null); setPage((current) => Math.max(0, current - 1)); }}
    >
     Назад
    </button>
    <span className="text-sm text-muted-foreground">Страница {page + 1}</span>
    <button
     type="button"
     className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
     disabled={!hasNextPage || isLoading}
     onClick={() => { setExpandedId(null); setPage((current) => current + 1); }}
    >
     Далее
    </button>
   </div>
    </div></div>
 );
}
