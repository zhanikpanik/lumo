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
import { useShiftStore } from '../store/shiftStore';
import { can } from '../utils/permissions';

const formatAmount = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface Props {
  navigation: any;
}

export const OpenShiftScreen: React.FC<Props> = ({ navigation }) => {
  const [amount, setAmount] = useState('0');
  const openShift = useShiftStore((s) => s.openShift);
  const currentUser = useShiftStore((s) => s.currentUser);
  const canOpenShift = can(currentUser?.role, 'openShift');

  const handleDigit = (digit: string) => {
    if (amount === '0') {
      setAmount(digit);
    } else {
      setAmount(amount + digit);
    }
  };

  const handleBackspace = () => {
    if (amount.length <= 1) {
      setAmount('0');
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  const handleClear = () => setAmount('0');

  const handleOpen = () => {
    if (!canOpenShift) return;
    openShift(parseInt(amount) || 0);
    navigation.replace('Orders');
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Открытие смены</Text>
          <Text style={styles.cashierName}>{currentUser?.name}</Text>
          <Text style={styles.subtitle}>Введите сумму наличных в кассе</Text>

          {/* Amount display */}
          <View style={styles.amountWrap}>
            <Text style={styles.amount}>{formatAmount(parseInt(amount) || 0)} c</Text>
          </View>

          {/* Numpad */}
          <View style={styles.numpad}>
            {keys.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.numRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.numKey,
                      key === 'C' && styles.numKeySpecial,
                      key === '⌫' && styles.numKeySpecial,
                    ]}
                    onPress={() => {
                      if (key === 'C') handleClear();
                      else if (key === '⌫') handleBackspace();
                      else handleDigit(key);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={[
                      styles.numText,
                      (key === 'C' || key === '⌫') && styles.numTextSpecial,
                    ]}>
                      {key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
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

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              if (!canOpenShift) return;
              openShift(0);
              navigation.replace('Orders');
            }}
            disabled={!canOpenShift}
          >
            <Text style={styles.skipText}>Пропустить (0c в кассе)</Text>
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
    marginBottom: 32,
  },
  amountWrap: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  amount: {
    fontSize: 36,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  numpad: {
    gap: 10,
    marginBottom: 24,
  },
  numRow: {
    flexDirection: 'row',
    gap: 10,
  },
  numKey: {
    width: 96,
    height: 64,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numKeySpecial: {
    backgroundColor: theme.colors.surfaceLight,
  },
  numText: {
    fontSize: 24,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
  },
  numTextSpecial: {
    fontSize: 20,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
  },
  openBtn: {
    width: '100%',
    height: 56,
    backgroundColor: '#00C853',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  waiterHint: {
    color: '#FF8A80',
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  openBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  skipBtn: {
    padding: 12,
  },
  skipText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
});
