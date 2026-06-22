import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const GAP = 2;
const COLS = 3;
const PRESET_ROWS = 4;
const PRESET_CELLS = COLS * PRESET_ROWS; // 12
const PRESETS_KEY = '@comment_presets';

export const DishCommentPanel: React.FC = () => {
  const { selectedItemId, items, setItemComment, setActiveAction } = useOrderStore();
  const selectedItem = items.find(i => i.id === selectedItemId);
  const [text, setText] = useState('');
  const [presets, setPresets] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(PRESETS_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setPresets(parsed);
        } catch {}
      }
    });
  }, []);

  const savePresets = useCallback((next: string[]) => {
    setPresets(next);
    AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    setText(selectedItem?.comment || '');
  }, [selectedItemId]);

  if (!selectedItem) return null;

  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const activePresets = new Set(tokens.filter((t) => presets.includes(t)));

  const handleChangeText = (val: string) => {
    setText(val);
    setItemComment(selectedItem.id, val);
  };

  const handleClear = () => {
    setText('');
    setItemComment(selectedItem.id, '');
  };

  const handlePresetToggle = (preset: string) => {
    const next = activePresets.has(preset)
      ? tokens.filter((t) => t !== preset)
      : [...tokens, preset];
    const newText = next.join(', ');
    setText(newText);
    setItemComment(selectedItem.id, newText);
  };

  const handleSaveAsPreset = () => {
    const trimmed = text.trim();
    if (!trimmed || presets.includes(trimmed)) return;
    savePresets([...presets, trimmed]);
  };

  const handleDeletePreset = (preset: string) => {
    savePresets(presets.filter((p) => p !== preset));
    if (activePresets.has(preset)) {
      const newTokens = tokens.filter((t) => t !== preset);
      const newText = newTokens.join(', ');
      setText(newText);
      setItemComment(selectedItem.id, newText);
    }
  };

  const showSave = text.trim() && !presets.includes(text.trim());

  // Grid
  const gridCells: Array<{ kind: 'preset'; preset: string } | { kind: 'empty' }> = [];
  for (let i = 0; i < Math.min(presets.length, PRESET_CELLS); i++) {
    gridCells.push({ kind: 'preset', preset: presets[i] });
  }
  while (gridCells.length < PRESET_CELLS) gridCells.push({ kind: 'empty' });

  const rows = [];
  for (let r = 0; r < PRESET_ROWS; r++) {
    rows.push(gridCells.slice(r * COLS, r * COLS + COLS));
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setActiveAction(null)} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerText} numberOfLines={1}>
          {selectedItem.product.name}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Input + save button */}
      <View style={styles.inputRow}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleChangeText}
            placeholder="Комментарий..."
            placeholderTextColor={theme.colors.textSecondary}
          />
          {text ? (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.7}>
              <Feather name="x" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        {showSave && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAsPreset} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>Сохранить как пресет</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 4-row grid */}
      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.row, ri < PRESET_ROWS - 1 && { marginBottom: GAP }]}>
            {row.map((cell, ci) => {
              const key = `${ri}-${ci}`;
              const marginRight = ci < COLS - 1 ? GAP : 0;

              if (cell.kind === 'preset') {
                const isActive = activePresets.has(cell.preset);
                return (
                  <View key={key} style={[styles.cellWrap, { marginRight }]}>
                    <TouchableOpacity
                      style={[styles.presetCell, isActive && styles.presetCellActive]}
                      onPress={() => handlePresetToggle(cell.preset)}
                      onLongPress={() => handleDeletePreset(cell.preset)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.presetText, isActive && styles.presetTextActive]}
                        numberOfLines={2}
                      >
                        {cell.preset}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <View key={key} style={[styles.cellWrap, { marginRight }]}>
                  <View style={styles.emptyCell} />
                </View>
              );
            })}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },

  inputRow: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    marginBottom: GAP,
    padding: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    textAlignVertical: 'top',
    paddingTop: 4,
    outlineStyle: 'none',
  } as any,
  clearBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  saveBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.fonts.medium,
  },

  grid: { flex: PRESET_ROWS },
  row: { flex: 1, flexDirection: 'row' },
  cellWrap: { flex: 1 },

  presetCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 4,
  },
  presetCellActive: {
    backgroundColor: theme.colors.accent,
  },
  presetText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  presetTextActive: {
    color: '#fff',
  },

  emptyCell: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
  },
});
