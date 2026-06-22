import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';

const GAP = 2;

export const QuantityNumpad: React.FC = () => {
  const {
    selectedItemId,
    selectedModifierId,
    items,
    draftItem,
    updateQuantity,
    setModifierQuantity,
  } = useOrderStore();

  const selectedItem = items.find(item => item.id === selectedItemId);
  const isModifierMode = !!selectedModifierId;
  const modifier = isModifierMode
    ? draftItem?.modifiers.find(m => m.id === selectedModifierId)
    : null;

  const [inputValue, setInputValue] = useState('');

  // Reset input when selection changes
  useEffect(() => {
    if (isModifierMode && modifier && draftItem) {
      const count = draftItem.modifiers.filter(m => m.id === modifier.id).length;
      setInputValue(String(count));
    } else if (selectedItem) {
      setInputValue(String(selectedItem.quantity));
    } else {
      setInputValue('');
    }
  }, [selectedItemId, selectedModifierId, isModifierMode]);

  if (!selectedItem) return null;

  const currentQty = isModifierMode && modifier && draftItem
    ? draftItem.modifiers.filter(m => m.id === modifier.id).length
    : selectedItem.quantity;

  const headerTitle = isModifierMode && modifier
    ? modifier.name
    : 'Кол-во порций';

  const displayValue = inputValue || String(currentQty);

  const applyValue = (val: string) => {
    const newQty = parseInt(val, 10);
    if (isNaN(newQty) || newQty < 0) return;

    if (isModifierMode && modifier) {
      setModifierQuantity(modifier.id, newQty);
    } else {
      const delta = newQty - selectedItem.quantity;
      updateQuantity(selectedItem.id, delta);
    }
  };

  const handlePress = (num: string) => {
    const newValue = inputValue + num;
    if (newValue.length > 3) return;
    setInputValue(newValue);
    applyValue(newValue);
  };

  const handleBackspace = () => {
    const newValue = inputValue.slice(0, -1);
    setInputValue(newValue);
    if (newValue) {
      applyValue(newValue);
    } else {
      setInputValue('');
    }
  };

  const handleComma = () => {
    // Decimal not used for quantity
  };

  const renderKey = (label: string, onPress: () => void) => (
    <View style={styles.keyWrapper}>
      <TouchableOpacity style={styles.key} onPress={onPress} activeOpacity={0.6}>
        <Text style={styles.keyText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>{headerTitle}</Text>
      </View>

      {/* Display + numpad */}
      <View style={styles.body}>
        {/* Top: large quantity display */}
        <View style={styles.displayRow}>
          <View style={styles.displayCell}>
            <Text style={styles.displayValue}>{displayValue}</Text>
          </View>
        </View>

        {/* Numpad grid: 7-8-9 / 4-5-6 / 1-2-3 / 0-,-← */}
        <View style={styles.numpadRow}>
          {renderKey('7', () => handlePress('7'))}
          {renderKey('8', () => handlePress('8'))}
          {renderKey('9', () => handlePress('9'))}
        </View>
        <View style={styles.numpadRow}>
          {renderKey('4', () => handlePress('4'))}
          {renderKey('5', () => handlePress('5'))}
          {renderKey('6', () => handlePress('6'))}
        </View>
        <View style={styles.numpadRow}>
          {renderKey('1', () => handlePress('1'))}
          {renderKey('2', () => handlePress('2'))}
          {renderKey('3', () => handlePress('3'))}
        </View>
        <View style={styles.numpadRow}>
          {renderKey('0', () => handlePress('0'))}
          {renderKey(',', handleComma)}
          <View style={styles.keyWrapper}>
            <TouchableOpacity style={styles.key} onPress={handleBackspace} activeOpacity={0.6}>
              <Text style={styles.backspaceText}>←</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceDeep,
  },
  header: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  headerText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  body: {
    flex: 1,
    padding: GAP,
  },
  displayRow: {
    flex: 1,
    marginBottom: GAP,
  },
  displayCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
    backgroundColor: theme.colors.numpadBg,
    borderRadius: theme.borderRadius,
  },
  displayValue: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontFamily: theme.fonts.regular,
  },
  numpadRow: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: GAP,
  },
  keyWrapper: {
    flex: 1,
    marginHorizontal: GAP / 2,
  },
  key: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.numpadBg,
    borderRadius: theme.borderRadius,
  },
  keyText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontFamily: theme.fonts.regular,
  },
  backspaceText: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontFamily: theme.fonts.regular,
  },
});
