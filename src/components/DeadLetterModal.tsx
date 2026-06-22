import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons'; // check only - no Chikin yet
import { CrossIcon, RefreshIcon } from './Icons';
import { theme } from '../theme/colors';
import { useDeadLetterStore } from '../store/deadLetterStore';
import { useShiftStore } from '../store/shiftStore';
import type { ConsumptionDeadLetter } from '../types/inventory';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const DeadLetterModal: React.FC<Props> = ({ visible, onClose }) => {
  const items = useDeadLetterStore((s) => s.items);
  const isLoading = useDeadLetterStore((s) => s.isLoading);
  const refresh = useDeadLetterStore((s) => s.refresh);
  const retry = useDeadLetterStore((s) => s.retry);
  const ack = useDeadLetterStore((s) => s.ack);
  const currentUser = useShiftStore((s) => s.currentUser);

  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    void refresh();
  }, [visible]);

  const runRetry = async (key: string) => {
    setPendingKey(key);
    try {
      await retry(key);
    } finally {
      setPendingKey(null);
    }
  };

  const runAck = async (key: string) => {
    setPendingKey(key);
    try {
      await ack(key, currentUser?.id ?? null);
    } finally {
      setPendingKey(null);
    }
  };

  const renderItem = ({ item }: { item: ConsumptionDeadLetter }) => {
    const busy = pendingKey === item.idempotency_key;
    const orderTail = item.order_id ? item.order_id.slice(0, 8) : '—';
    return (
      <View style={styles.row}>
        <View style={styles.rowHead}>
          <View style={[styles.statusChip, item.status === 'acknowledged' ? styles.chipAck : styles.chipOpen]}>
            <Text style={styles.chipText}>{item.status === 'acknowledged' ? 'Принят' : 'Требует внимания'}</Text>
          </View>
          <Text style={styles.rowMeta}>{formatDateTime(item.last_seen_at)}</Text>
        </View>
        <Text style={styles.rowTitle}>Заказ {orderTail}…  · ретраев: {item.retries}</Text>
        {item.last_error ? (
          <Text style={styles.rowError} numberOfLines={4}>
            {item.last_error}
          </Text>
        ) : null}
        <Text style={styles.rowKey} numberOfLines={1}>
          key: {item.idempotency_key}
        </Text>
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.retryBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void runRetry(item.idempotency_key)}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <RefreshIcon size={16} color="#fff" />
                <Text style={styles.actionText}>Повторить</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.ackBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void runAck(item.idempotency_key)}
            activeOpacity={0.8}
          >
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.actionText}>Решено вручную</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Зависшие операции склада</Text>
              <Text style={styles.subtitle}>
                События, которые не удалось отправить с этого устройства. Повторите вручную или
                отметьте как решённые, если вы уже всё исправили в админке.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CrossIcon size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading && items.length === 0 ? (
            <View style={styles.empty}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Нет зависших операций.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.idempotency_key}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={{ padding: 16, gap: 12 }}
            />
          )}

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => void refresh()} style={styles.footerBtn}>
              <RefreshIcon size={16} color={theme.colors.textPrimary} />
              <Text style={styles.footerText}>Обновить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '60%',
    minWidth: 540,
    maxWidth: 760,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.subtleBorder,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
    marginTop: 4,
    maxWidth: 600,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flexGrow: 0 },
  empty: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
  },
  row: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowMeta: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
  },
  rowTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  rowError: {
    color: theme.colors.warningSubtle,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
  },
  rowKey: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  retryBtn: { backgroundColor: theme.colors.info },
  ackBtn: { backgroundColor: theme.colors.chipRetryBg },
  btnDisabled: { opacity: 0.55 },
  actionText: { color: theme.colors.white, fontFamily: theme.fonts.medium, fontSize: 16 },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipOpen: { backgroundColor: theme.colors.chipError },
  chipAck: { backgroundColor: theme.colors.chipAck },
  chipText: { color: '#fff', fontSize: 16, fontFamily: theme.fonts.medium },
  footer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.subtleBorder,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceLight,
  },
  footerText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
});
