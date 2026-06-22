import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { OrderItem as OrderItemType } from '../types';

interface Props {
  item: OrderItemType;
  isSelected?: boolean;
}

export const OrderItem: React.FC<Props> = ({ item, isSelected }) => {
  const itemTotal = (item.product.price + item.modifiers.reduce((sum, m) => sum + m.price, 0)) * item.quantity;

  return (
    <View style={[styles.container, isSelected && styles.selectedContainer]}>
      <View style={styles.nameCol}>
        <Text style={[styles.name, isSelected && styles.selectedText]} numberOfLines={1}>
          {item.product.name}
        </Text>
        {!!item.comment && (
          <Text style={[styles.comment, isSelected && styles.commentSelected]} numberOfLines={1}>
            {item.comment}
          </Text>
        )}
      </View>
      
      <Text style={[styles.quantity, isSelected && styles.selectedText]}>
        {item.quantity}
      </Text>
      
      <Text style={[styles.price, isSelected && styles.selectedText]}>
        {itemTotal} c
      </Text>
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    backgroundColor: 'transparent',
  },
  selectedContainer: {
    backgroundColor: theme.colors.orderItemActive,
  },
  nameCol: {
    flex: 1,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
  },
  comment: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    marginTop: 2,
  },
  commentSelected: {
    color: theme.colors.orderItemActiveText,
    opacity: 0.7,
  },
  quantity: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    width: 30,
    textAlign: 'center',
  },
  price: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    width: 60,
    textAlign: 'right',
  },
  selectedText: {
    color: theme.colors.orderItemActiveText,
    fontFamily: theme.fonts.medium,
  },

});
