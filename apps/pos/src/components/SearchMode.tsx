import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { Product, Category, OrderItem } from '../types';

const PRODUCT_COLS = 3;
const GAP = 6;

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Order items from InstantDB (for quantity badges) */
  items: OrderItem[];
  /** Category list from InstantDB menu data */
  categories: Category[];
  /** All products from InstantDB menu data */
  allProducts: Product[];
  /** Called when a product is tapped */
  onAddItem: (product: Product) => void;
}

export const SearchMode: React.FC<Props> = ({ searchQuery, items, categories, allProducts, onAddItem }) => {
  const orderedQty = new Map<string, number>();
  items.forEach(i => {
    orderedQty.set(i.product.id, (orderedQty.get(i.product.id) || 0) + i.quantity);
  });

  const getCategoryColor = (categoryId: string): string => {
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.colorHex : '#333';
  };

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [searchQuery, allProducts]);

  // Build product grid rows
  const productRows: Product[][] = [];
  for (let i = 0; i < filtered.length; i += PRODUCT_COLS) {
    productRows.push(filtered.slice(i, i + PRODUCT_COLS));
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.productArea}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {searchQuery.trim() === '' ? (
          <View style={styles.hintWrap}>
            <Text style={styles.hintText}>Начните вводить название блюда</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.hintWrap}>
            <Text style={styles.hintText}>Ничего не найдено</Text>
          </View>
        ) : (
          productRows.map((row, ri) => (
            <View key={ri} style={styles.productRow}>
              {row.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={[
                    styles.productCard,
                    { backgroundColor: getCategoryColor(product.categoryId) },
                    (orderedQty.get(product.id) || 0) > 0 && styles.productCardOrdered,
                  ]}
                  onPress={() => onAddItem(product)}
                  activeOpacity={0.7}
                >
                  {(orderedQty.get(product.id) || 0) > 0 && (
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>×{orderedQty.get(product.id)}</Text>
                    </View>
                  )}
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productPrice}>{product.price / 100} c</Text>
                </TouchableOpacity>
              ))}
              {Array.from({ length: PRODUCT_COLS - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.productCardEmpty} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingLeft: GAP,
    paddingTop: GAP,
  },
  productArea: {
    flex: 1,
  },
  productRow: {
    flexDirection: 'row',
    marginBottom: GAP,
    gap: GAP,
  },
  productCard: {
    flex: 1,
    height: 100,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  productCardOrdered: {
    borderWidth: 3,
    borderColor: theme.colors.accentLight,
  },
  qtyBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: theme.colors.accentLight,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  qtyBadgeText: {
    color: '#000',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
  },
  productCardEmpty: {
    flex: 1,
  },
  productName: {
    color: '#fff',
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
    marginBottom: 4,
  },
  productPrice: {
    color: theme.colors.whiteAlpha70,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  hintWrap: {
    padding: 40,
    alignItems: 'center',
  },
  hintText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
});
