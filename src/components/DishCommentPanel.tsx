import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const PRESETS = [
  'Без лука',
  'Без соуса',
  'Острое',
  'Не острое',
  'Без соли',
  'Без сахара',
  'Medium rare',
  'Medium',
  'Well done',
  'Без льда',
  'Двойная порция',
  'На вынос',
];

const GAP = 2;
const COLS = 3;

export const DishCommentPanel: React.FC = () => {
  const { selectedItemId, items, setItemComment } = useOrderStore();
  const selectedItem = items.find(i => i.id === selectedItemId);
  const [text, setText] = useState('');

  useEffect(() => {
    setText(selectedItem?.comment || '');
  }, [selectedItemId]);

  if (!selectedItem) return null;

  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const activePresets = new Set(tokens.filter((t) => PRESETS.includes(t)));

  const handlePreset = (preset: string) => {
    const next = activePresets.has(preset)
      ? tokens.filter((t) => t !== preset)
      : [...tokens, preset];
    const newText = next.join(', ');
    setText(newText);
    setItemComment(selectedItem.id, newText);
  };

  const handleChangeText = (val: string) => {
    setText(val);
    setItemComment(selectedItem.id, val);
  };

  const handleClear = () => {
    setText('');
    setItemComment(selectedItem.id, '');
  };

  const rows: string[][] = [];
  for (let i = 0; i < PRESETS.length; i += COLS) {
    rows.push(PRESETS.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Комментарий к блюду</Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder="Введите комментарий..."
          placeholderTextColor={theme.colors.textSecondary}
          multiline
        />
      </View>

      {text ? (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.7}>
          <Text style={styles.clearText}>Очистить</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.presetsGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.presetRow, ri < rows.length - 1 && { marginBottom: GAP }]}>
            {row.map((preset, ci) => {
              const isActive = activePresets.has(preset);
              return (
                <View key={preset} style={[styles.presetWrap, ci < COLS - 1 && { marginRight: GAP }]}>
                  <TouchableOpacity
                    style={[styles.presetBtn, isActive && styles.presetBtnActive]}
                    onPress={() => handlePreset(preset)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetText, isActive && styles.presetTextActive]}>{preset}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {row.length < COLS &&
              Array.from({ length: COLS - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={[styles.presetWrap, { marginRight: i < COLS - row.length - 1 ? GAP : 0 }]}>
                  <View style={styles.emptyCell} />
                </View>
              ))
            }
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  inputRow: {
    height: 80,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
    padding: 12,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    textAlignVertical: 'top',
    outlineStyle: 'none',
  } as any,
  clearBtn: {
    height: 40,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: GAP,
  },
  clearText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  presetsGrid: {
    flex: 1,
  },
  presetRow: {
    flex: 1,
    flexDirection: 'row',
  },
  presetWrap: { flex: 1 },
  presetBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 4,
  },
  presetBtnActive: {
    backgroundColor: theme.colors.accent,
  },
  presetText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  presetTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyCell: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
  },
});
