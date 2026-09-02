import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowRightLeft, PackageCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DecimalSuffixInput } from '@/components/DecimalSuffixInput';
import { Modal } from '@/components/ui/Modal';
import {
  useInstantDeliveriesList,
  type DeliveryRow,
} from '@/hooks/useInstantDeliveriesList';
import {
  useInstantWriteOffsList,
  type WriteOffRow,
} from '@/hooks/useInstantWriteOffsList';
import {
  useInstantTransfersList,
  type TransferRow,
} from '@/hooks/useInstantTransfersList';
import { useInstantReceiveDeliveryBridge } from '@/hooks/useInstantDeliveryStatusMutations';
import { useInstantPostWriteOffBridge } from '@/hooks/useInstantWriteOffStatusMutations';
import { useInstantPostTransferBridge } from '@/hooks/useInstantTransferStatusMutations';
import { qtyToString } from '@/lib/warehouse-form-utils';

type OperationalDocumentKind = 'delivery' | 'write-off' | 'transfer';

interface OperationalDocumentItem {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  priceTiyin?: number;
}

interface OperationalDocument {
  id: string;
  version: number;
  kind: OperationalDocumentKind;
  title: string;
  detail: string;
  date: string;
  href: string;
  items: OperationalDocumentItem[];
}

const KIND_META = {
  delivery: {
    label: 'Поставка',
    primaryLabel: 'Принять как есть',
    submitLabel: 'Принять поставку',
    icon: PackageCheck,
  },
  'write-off': {
    label: 'Списание',
    primaryLabel: 'Провести',
    submitLabel: 'Провести списание',
    icon: Trash2,
  },
  transfer: {
    label: 'Перемещение',
    primaryLabel: 'Провести',
    submitLabel: 'Провести перемещение',
    icon: ArrowRightLeft,
  },
} as const;

function positionLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return 'позиций';
  if (last === 1) return 'позиция';
  if (last >= 2 && last <= 4) return 'позиции';
  return 'позиций';
}

function formatSomTiyin(value: number): string {
  return `${Math.round(value / 100).toLocaleString('ru-RU')} сом`;
}

function documentDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function deliveryDocument(row: DeliveryRow): OperationalDocument {
  return {
    id: row.id,
    version: row.version,
    kind: 'delivery',
    title: row.supplier || 'Поставка без поставщика',
    detail: `${row.warehouse_name || 'Склад не указан'} · ${row.items.length} ${positionLabel(row.items.length)} · ${formatSomTiyin(row.amount)}`,
    date: row.date,
    href: `/warehouse/deliveries/${row.id}/edit`,
    items: row.items.map((item) => ({
      productId: item.product_id ?? '',
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      priceTiyin: Math.round(item.price * 100),
    })),
  };
}

function writeOffDocument(row: WriteOffRow): OperationalDocument {
  return {
    id: row.id,
    version: row.version,
    kind: 'write-off',
    title: row.reason_summary || 'Списание без причины',
    detail: `${row.warehouse_name || 'Склад не указан'} · ${row.items.length} ${positionLabel(row.items.length)}`,
    date: row.date,
    href: `/warehouse/write-offs/${row.id}/edit`,
    items: row.items.map((item) => ({
      productId: item.product_id ?? '',
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  };
}

function transferDocument(row: TransferRow): OperationalDocument {
  return {
    id: row.id,
    version: row.version,
    kind: 'transfer',
    title: `${row.fromWarehouse || 'Склад не указан'} → ${row.toWarehouse || 'Склад не указан'}`,
    detail: `${row.items.length} ${positionLabel(row.items.length)}`,
    date: row.date,
    href: `/warehouse/transfers/${row.id}/edit`,
    items: row.items.map((item) => ({
      productId: item.product_id ?? '',
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  };
}

function parseQuantity(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function ReviewDocumentModal({
  document,
  pending,
  onClose,
  onSubmit,
}: {
  document: OperationalDocument;
  pending: boolean;
  onClose: () => void;
  onSubmit: (quantities: number[]) => Promise<void>;
}) {
  const meta = KIND_META[document.kind];
  const [values, setValues] = useState(() => document.items.map((item) => qtyToString(item.quantity)));
  const parsed = values.map(parseQuantity);
  const invalid = parsed.some((quantity) => quantity == null) || document.items.some((item) => !item.productId);
  const actualTotalTiyin = document.kind === 'delivery'
    ? document.items.reduce((sum, item, index) => {
      const quantity = parsed[index];
      return quantity == null ? sum : sum + Math.round(quantity * 1000 * (item.priceTiyin ?? 0) / 1000);
    }, 0)
    : null;

  return (
    <Modal title={`${meta.label}: ${document.title}`} onClose={onClose} width="720px">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{document.detail}</span>
          <span aria-hidden="true">·</span>
          <span>{documentDate(document.date)}</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_110px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:gap-3">
            <span>Ингредиент</span>
            <span className="text-right">{document.kind === 'delivery' ? 'Заказано' : 'В документе'}</span>
            <span className="text-right">{document.kind === 'delivery' ? 'Принято' : 'Провести'}</span>
          </div>
          <div className="divide-y divide-border">
            {document.items.map((item, index) => {
              const quantity = parsed[index];
              const difference = quantity == null ? 0 : Math.round((quantity - item.quantity) * 1000) / 1000;
              return (
                <div key={item.productId || `${item.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_64px_110px] items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    {difference !== 0 && (
                      <p className={`mt-0.5 text-xs ${difference < 0 ? 'text-amber-600' : 'text-success'}`}>
                        {difference > 0 ? '+' : ''}{qtyToString(difference)} {item.unit}
                      </p>
                    )}
                  </div>
                  <span className="text-right text-sm tabular-nums text-muted-foreground">
                    {qtyToString(item.quantity)} {item.unit}
                  </span>
                  <DecimalSuffixInput
                    value={values[index]}
                    onChange={(next) => setValues((current) => current.map((value, valueIndex) => (
                      valueIndex === index ? next : value
                    )))}
                    suffix={item.unit}
                    bold
                  />
                </div>
              );
            })}
          </div>
        </div>

        {actualTotalTiyin != null && (
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Фактическая сумма</span>
            <span className="font-semibold tabular-nums text-foreground">{formatSomTiyin(actualTotalTiyin)}</span>
          </div>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          Здесь можно изменить только количество существующих позиций. Состав документа и реквизиты меняются в полной форме.
        </p>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to={document.href}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground sm:min-h-9"
          >
            Открыть полную форму
            <ArrowRight className="size-4" />
          </Link>
          <button
            type="button"
            disabled={invalid || pending}
            onClick={() => onSubmit(parsed as number[])}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
          >
            {pending ? 'Проведение…' : meta.submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function OperationalDocumentsSection() {
  const deliveries = useInstantDeliveriesList();
  const writeOffs = useInstantWriteOffsList();
  const transfers = useInstantTransfersList();
  const receiveDelivery = useInstantReceiveDeliveryBridge();
  const postWriteOff = useInstantPostWriteOffBridge();
  const postTransfer = useInstantPostTransferBridge();
  const [selected, setSelected] = useState<OperationalDocument | null>(null);

  const documents = useMemo(() => [
    ...deliveries.data
      .filter((row) => row.status === 'draft' || row.status === 'in_transit')
      .map(deliveryDocument),
    ...writeOffs.data.filter((row) => row.status === 'draft').map(writeOffDocument),
    ...transfers.data.filter((row) => row.status === 'draft').map(transferDocument),
  ].sort((left, right) => right.date.localeCompare(left.date)), [deliveries.data, transfers.data, writeOffs.data]);

  const loading = deliveries.isLoading || writeOffs.isLoading || transfers.isLoading;
  const error = deliveries.error || writeOffs.error || transfers.error;

  async function postDocument(document: OperationalDocument, quantities?: number[]) {
    try {
      if (document.kind === 'delivery') {
        await receiveDelivery.mutate({
          documentId: document.id,
          expectedVersion: document.version,
          ...(quantities ? {
            receivedLines: document.items.map((item, index) => ({
              productId: item.productId,
              receivedQuantityMilli: Math.round(quantities[index] * 1000),
              receivedPriceTiyin: item.priceTiyin ?? 0,
            })),
          } : {}),
        });
        toast.success('Поставка принята');
      } else {
        const input = {
          documentId: document.id,
          expectedVersion: document.version,
          ...(quantities ? {
            lineQuantities: document.items.map((item, index) => ({
              productId: item.productId,
              quantityMilli: Math.round(quantities[index] * 1000),
            })),
          } : {}),
        };
        if (document.kind === 'write-off') {
          await postWriteOff.mutate(input);
          toast.success('Списание проведено');
        } else {
          await postTransfer.mutate(input);
          toast.success('Перемещение проведено');
        }
      }
      setSelected(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Не удалось провести документ');
    }
  }

  function documentPending(document: OperationalDocument): boolean {
    if (document.kind === 'delivery') return receiveDelivery.isPending;
    if (document.kind === 'write-off') return postWriteOff.isPending;
    return postTransfer.isPending;
  }

  return (
    <section aria-labelledby="operational-documents-title">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h3 id="operational-documents-title" className="text-sm font-medium text-foreground">
            Операционные задачи
          </h3>
          {!loading && !error && (
            <span className="text-sm tabular-nums text-muted-foreground">{documents.length}</span>
          )}
        </div>
        {documents.length > 5 && (
          <Link to="/warehouse/operations" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Все операции
          </Link>
        )}
      </div>

      {loading ? (
        <p className="py-3 text-sm text-muted-foreground">Загрузка документов…</p>
      ) : error ? (
        <p role="alert" className="py-3 text-sm text-destructive">Не удалось загрузить складские документы</p>
      ) : documents.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Незавершённых складских документов нет</p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {documents.slice(0, 5).map((document) => {
            const meta = KIND_META[document.kind];
            const Icon = meta.icon;
            const pending = documentPending(document);
            return (
              <article key={`${document.kind}-${document.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                      <span className="truncate text-sm text-foreground">{document.title}</span>
                      <span className="text-xs text-muted-foreground">{documentDate(document.date)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{document.detail}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => postDocument(document)}
                    className="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
                  >
                    {pending ? 'Проведение…' : meta.primaryLabel}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setSelected(document)}
                    className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
                  >
                    Проверить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <ReviewDocumentModal
          key={`${selected.kind}-${selected.id}-${selected.version}`}
          document={selected}
          pending={documentPending(selected)}
          onClose={() => setSelected(null)}
          onSubmit={(quantities) => postDocument(selected, quantities)}
        />
      )}
    </section>
  );
}
