import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

export const ModifierQuantityNumpad: React.FC = () => {
  const { draftItem, selectedModifierId, setModifierQuantity } = useOrderStore();

  const modifier = draftItem?.modifiers.find(m => m.id === selectedModifierId);
  if (!modifier) return null;

  const count = draftItem!.modifiers.filter(m => m.id === modifier.id).length;

  const handleDigit = (digit: number) => {
    setModifierQuantity(modifier.id, digit);
  };

  const keys = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>{modifier.name}</Text>
      </View>

      <View style={styles.amountWrap}>
        <Text style={styles.amount}>×{count}</Text>
      </View>

      <View style={styles.numpad}>
        {keys.map((row, ri) => (
          <View key={ri} style={styles.numRow}>
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.numKey}
                onPress={() => handleDigit(key)}
                activeOpacity={0.6}
              >
                <Text style={styles.numText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <View style={styles.numRow}>
          <TouchableOpacity
            style={styles.numKey}
            onPress={() => handleDigit(0)}
            activeOpacity={0.6}
          >
            <Text style={styles.numText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.numKey, styles.delKey]}
            onPress={() => handleDigit(Math.max(0, count - 1))}
            activeOpacity={0.6}
          >
            <Feather name="delete" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  headerText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '600' },
  amountWrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    marginHorizontal: 16,
  },
  amount: {
    color: '#00E676',
    fontSize: 36,
    fontWeight: '700',
  },
  numpad: {
    paddingHorizontal: 16,
    gap: 10,
  },
  numRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  numKey: {
    width: 72,
    height: 56,
    borderRadius: theme.borderRadius,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  delKey: {
    backgroundColor: theme.colors.surfaceLight,
  },
  numText: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '500',
  },
});
