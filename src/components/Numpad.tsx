import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';

// ── Types ──

export type NumpadMode = 'amount' | 'quantity';

export interface NumpadProps {
  mode: NumpadMode;
  value: string;
  onChange: (value: string) => void;
  title?: string;
  currency?: string;
  showClear?: boolean;
  maxDigits?: number;
  accumulate?: boolean;
  /** Optional content between value display and key grid — notes, presets, custom input. */
  children?: React.ReactNode;
}

// ── Constants ──

const GAP = 2;

const NUM_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
];

// ── Component ──

export const Numpad: React.FC<NumpadProps> = ({
  mode,
  value,
  onChange,
  title,
  currency = 'c',
  showClear = false,
  maxDigits,
  accumulate = true,
  children,
}) => {
  // Internal buffer allows temporary empty state (e.g. backspace from "1" → "")
  const [buffer, setBuffer] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    // Sync buffer when external value changes (not from our own onChange)
    if (value !== prevValue.current) {
      setBuffer(value);
    }
    prevValue.current = value;
  }, [value]);

  const handleKey = (key: string) => {
    if (key === 'del') {
      const next = buffer.slice(0, -1);
      setBuffer(next);
      if (mode === 'quantity' && !next) return; // don't commit empty to store
      onChange(next || (mode === 'amount' ? '0' : ''));
      return;
    }
    if (key === 'C') {
      setBuffer('0');
      onChange('0');
      return;
    }

    if (mode === 'amount') {
      const limit = maxDigits ?? 9;
      if (key === '00') {
        if (buffer === '0') return;
        const next = buffer + '00';
        if (next.replace(',', '').length > limit) return;
        setBuffer(next);
        onChange(next);
        return;
      }
      if (key === ',') {
        if (buffer.includes(',')) return;
        const next = buffer + ',';
        setBuffer(next);
        onChange(next);
        return;
      }
      const next = buffer === '0' ? key : buffer + key;
      if (next.replace(',', '').length > limit) return;
      setBuffer(next);
      onChange(next);
      return;
    }

    // quantity
    if (key === ',' || key === '00') return;
    const limit = maxDigits ?? 3;
    if (!accumulate) {
      setBuffer(key);
      onChange(key);
      return;
    }
    const next = buffer + key;
    if (next.length > limit) return;
    setBuffer(next);
    onChange(next);
  };

  const formatAmount = (v: string) => {
    if (v === '0' || v === '') return '0';
    const parts = v.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',');
  };

  const bottomRow: string[] = mode === 'amount' && showClear
    ? ['C', '0', 'del']
    : mode === 'amount'
      ? ['0', '00', 'del']
      : ['0', ',', 'del'];

  // Value row + 4 key rows = 5 equal-height rows
  const allKeyRows = [...NUM_ROWS, bottomRow];

  const renderKey = (key: string, col: number, rounded?: 'bl' | 'br') => {
    const isDel = key === 'del';
    const isComma = key === ',';
    const inactive = (mode === 'quantity' && isComma);

    const keyStyle = [
      styles.key,
      rounded === 'bl' && styles.keyRoundBL,
      rounded === 'br' && styles.keyRoundBR,
    ];

    return (
      <TouchableOpacity
        key={`${key}-${col}`}
        style={keyStyle}
        onPress={() => !inactive && handleKey(key)}
        activeOpacity={inactive ? 1 : 0.6}
        disabled={inactive}
      >
        {isDel ? (
          <Feather name="delete" size={22} color={theme.colors.textSecondary} />
        ) : (
          <Text style={[styles.keyText, inactive && styles.keyTextInactive]}>{key}</Text>
        )}
      </TouchableOpacity>
    );
  };

  // All modes: leftmost key gets bottom-left radius, rightmost (del) gets bottom-right
  const bottomRounded: (undefined | 'bl' | 'br')[] = ['bl', undefined, 'br'];

  return (
    <View style={styles.container}>
      {/* Label — только если передан title */}
      {title ? (
        <View style={styles.label}>
          <Text style={styles.labelText}>{title}</Text>
        </View>
      ) : null}

      {/* Value + keys share remaining height equally (5 rows total) */}
      <View style={styles.body}>
        {/* Value display — 1 row */}
        <View style={styles.valueDisplay}>
          <Text style={styles.valueText} numberOfLines={1} adjustsFontSizeToFit>
            {mode === 'amount'
              ? `${formatAmount(buffer)} ${currency}`
              : (buffer || '0')}
          </Text>
        </View>

        {/* Inline slot — between value and keys (notes, presets, comment) */}
        {children ? (
          <View style={styles.inline}>{children}</View>
        ) : null}

        {/* Key rows — 4 rows */}
        {allKeyRows.map((row, ri) => {
          const isBottom = ri === allKeyRows.length - 1;
          return (
            <View key={ri} style={styles.keyRow}>
              {row.map((k, ci) => {
                const rounded = isBottom ? bottomRounded[ci] : undefined;
                return renderKey(k, ci, rounded);
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Label
  label: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    borderTopLeftRadius: theme.borderRadius,
    borderTopRightRadius: theme.borderRadius,
    marginBottom: GAP,
  },
  labelText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },

  // Body: value + keys share height equally
  body: {
    flex: 1,
    gap: GAP,
  },

  // Value display — same height as one key row (flex: 1)
  valueDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.numpadBg,
    paddingHorizontal: 20,
  },
  valueText: {
    color: theme.colors.textPrimary,
    fontSize: 40,
    fontFamily: theme.fonts.regular,
  },

  // Key row — same height as value display
  keyRow: {
    flex: 1,
    flexDirection: 'row',
    gap: GAP,
  },

  // Keys — no radius by default
  key: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Only 0 gets bottom-left, backspace gets bottom-right
  keyRoundBL: {
    borderBottomLeftRadius: theme.borderRadius,
  },
  keyRoundBR: {
    borderBottomRightRadius: theme.borderRadius,
  },
  keyText: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontFamily: theme.fonts.medium,
  },
  keyTextInactive: {
    color: theme.colors.textDisabled,
  },

  // Inline slot — between value and keys (notes, presets, comment)
  inline: {
    paddingBottom: GAP,
  },
});
