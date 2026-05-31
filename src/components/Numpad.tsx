import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/colors';

export type NumpadKey = { label: string; value: string; span?: number };

interface Props {
  keys: NumpadKey[][];
  onPress: (value: string) => void;
  /** Optional: render a custom key instead of the default */
  renderKey?: (key: NumpadKey) => React.ReactNode;
  /** Style variant */
  variant?: 'circle' | 'rounded';
}

export const Numpad: React.FC<Props> = ({ keys, onPress, renderKey, variant = 'rounded' }) => (
  <View style={styles.container}>
    {keys.map((row, ri) => (
      <View key={ri} style={styles.row}>
        {row.map((k) => (
          <TouchableOpacity
            key={k.value || `empty-${ri}`}
            style={[
              variant === 'circle' ? styles.keyCircle : styles.keyRounded,
              !k.label && styles.keyEmpty,
              k.span ? { flex: k.span } : undefined,
            ]}
            onPress={() => k.value && onPress(k.value)}
            activeOpacity={k.value ? 0.6 : 1}
            disabled={!k.value}
          >
            {renderKey ? renderKey(k) : (
              <Text style={variant === 'circle' ? styles.labelCircle : styles.labelRounded}>
                {k.label}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  keyRounded: {
    width: 96,
    height: 64,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyEmpty: {
    backgroundColor: 'transparent',
  },
  labelRounded: {
    fontSize: 24,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  labelCircle: {
    fontSize: 28,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
});
