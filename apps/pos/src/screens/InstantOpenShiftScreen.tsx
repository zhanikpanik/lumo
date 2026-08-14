import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { theme } from '../theme/colors';
import { Numpad } from '../components/Numpad';
import { useUserStore } from '../store/userStore';
import { can } from '../utils/permissions';
import { openPosShift } from '../data/posCommands';
import { useInstantShift } from '../store/useInstantShift';

interface Props {
  navigation: any;
}

export function InstantOpenShiftScreen({ navigation }: Props) {
  const [amount, setAmount] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useUserStore((s) => s.currentUser);
  const canOpenShift = can(currentUser?.role, 'openShift');

  const { isLoading } = useInstantShift(currentUser?.id);

  const handleOpen = async () => {
    if (submitting) return;
    if (!canOpenShift) {
      setError('Нет прав на открытие смены');
      return;
    }
    if (!currentUser) {
      setError('Пользователь не выбран');
      return;
    }

    setSubmitting(true);
    try {
      const startingCashTiyin = (parseInt(amount) || 0) * 100;
      const operationId = `shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await openPosShift({
        operationId,
        actorEmployeeId: currentUser.id,
        startingCashTiyin,
      });

      // useInstantShift will detect the new shift reactively — just navigate
      navigation.replace('Orders');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('openShift failed:', e);
      // Race condition: another device opened shift between our check and write.
      // useInstantShift will detect it reactively — just navigate.
      if (msg.includes('already open') || msg.includes('unique') || msg.includes('duplicate')) {
        navigation.replace('Orders');
        return;
      }
      setError(`Ошибка: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Открытие смены</Text>
          <Text style={styles.cashierName}>{currentUser?.name}</Text>
          <Text style={styles.subtitle}>Введите сумму наличных в кассе</Text>

          <View style={styles.numpadWrap}>
            <Numpad
              mode="amount"
              value={amount}
              onChange={setAmount}
              currency="c"
              showClear
            />
          </View>

          {isLoading && <Text style={styles.loading}>Проверка смены...</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          {!canOpenShift ? (
            <Text style={styles.waiterHint}>
              Официант не может открыть смену. Дождитесь кассира или менеджера.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.openBtn, (submitting || isLoading || !canOpenShift) && styles.openBtnDisabled]}
            onPress={handleOpen}
            disabled={submitting || isLoading || !canOpenShift}
            activeOpacity={0.7}
          >
            <Text style={styles.openText}>
              {submitting ? 'Открываем...' : 'Открыть смену'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    width: 320,
  },
  numpadWrap: {
    width: '100%',
    height: 340,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  cashierName: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.tabActive,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  loading: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    marginBottom: 12,
  },
  error: {
    color: theme.colors.destructive,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  openBtn: {
    width: '100%',
    height: 56,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  openBtnDisabled: {
    opacity: 0.45,
  },
  waiterHint: {
    color: theme.colors.warningSubtle,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
    lineHeight: 20,
  },
  openText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
});
