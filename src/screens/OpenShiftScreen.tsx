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
import { useShiftStore } from '../store/shiftStore';
import { can } from '../utils/permissions';

interface Props {
  navigation: any;
}

export const OpenShiftScreen: React.FC<Props> = ({ navigation }) => {
  const [amount, setAmount] = useState('0');
  const openShift = useShiftStore((s) => s.openShift);
  const currentUser = useShiftStore((s) => s.currentUser);
  const canOpenShift = can(currentUser?.role, 'openShift');

  const handleOpen = () => {
    if (!canOpenShift) return;
    openShift(parseInt(amount) || 0);
    navigation.replace('Orders');
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

          {/* Open button */}
          {!canOpenShift ? (
            <Text style={styles.waiterHint}>
              Официант не может открыть смену. Дождитесь кассира или менеджера.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.openBtn, !canOpenShift && styles.btnDisabled]}
            onPress={handleOpen}
            activeOpacity={0.8}
            disabled={!canOpenShift}
          >
            <Text style={styles.openBtnText}>Открыть смену</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

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
  openBtn: {
    width: '100%',
    height: 56,
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  btnDisabled: {
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
  openBtnText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
});
