const ORDER_EVENT_LABELS: Record<string, string> = {
  created: 'Открытие чека',
  item_added: 'Добавлено блюдо',
  item_removed: 'Удалено блюдо',
  precheck_printed: 'Пречек',
  paid: 'Оплата',
  cancelled: 'Отмена чека',
  refunded: 'Возврат',
};

const OPERATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  posted: 'Проведено',
  completed: 'Проведено',
  cancelled: 'Отменено',
  open: 'Открыто',
  closed: 'Закрыто',
  active: 'Активно',
  paid: 'Оплачено',
};

export function orderEventLabel(action: string): string {
  return ORDER_EVENT_LABELS[action] ?? 'Событие чека';
}

export function operationalStatusLabel(status: string): string {
  return OPERATION_STATUS_LABELS[status.toLowerCase()] ?? status;
}
