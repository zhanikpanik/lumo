import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme/colors';
import { useOrderStore } from '../store/orderStore';
import { useMenuStore } from '../store/menuStore';
import { Product } from '../types';

const PRODUCT_COLS = 3;
const GAP = 6;

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const SearchMode: React.FC<Props> = ({ searchQuery }) => {
  const { addProduct, removeProduct, items } = useOrderStore();

  const orderedProductIds = new Set(items.map(i => i.product.id));

  const handleProductToggle = (product: Product) => {
    const existing = items.find(i => i.product.id === product.id);
    if (existing) {
      removeProduct(existing.id);
    } else {
      addProduct(product);
    }
  };

  const menuCategories = useMenuStore((s) => s.categories);
  const allProducts = useMenuStore((s) => s.allProducts);

  const getCategoryColor = (categoryId: string): string => {
    const cat = menuCategories.find(c => c.id === categoryId);
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
                    orderedProductIds.has(product.id) && styles.productCardOrdered,
                  ]}
                  onPress={() => handleProductToggle(product)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productPrice}>{product.price} ₽</Text>
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
    borderColor: '#00E676',
  },
  productCardEmpty: {
    flex: 1,
  },
  productName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  productPrice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  hintWrap: {
    padding: 40,
    alignItems: 'center',
  },
  hintText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
});
