import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { theme } from '../theme/colors';
import { Product } from '../types';

interface Props {
  product: Product;
  colorHex: string;
  onPress: () => void;
}

export const ProductCard: React.FC<Props> = ({ product, colorHex, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colorHex }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{product.name}</Text>
          {product.hasModifiers && <Text style={styles.modifierPlus}>+</Text>}
        </View>
        <Text style={styles.price}>{product.price} сом</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    margin: 6,
    borderRadius: theme.borderRadius,
    padding: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  modifierPlus: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    opacity: 0.4,
  },
  price: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.9,
  },
});
