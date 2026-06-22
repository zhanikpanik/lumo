import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { theme } from '../theme/colors';
import { SearchIcon, CrossIcon } from './Icons';
import { NotificationBell } from './NotificationBell';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';
import { useShiftStore } from '../store/shiftStore';

const LEFT = 0.35;
const MID = 0.25;
const RIGHT = 0.40;
const COL_GAP = 10;
const CELL_GAP = 10;
const PAD = 10;

const useSizes = () => {
  const { width: W } = useWindowDimensions();
  return useMemo(() => {
    const fs = W - 40;
    const rightW = RIGHT * fs;
    const backW = Math.round(LEFT / 3 * fs);
    // In search mode: edit button ends at left column right edge
    // leftColRight = PAD + LEFT * (W - 2*PAD)
    // editStart = PAD + back + COL_GAP
    // editSearchW = leftColRight - editStart
    const editSearchW = Math.round(LEFT * (W - 2 * PAD) - backW - COL_GAP);
    return {
      back: backW,
      edit:  Math.round((LEFT * 2 / 3 + MID) * fs),
      right: Math.round(rightW),
      leftCol: Math.round(LEFT * fs),
      productCell: Math.round((rightW - 4) / 3),
      editSearchW,
    };
  }, [W]);
};

interface Props {
  onBack: () => void;
  onEditPress: () => void;
  editActive?: boolean;
  searchMode: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onNotificationPress: () => void;
  hideRight?: boolean;
}

export const PosHeader: React.FC<Props> = ({
  onBack, onEditPress, editActive = false,
  searchMode, searchQuery,
  onSearchChange, onSearchOpen, onSearchClose,
  onNotificationPress,
  hideRight = false,
}) => {
  const S = useSizes();
  const currentUser = useShiftStore((s) => s.currentUser);
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const hasTables = useVenueStore((s) => s.venueType !== 'takeaway' && s.zones.length > 0);

  const orderNumber = currentOrder?.number || '';
  const tableNumber = currentOrder?.tableNumber || '';
  const guestCount = currentOrder?.guestCount ?? 1;
  const zone = currentOrder?.zone || '';
  const waiter = currentOrder?.waiter || '';
  const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const infoParts: string[] = [];
  if (orderNumber) infoParts.push(`Заказ №${orderNumber}`);
  if (hasTables) infoParts.push(tableNumber ? `Стол:${tableNumber}` : 'Без стола');
  infoParts.push(`Гостей:${guestCount}`);
  if (zone) infoParts.push(zone);
  if (waiter) infoParts.push(waiter);

  const renderInfo = () => (
    <View style={styles.infoRow}>
      {infoParts.map((p, i) => <Text key={i} style={styles.editSub}>{p}</Text>)}
    </View>
  );

  if (searchMode) {
    return (
      <View style={styles.row}>
        <TouchableOpacity style={[styles.brick, { width: S.back }]} onPress={onSearchClose}>
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.brick, { width: S.editSearchW, justifyContent: 'center', alignItems: 'center' }]}
          onPress={onEditPress} activeOpacity={0.7}
        >
          <Text style={styles.editTitle} numberOfLines={1}>Редактировать заказ</Text>
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <TextInput style={styles.searchInput} value={searchQuery} onChangeText={onSearchChange} autoFocus />
        </View>
        <TouchableOpacity style={[styles.brick, { width: S.productCell }]} onPress={() => onSearchChange('')}>
          <Text style={styles.clearText}>Очистить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.brick, { width: S.productCell }]} onPress={onSearchClose}>
          <CrossIcon size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.brick, { width: S.back }]} onPress={onBack}>
        <Text style={styles.backText}>Назад</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.brick, styles.editBrick, { width: S.edit }, editActive && styles.editActive]}
        onPress={onEditPress} activeOpacity={0.7}
      >
        <View style={styles.editLines}>
          <Text style={styles.editTitle} numberOfLines={1}>Редактировать заказ  {timeStr}</Text>
          {renderInfo()}
        </View>
      </TouchableOpacity>

      <View style={[styles.rightGroup, { width: S.right }]}>
        {hideRight ? null : (
          <>
            <View style={styles.userChip}>
              <View style={styles.onlineDot} />
              <Text style={styles.chipText} numberOfLines={1}>{currentUser?.name || ''}</Text>
            </View>
            <TouchableOpacity style={styles.rightItem} onPress={onNotificationPress}>
              <NotificationBell size={28} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.rightItem} onPress={onSearchOpen}>
              <SearchIcon size={28} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', paddingHorizontal: PAD, marginTop: PAD, marginBottom: PAD, gap: COL_GAP },
  brick: { height: 56, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  editBrick: { paddingHorizontal: 14, alignItems: 'flex-start' },
  editActive: { borderWidth: 1, borderColor: theme.colors.tabActive, backgroundColor: theme.colors.editActiveBg },
  editLines: { gap: 2, width: '100%' },
  infoRow: { flexDirection: 'row', gap: 16 },
  editTitle: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  editSub: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  rightGroup: { flexDirection: 'row', gap: CELL_GAP },
  rightItem: { flex: 1, height: 56, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  userChip: { flex: 1, height: 56, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.online },
  chipText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular, maxWidth: 120 },
  searchWrap: { flex: 1, height: 56, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.borderRadius, justifyContent: 'center', paddingHorizontal: 12 },
  searchInput: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular, height: '100%', outlineStyle: 'none' } as any,
  clearText: { color: theme.colors.textPrimary, fontSize: 14, fontFamily: theme.fonts.medium },
});
