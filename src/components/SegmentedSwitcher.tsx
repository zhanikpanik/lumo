import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { theme } from '../theme/colors';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}

/**
 * iOS-style segmented control: all options visible at once, the active one
 * highlighted. Use for short, fixed sets of choices where horizontal space
 * is not a concern.
 */
export function SegmentedSwitcher<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: theme.borderRadius,
    height: 56,
    padding: 3,
    gap: 2,
  },
  segment: {
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius - 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
  segmentActive: {
    backgroundColor: theme.colors.accentTint,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  labelActive: {
    color: theme.colors.accent,
  },
});
