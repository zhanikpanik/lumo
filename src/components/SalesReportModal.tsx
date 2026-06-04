import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const formatAmount = (amount: number): string => {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' c';
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Period = 'today' | 'yesterday' | 'week';

export const SalesReportModal: React.FC<Props> = ({ visible, onClose }) => {
  const [period, setPeriod] = useState<Period>('today');
  const orders = useOrderStore((s) => s.orders);

  // Mock historical data for yesterday and week
  const mockData: Record<Period, {
    orderCount: number;
    totalRevenue: number;
    paidCount: number;
    paidTotal: number;
    activeCount: number;
    activeTotal: number;
    alertCount: number;
    alertTotal: number;
  }> = {
    today: {
      orderCount: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.totalAmount, 0),
      paidCount: orders.filter((o) => o.status === 'paid').length,
      paidTotal: orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.totalAmount, 0),
      activeCount: orders.filter((o) => o.status === 'active').length,
      activeTotal: orders.filter((o) => o.status === 'active').reduce((sum, o) => sum + o.totalAmount, 0),
      alertCount: orders.filter((o) => o.status === 'alert').length,
      alertTotal: orders.filter((o) => o.status === 'alert').reduce((sum, o) => sum + o.totalAmount, 0),
    },
    yesterday: {
      orderCount: 24,
      totalRevenue: 67450,
      paidCount: 22,
      paidTotal: 61200,
      activeCount: 0,
      activeTotal: 0,
      alertCount: 2,
      alertTotal: 6250,
    },
    week: {
      orderCount: 156,
      totalRevenue: 482300,
      paidCount: 143,
      paidTotal: 438700,
      activeCount: 5,
      activeTotal: 18900,
      alertCount: 8,
      alertTotal: 24700,
    },
  };

  const data = mockData[period];
  const { orderCount, totalRevenue, paidCount, paidTotal, activeCount, activeTotal, alertCount, alertTotal } = data;
  const avgCheck = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'yesterday', label: 'Вчера' },
    { key: 'week', label: 'Неделя' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Отчёт по продажам</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Period tabs */}
          <View style={styles.tabsRow}>
            {periods.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.tab, period === p.key && styles.tabActive]}
                onPress={() => setPeriod(p.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, period === p.key && styles.tabTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Stats */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Main stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{orderCount}</Text>
                <Text style={styles.statLabel}>Заказов</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatAmount(totalRevenue)}</Text>
                <Text style={styles.statLabel}>Итого</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatAmount(avgCheck)}</Text>
                <Text style={styles.statLabel}>Средний чек</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Breakdown */}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Оплачено</Text>
              <Text style={styles.breakdownValue}>{paidCount} заказов · {formatAmount(paidTotal)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Открытые</Text>
              <Text style={styles.breakdownValue}>{activeCount} заказов · {formatAmount(activeTotal)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, alertCount > 0 && styles.alertText]}>
                Требуют внимания
              </Text>
              <Text style={[styles.breakdownValue, alertCount > 0 && styles.alertText]}>
                {alertCount} заказов · {formatAmount(alertTotal)}
              </Text>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Общая сумма</Text>
              <Text style={styles.totalValue}>{formatAmount(totalRevenue)}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '40%',
    maxWidth: 480,
    minWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.tabActive,
  },
  tabText: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  breakdownValue: {
    fontSize: 16,
      fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
  },
  alertText: {
    color: '#D32F2F',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
});
