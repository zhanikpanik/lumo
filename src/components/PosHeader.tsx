import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { SearchIcon, NotificationIcon } from './Icons';
import { useOrderStore } from '../store/orderStore';
import { useVenueStore } from '../store/venueStore';
import { useShiftStore } from '../store/shiftStore';

const LEFT = 0.35;
const MID = 0.25;
const RIGHT = 0.40;
const COL_GAP = 10;
const CELL_GAP = 2;
const PAD = 10;

const useSizes = () => {
  const { width: W } = useWindowDimensions();
  return useMemo(() => {
    const fs = W - 40;
    return {
      back:  Math.round(LEFT / 3 * fs),
      edit:  Math.round((LEFT * 2 / 3 + MID) * fs),
      right: Math.round(RIGHT * fs),
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
}

export const PosHeader: React.FC<Props> = ({
  onBack, onEditPress, editActive = false,
  searchMode, searchQuery,
  onSearchChange, onSearchOpen, onSearchClose,
}) => {
  const S = useSizes();
  const currentUser = useShiftStore((s) => s.currentUser);
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const hasTables = useVenueStore((s) => s.venueType !== 'takeaway' && s.zones.length > 0);

  const tableNumber = currentOrder?.tableNumber || '';
  const zone = currentOrder?.zone || '';
  const waiter = currentOrder?.waiter || '';

  const infoParts: string[] = [];
  if (hasTables) infoParts.push(tableNumber ? `Стол:${tableNumber}` : 'Без стола');
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
          style={[styles.brick, styles.editBrick, { width: S.back * 2 }]}
          onPress={onEditPress} activeOpacity={0.7}
        >
          <View style={styles.editLines}>
            <Text style={styles.editTitle} numberOfLines={1}>Редактировать заказ</Text>
            {renderInfo()}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', gap: COL_GAP }}>
          <View style={styles.searchWrap}>
            <TextInput style={styles.searchInput} value={searchQuery} onChangeText={onSearchChange} autoFocus />
          </View>
          <TouchableOpacity style={styles.clearBtn} onPress={() => onSearchChange('')}>
            <Text style={styles.clearText}>Очистить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.brick} onPress={onSearchClose}>
            <Feather name="x" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
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
          <Text style={styles.editTitle} numberOfLines={1}>Редактировать заказ</Text>
          {renderInfo()}
        </View>
      </TouchableOpacity>

      <View style={[styles.rightGroup, { width: S.right }]}>
        <View style={styles.userChip}>
          <View style={styles.dot} />
          <Text style={styles.chipText} numberOfLines={1}>{currentUser?.name || ''}</Text>
        </View>
        <TouchableOpacity style={styles.rightItem}>
          <NotificationIcon size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.rightItem} onPress={onSearchOpen}>
          <SearchIcon size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', paddingHorizontal: PAD, marginTop: 8, marginBottom: 8, gap: COL_GAP },
  brick: { height: 56, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  backText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  editBrick: { paddingHorizontal: 14, alignItems: 'flex-start' },
  editActive: { borderWidth: 1, borderColor: theme.colors.tabActive, backgroundColor: '#2A2A2A' },
  editLines: { gap: 2, width: '100%' },
  infoRow: { flexDirection: 'row', gap: 16 },
  editTitle: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.medium },
  editSub: { color: theme.colors.textSecondary, fontSize: 16, fontFamily: theme.fonts.regular },
  rightGroup: { flexDirection: 'row', gap: CELL_GAP },
  rightItem: { flex: 1, height: 56, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  userChip: { flex: 1, height: 56, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  chipText: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular },
  searchWrap: { flex: 1, height: 56, borderWidth: 1, borderColor: '#00C853', borderRadius: theme.borderRadius, justifyContent: 'center', paddingHorizontal: 12 },
  searchInput: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.fonts.regular, height: '100%', outlineStyle: 'none' } as any,
  clearBtn: { height: 56, paddingHorizontal: 14, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius, justifyContent: 'center', alignItems: 'center' },
  clearText: { color: theme.colors.textPrimary, fontSize: 15, fontFamily: theme.fonts.regular },
});
