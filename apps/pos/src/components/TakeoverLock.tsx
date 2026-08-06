import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather } from '../components/Feather';
import { theme } from '../theme/colors';
import { useInstantVenue } from '../store/useInstantVenue';

interface Props {
  onTakeover: (waiterName: string) => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export const TakeoverLock: React.FC<Props> = ({ onTakeover }) => {
  const { employees } = useInstantVenue();
  const waiters = employees.map(e => ({ name: e.name, pin: e.pinCredential?.pinVerifier ?? '' }));
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start(() => setError(false));
    }
  }, [error, shakeAnim]);

  const handleDigit = (d: string) => {
    if (d === '' || pin.length >= 4) return;
    const newPin = pin + d;
    setPin(newPin);

    if (newPin.length === 4) {
      const match = waiters.find(w => w.pin === newPin);
      if (match) {
        setPin('');
        onTakeover(match.name);
      } else {
        setError(true);
        setPin('');
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const masked = pin.replace(/./g, '●');

  const rows: string[][] = [];
  for (let r = 0; r < 4; r++) {
    rows.push(DIGITS.slice(r * 3, r * 3 + 3));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="lock" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.headerText}>Введите ваш пин, чтобы начать работу с заказом</Text>
      </View>

      <Animated.View style={[styles.displayRow, { transform: [{ translateX: shakeAnim }] }]}>
        <Text style={[styles.displayText, error && styles.displayTextError]}>
          {masked || '····'}
        </Text>
      </Animated.View>

      <View style={styles.numpad}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.numpadRow}>
            {row.map((d, ci) => {
              if (d === '') {
                return <View key={ci} style={styles.keyWrapper} />;
              }
              if (d === 'del') {
                return (
                  <View key={ci} style={styles.keyWrapper}>
                    <TouchableOpacity
                      style={styles.key}
                      onPress={handleDelete}
                      activeOpacity={0.6}
                      disabled={pin.length === 0}
                    >
                      <Feather name="delete" size={24} color={pin.length === 0 ? theme.colors.textDisabled : theme.colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                );
              }
              return (
                <View key={ci} style={styles.keyWrapper}>
                  <TouchableOpacity
                    style={styles.key}
                    onPress={() => handleDigit(d)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.keyText}>{d}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {error && (
        <Text style={styles.errorText}>Неверный пин</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: 20,
    justifyContent: 'center',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
      fontFamily: theme.fonts.regular,
    textAlign: 'center',
  },
  displayRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  displayText: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontFamily: theme.fonts.regular,
    letterSpacing: 8,
  },
  displayTextError: {
    color: '#FF8A65',
  },
  numpad: {
    gap: 8,
    alignItems: 'center',
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keyWrapper: {
    width: 72,
    height: 56,
  },
  key: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 10,
  },
  keyText: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontFamily: theme.fonts.regular,
  },
  errorText: {
    color: '#FF8A65',
    fontSize: 16,
    textAlign: 'center',
    fontFamily: theme.fonts.medium,
  },
});
