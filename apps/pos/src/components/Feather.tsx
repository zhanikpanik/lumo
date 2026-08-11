import React from 'react';
import { Text, type TextProps } from 'react-native';

/**
 * Drop-in replacement for Feather icons on web.
 * Maps common icon names to Unicode/emoji equivalents.
 * Native builds still use @expo/vector-icons via the original import.
 */

const ICON_MAP: Record<string, string> = {
  'plus': '+',
  'plus-circle': '⊕',
  'minus-circle': '⊖',
  'check': '✓',
  'check-circle': '✔',
  'delete': '⌫',
  'x': '✕',
  'arrow-left': '←',
  'chevron-down': '▼',
  'chevron-up': '▲',
  'briefcase': '💼',
  'map': '🗺',
  'users': '👥',
  'inbox': '📭',
  'lock': '🔒',
  'truck': '🚚',
  'search': '🔍',
};

interface Props extends TextProps {
  name: string;
  size?: number;
  color?: string;
}

export function Feather({ name, size = 16, color = '#000', style, ...rest }: Props) {
  return (
    <Text style={[{ fontSize: size, color, lineHeight: size + 4 }, style]} {...rest}>
      {ICON_MAP[name] ?? '?'}
    </Text>
  );
}
