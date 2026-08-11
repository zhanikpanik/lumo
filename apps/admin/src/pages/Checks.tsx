import { useState, useRef, useEffect, useMemo } from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useInstantCheckDetail, useInstantChecks, type Check, type OrderSource, type OrderEvent } from '@/hooks/useInstantChecks';
import { CHECK_ITEMS_TABLE_GRID, checkItemPositionTitle } from '@/lib/checkItemsTableGrid';
import { DatePresetPicker } from '@/components/ui/DatePresetPicker';
import {
 analyzeChecks,
 countBySeverity,
 severityLabel,
 type Severity,
 type CheckAnalysis,
} from '@/lib/checkAnalysis';

// ─── Format table column ────────────────────────────────

const SOURCE_LABELS: Record<OrderSource, { label: string; className: string }> = {
 pos: { label: '', className: '' },
 glovo: { label: 'Glovo', className: 'text-success font-medium' },
 yandex_eda: { label: 'Яндекс', className: 'text-warning font-medium' },
};

function formatTable(c: Check) {
 if (c.source === 'glovo' || c.source === 'yandex_eda') {
 const s = SOURCE_LABELS[c.source];
 const id = c.externalOrderId ? ` #${c.externalOrderId}` : '';
 return { label: `${s.label}${id}`, className: s.className, isAggregator: true };
 }
 if (c.isQuickCheck) {
 return { label: 'На вынос', className: 'text-muted-foreground/60 italic', isAggregator: false };
 }
 return { label: c.tableNumber === '—' ? '—' : c.tableNumber, isAggregator: false };
}

function formatCheckPeriod(openedAt: string, closedAt: string | undefined, status: 'open' | 'closed' | 'cancelled'): string {
 const o = new Date(openedAt);
 const dayOpen = o.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
 const timeOpen = o.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
 if (status === 'open' || !closedAt) return `${dayOpen}, ${timeOpen}`;
 const c = new Date(closedAt);
 const sameDay = o.getFullYear() === c.getFullYear() && o.getMonth() === c.getMonth() && o.getDate() === c.getDate();
 const timeClose = c.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
 if (sameDay) return `${dayOpen}, ${timeOpen} — ${timeClose}`;
 const dayClose = c.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
 return `${dayOpen}, ${timeOpen} — ${dayClose}, ${timeClose}`;
}

function formatMoney(n: number) { return n.toLocaleString('ru-RU') + ' с'; }

function formatCheckProfit(c: Check): string {
 if (c.items.length === 0) return '—';
 if (c.items.every((i) => i.unitCost === null)) return '—';
 const base = formatMoney(c.profit);
 return c.profitIncomplete ? `${base}*` : base;
}

// ─── Types ──────────────────────────────────────────────

type PaymentFilter = 'all' | 'cash' | 'card';
type StatusFilter = 'all' | 'open' | 'closed' | 'cancelled';
type SeverityFilter = 'all' | Severity;
type ExpandTab = 'details' | 'history';

/** Human-readable labels for order event actions */
const EVENT_LABELS: Record<string, string> = {
 item_added: 'Добавлено блюдо',
 item_removed: 'Удалено блюдо',
 precheck_printed: 'Пречек',
 paid: 'Закрытие чека',
 cancelled: 'Отмена чека',
 refunded: 'Возврат',
};

function formatEventDetail(ev: OrderEvent): string {
 switch (ev.action) {
 case 'item_added':
 case 'item_removed':
 return ev.productName
 ? `${ev.productName}${ev.quantity != null ? ` × ${ev.quantity}` : ''}${ev.unitPrice != null ? ` — ${Number(ev.unitPrice).toLocaleString('ru-RU')} с` : ''}`
 : '';
 case 'paid':
 return '';
 case 'cancelled':
 return '';
 case 'precheck_printed':
 return 'Пречек распечатан';
 default:
 return '';
 }
}

function isEventSuspicious(ev: OrderEvent): boolean {
 return ev.action === 'item_removed';
}

function CheckExpandedContent({
 check,
 paid,
 expandTab,
 setExpandTab,
 analysis,
}: {
 check: Check;
 paid: number;
 expandTab: ExpandTab;
 setExpandTab: (tab: ExpandTab) => void;
 analysis: CheckAnalysis | undefined;
}) {
 const detail = useInstantCheckDetail(check.id);
 if (detail.isLoading) return <p className="py-4 text-sm text-muted-foreground">Загрузка состава…</p>;
 if (detail.error) return <p className="py-4 text-sm text-destructive">Не удалось загрузить состав чека</p>;

 const c: Check = { ...check, ...detail };
 const subtotalVal = c.items.reduce((sum, item) => sum + item.qty * item.price, 0);

 return (
 <>
 <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] mb-3">
 <button onClick={() => setExpandTab('details')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${expandTab === 'details' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Состав</button>
 <button onClick={() => setExpandTab('history')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${expandTab === 'history' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>История</button>
 </div>
 {expandTab === 'details' ? (
 <div className="w-full min-w-0 max-w-xs space-y-0 pr-2">
 <div className={`${CHECK_ITEMS_TABLE_GRID} pb-1 text-sm text-muted-foreground`}>
 <div className="min-w-0">Позиция</div><div className="text-right">Цена</div><div className="text-right whitespace-nowrap">Сумма</div><div className="text-right whitespace-nowrap">Маржа</div>
 </div>
 {c.items.map((item, idx) => (
 <div key={idx} className={`${CHECK_ITEMS_TABLE_GRID} py-0.5 text-sm`}>
 <div className="min-w-0 flex items-baseline gap-1" title={checkItemPositionTitle(item.qty, item.name)}>
 <span className="whitespace-nowrap shrink-0">{item.qty}×</span><span className="min-w-0 block truncate">{item.name}</span>
 </div>
 <div className="text-right whitespace-nowrap">{formatMoney(item.price)}</div>
 <div className="text-right whitespace-nowrap">{formatMoney(item.qty * item.price)}</div>
 <div className="text-right whitespace-nowrap text-success">
 {item.unitCost === null ? <span className="text-sm">—</span> : formatMoney(item.qty * (item.price - item.unitCost))}
 </div>
 </div>
 ))}
 <div className={`${CHECK_ITEMS_TABLE_GRID} pt-2 mt-1 border-t border-border text-sm`}>
 <div className="min-w-0">Итого</div><div /><div className="text-right whitespace-nowrap">{formatMoney(subtotalVal)}</div><div className="text-right whitespace-nowrap text-success">{formatCheckProfit(c)}</div>
 </div>
 {c.discount > 0 && (
 <div className={`${CHECK_ITEMS_TABLE_GRID} text-sm text-warning`}>
 <div className="min-w-0">Скидка</div><div /><div className="text-right whitespace-nowrap">−{formatMoney(c.discount)}</div><div />
 </div>
 )}
 {c.status === 'closed' && (
 <div className={`${CHECK_ITEMS_TABLE_GRID} text-sm text-foreground`}>
 <div className="min-w-0">К оплате</div><div /><div className="text-right whitespace-nowrap">{formatMoney(paid)}</div><div />
 </div>
 )}
 </div>
 ) : (
 <div className="max-w-lg space-y-0">
 {c.events.length === 0 && <p className="text-sm text-muted-foreground py-4">Нет событий</p>}
 {c.events.map((event) => {
 const time = new Date(event.occurredAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
 const suspicious = isEventSuspicious(event);
 const label = EVENT_LABELS[event.action] || event.action;
 const eventDetail = formatEventDetail(event);
 return (
 <div key={event.id} className={`flex items-start gap-3 py-1.5 pl-3 text-sm ${suspicious ? 'bg-amber-50 rounded-lg -mx-1 px-4' : ''}`}>
 <div className="shrink-0 whitespace-nowrap text-muted-foreground text-sm pt-0.5">{time}</div>
 <div className="flex-1 min-w-0">
 <span className={`font-medium ${suspicious ? 'text-warning' : 'text-foreground'}`}>
 {suspicious && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}{label}
 </span>
 {eventDetail && <span className="ml-2">{eventDetail}</span>}
 </div>
 </div>
 );
 })}
 </div>
 )}
 {analysis && analysis.findings.length > 0 && (
 <div className="mt-3 pt-3 border-t border-border space-y-1">
 {analysis.findings.map((finding, index) => (
 <p key={index} className="text-sm">
 <span className={`font-medium ${finding.severity === 'critical' ? 'text-destructive' : finding.severity === 'warning' ? 'text-warning' : 'text-primary'}`}>{finding.reason}</span>
 <span className="ml-2">{finding.detail}</span>
 </p>
 ))}
 </div>
 )}
 </>
 );
}

// ─── Main component ─────────────────────────────────────

export function Checks() {
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [expandTab, setExpandTab] = useState<ExpandTab>('details');
 const [paidOverrides, setPaidOverrides] = useState<Record<string, number>>({});
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editValue, setEditValue] = useState('');
 const inputRef = useRef<HTMLInputElement>(null);
 const [waiterFilter, setWaiterFilter] = useState('all');
 const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
 const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
 const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

 // Default to today
 const todayStr = useMemo(() => {
 const d = new Date();
 d.setHours(0, 0, 0, 0);
 return d.toISOString().split('T')[0];
 }, []);
 const [fromDate, setFromDate] = useState<string>(todayStr);

 useEffect(() => { if (editingId) inputRef.current?.select(); }, [editingId]);

 function startEdit(id: string, current: number) { setEditingId(id); setEditValue(String(current)); }
 function commitEdit(id: string) { const val = parseFloat(editValue); if (!isNaN(val) && val >= 0) setPaidOverrides((prev) => ({ ...prev, [id]: val })); setEditingId(null); }

 const [page, setPage] = useState(0);
 const fromDateValue = fromDate ? new Date(fromDate) : undefined;
 const {
  data: checks = [],
  isLoading,
  isError,
  error: checksError,
  hasNextPage,
 } = useInstantChecks({ from: fromDateValue, page });


 // ── Analysis ──
 const analyses = useMemo(() => {
 const result = analyzeChecks(checks);
 // Rule: items removed after precheck
 for (const c of checks) {
 if (!c.events || c.events.length === 0) continue;
 const precheckIdx = c.events.findIndex(ev => ev.action === 'precheck_printed');
 if (precheckIdx === -1) continue;
 const hasRemovalAfter = c.events.slice(precheckIdx + 1).some(ev => ev.action === 'item_removed');
 if (!hasRemovalAfter) continue;
 const a = result.get(c.id)!;
 a.findings = [{
 severity: 'warning' as Severity,
 reason: 'Удаление блюд после пречека',
 detail: 'Блюда удалены из чека после отправки на кухню. Возможно, часть заказа не пробита.',
 }, ...a.findings];
 if (!a.maxSeverity || a.maxSeverity === 'info') {
 a.maxSeverity = 'warning';
 }
 }
 return result;
 }, [checks]);
 const severityCounts = useMemo(() => countBySeverity(analyses), [analyses]);

 const WAITERS = useMemo(() => Array.from(new Set(checks.map((c) => c.waiter).filter(w => w !== '—'))), [checks]);

 const filtered = checks.filter((c) => {
 if (waiterFilter !== 'all' && c.waiter !== waiterFilter) return false;
 if (paymentFilter !== 'all' && c.paymentMethod !== paymentFilter) return false;
 if (statusFilter !== 'all' && c.status !== statusFilter) return false;
 if (severityFilter !== 'all') {
 const a = analyses.get(c.id);
 if (!a || a.maxSeverity !== severityFilter) return false;
 }
 return true;
 });


 const expandedRows = useMemo(() => {
 if (!expandedId) return {} as Record<string, boolean>;
 return { [expandedId]: true };
 }, [expandedId]);

 const columns = useMemo((): ColumnDef<Check, any>[] => [
 {
 id: 'waiter',
 header: 'Официант',
 accessorKey: 'waiter',
 cell: ({ getValue }) => <span className="block truncate">{getValue<string>()}</span>,
 meta: { className: 'text-left whitespace-nowrap', align: 'text-left' },
 },
 {
 id: 'table',
 header: 'Стол',
 cell: ({ row }) => {
 const t = formatTable(row.original);
 return <span className={t.className}>{t.label}</span>;
 },
 meta: { className: 'text-left whitespace-nowrap', align: 'text-left' },
 },
 {
 id: 'period',
 header: 'Период',
 cell: ({ row }) => {
 const c = row.original;
 return <span className="whitespace-nowrap">{formatCheckPeriod(c.openedAt, c.closedAt || undefined, c.status)}</span>;
 },
 meta: { className: 'text-left', align: 'text-left' },
 },
 {
 id: 'status',
 header: 'Статус',
 cell: ({ row }) => {
 const c = row.original;
 if (c.status === 'open') return <span className="text-warning font-medium">Открыт</span>;
 if (c.status === 'cancelled') return <span className="text-destructive font-medium">Отменён</span>;
 return <span className="text-muted-foreground">Закрыт</span>;
 },
 meta: { className: 'text-left whitespace-nowrap', align: 'text-left' },
 },
 {
 id: 'paid',
 header: 'Оплачено',
 cell: ({ row }) => {
 const c = row.original;
 const paid = paidOverrides[c.id] ?? c.paid;
 if (editingId === c.id) {
 return (
 <input ref={inputRef} type="number"
 className="w-full text-right bg-white border border-border rounded px-1 py-0.5 text-sm outline-none"
 value={editValue} onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => commitEdit(c.id)}
 onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(c.id); if (e.key === 'Escape') setEditingId(null); }} />
 );
 }
 return (
 <span className="cursor-pointer hover:text-primary transition-colors"
 title="Нажмите для редактирования"
 onClick={(e) => { e.stopPropagation(); startEdit(c.id, paid); }}>
 {c.status === 'open' ? '—' : formatMoney(paid)}
 </span>
 );
 },
 meta: { className: 'whitespace-nowrap' },
 },
 {
 id: 'profit',
 header: 'Прибыль',
 cell: ({ row }) => {
 const c = row.original;
 return (
 <span className="text-success"
 title={c.profitIncomplete ? 'Прибыль по позициям с заполненной себестоимостью' : 'Сумма (цена − себестоимость) × кол-во'}>
 {formatCheckProfit(c)}
 </span>
 );
 },
 meta: { className: 'whitespace-nowrap' },
 },
 {
 id: 'discount',
 header: 'Скидка',
 cell: ({ row }) => {
 const c = row.original;
 if (c.discount > 0) return <span className="">−{formatMoney(c.discount)}</span>;
 return <span>—</span>;
 },
 meta: { className: 'whitespace-nowrap' },
 },
 ], [paidOverrides, editingId, editValue, startEdit, commitEdit]);

 return (
 <div className="p-8">
 <div className="flex items-center justify-between mb-6">
 <div>
 <h2 className="text-2xl font-bold">Чеки</h2>
 <p className="text-sm text-muted-foreground mt-1">
 {severityCounts.critical + severityCounts.warning > 0 ? (
 <>
 {severityCounts.critical > 0 && (
 <span className="text-destructive font-medium">{severityCounts.critical} критичных</span>
 )}
 {severityCounts.critical > 0 && severityCounts.warning > 0 && <span> · </span>}
 {severityCounts.warning > 0 && (
 <span className="text-warning font-medium">{severityCounts.warning} странных</span>
 )}
 </>
 ) : (
 <span>0 проблем</span>
 )}
 </p>
 </div>
 </div>

 {isError && (
 <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
 {checksError instanceof Error ? checksError.message : 'Не удалось загрузить чеки'}
 </div>
 )}

 {/* Period + Filters */}
 <div className="mb-4 space-y-2">
  <DatePresetPicker value={fromDate} onChange={(value) => { setFromDate(value); setPage(0); }} />
  <div className="flex items-center gap-2 flex-wrap">
  <select className="px-3 py-1.5 border rounded-lg text-sm bg-background outline-none focus:border-primary transition-colors" value={waiterFilter} onChange={(e) => setWaiterFilter(e.target.value)}>
 <option value="all">Все официанты</option>
 {WAITERS.map((w) => <option key={w} value={w}>{w}</option>)}
 </select>
 <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
 {(['all', 'cash', 'card'] as PaymentFilter[]).map((v) => (
 <button key={v} onClick={() => setPaymentFilter(v)} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${paymentFilter === v ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
 {v === 'all' ? 'Все' : v === 'cash' ? 'Наличные' : 'Безналичные'}
 </button>
 ))}
 </div>
 <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
 {(['all', 'open', 'closed', 'cancelled'] as StatusFilter[]).map((v) => (
 <button key={v} onClick={() => setStatusFilter(v)} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${statusFilter === v ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
 {v === 'all' ? 'Все' : v === 'open' ? 'Открытые' : v === 'cancelled' ? 'Отменённые' : 'Закрытые'}
 </button>
 ))}
 </div>
 {/* Severity filter pills — only when there are problems */}
 {severityCounts.critical + severityCounts.warning > 0 && (
 <div className="inline-flex rounded-lg bg-[#F2F2F7] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
 <button onClick={() => setSeverityFilter('all')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all cursor-pointer ${severityFilter === 'all' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Все</button>
 {severityCounts.critical > 0 && (
 <button onClick={() => setSeverityFilter('critical')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${severityFilter === 'critical' ? 'bg-white text-destructive shadow-sm' : 'text-muted-foreground hover:text-destructive'}`}>
 <ShieldAlert className="w-3.5 h-3.5" />{severityCounts.critical}
 </button>
 )}
 {severityCounts.warning > 0 && (
 <button onClick={() => setSeverityFilter('warning')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${severityFilter === 'warning' ? 'bg-white text-warning shadow-sm' : 'text-muted-foreground hover:text-warning'}`}>
 <AlertTriangle className="w-3.5 h-3.5" />{severityCounts.warning}
 </button>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Table */}
 <div className="max-w-4xl">
 {!isLoading && !isError && filtered.length === 0 ? (
 <EmptyState
 title={severityFilter !== 'all'
 ? `Нет чеков с уровнем «${severityLabel(severityFilter as Severity).toLowerCase()}»`
 : 'Чеков пока нет'}
 hint={severityFilter !== 'all'
 ? 'Попробуйте выбрать другой фильтр'
 : 'Чеки появятся, когда официанты начнут принимать заказы через POS-терминал'}
 >
 <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
 <Info className="w-6 h-6 text-muted-foreground/40" />
 </div>
 </EmptyState>
 ) : (
 <>
 <DataTable
 data={filtered}
 columns={columns}
 isLoading={isLoading}
 error={checksError ? new Error(checksError.message) : null}
 expandedRows={expandedRows}
 onExpandedChange={(rowId) => {
 setExpandedId(expandedId === rowId ? null : rowId);
 if (expandedId !== rowId) setExpandTab('details');
 }}
 renderExpandedRow={(row) => (
 <CheckExpandedContent
  check={row.original}
  paid={paidOverrides[row.original.id] ?? row.original.paid}
  expandTab={expandTab}
  setExpandTab={setExpandTab}
  analysis={analyses.get(row.original.id)}
 />
 )}
 getRowId={(c) => c.id}
 getRowClassName={(row) => {
 const classes = ['group'];
 if (expandedId === row.original.id) classes.push('bg-black/[0.03]');
 return classes.join(' ');
 }}
 dense
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
 </>
 )}
 </div>
 </div>
 );
}
