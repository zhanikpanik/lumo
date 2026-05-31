import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { SearchIcon, NotificationIcon } from './Icons';
import { useVenueStore } from '../store/venueStore';
import { useOrderStore } from '../store/orderStore';
import { useShiftStore } from '../store/shiftStore';
import { WaiterPickerModal } from './WaiterPickerModal';

interface Props {
  onBack: () => void;
  searchMode: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  tableNumber: string;
  onTablePress?: () => void;
  isTakeaway?: boolean;
}

export const PosHeader: React.FC<Props> = ({
  onBack, searchMode, searchQuery, onSearchChange, onSearchOpen, onSearchClose,
  tableNumber,
  onTablePress,
  isTakeaway = false,
}) => {
  const trackGuests = useVenueStore((s) => s.trackGuests);
  const currentOrderId = useOrderStore((s) => s.currentOrderId);
  const currentOrder = useOrderStore((s) => s.orders.find(o => o.id === s.currentOrderId));
  const currentUser = useShiftStore((s) => s.currentUser);
  const guestCount = currentOrder?.guestCount ?? 1;
  const setGuestCount = useOrderStore((s) => s.setGuestCount);
  const [waiterPickerVisible, setWaiterPickerVisible] = useState(false);

  if (searchMode) {
    return (
      <View style={styles.container}>
        <View style={styles.leftSection}>
          <TouchableOpacity style={styles.backButton} onPress={onSearchClose}>
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>

          {!isTakeaway && (
            <TouchableOpacity style={styles.metaBtn} onPress={onTablePress} activeOpacity={0.7}>
              <Text style={styles.metaBtnText} numberOfLines={1}>
                {tableNumber ? `Стол ${tableNumber}` : 'Назначить стол'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.searchRightSection}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder=""
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
            />
          </View>

          <TouchableOpacity style={styles.clearBtn} onPress={() => onSearchChange('')}>
            <Text style={styles.clearText}>Очистить</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={onSearchClose}>
            <Feather name="x" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>

        {!isTakeaway && (
          <TouchableOpacity style={styles.metaBtn} onPress={onTablePress} activeOpacity={0.7}>
            <Text style={styles.metaBtnText} numberOfLines={1}>
              {tableNumber ? `Стол ${tableNumber}` : 'Назначить стол'}
            </Text>
          </TouchableOpacity>
        )}

        {currentOrderId && (
          <TouchableOpacity
            style={styles.metaBtn}
            onPress={() => setWaiterPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.metaBtnText} numberOfLines={1}>
              {currentOrder?.waiter || 'Официант'}
            </Text>
          </TouchableOpacity>
        )}

        {trackGuests && currentOrderId && (
          <View style={styles.guestCounter}>
            <TouchableOpacity style={styles.guestBtn} onPress={() => setGuestCount(-1)} disabled={guestCount <= 1}>
              <Feather name="minus" size={16} color={guestCount <= 1 ? theme.colors.textDisabled : theme.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.guestText}>{guestCount}</Text>
            <TouchableOpacity style={styles.guestBtn} onPress={() => setGuestCount(1)}>
              <Feather name="plus" size={16} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Right actions */}
      <View style={styles.rightActions}>
        {currentUser && (
          <View style={styles.userChip}>
            <View style={[styles.onlineDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.userChipText} numberOfLines={1}>{currentUser.name}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.iconButton}>
          <NotificationIcon size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} onPress={onSearchOpen}>
          <SearchIcon size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>

    <WaiterPickerModal
      visible={waiterPickerVisible}
      onClose={() => setWaiterPickerVisible(false)}
    />
  </>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 44,
    flexDirection: 'row',
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  backButton: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borderRadius,
  },
  backText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  leftSection: {
    flex: 0.42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 10,
    minWidth: 0,
  },
  metaBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    numberOfLines: 1,
  } as any,

  guestCounter: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    paddingHorizontal: 2,
    gap: 0,
  },
  guestBtn: {
    width: 32,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 18,
    textAlign: 'center',
  },

  rightActions: {
    flex: 0.58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userChipText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 100,
  },
  iconButton: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Search mode
  searchRightSection: {
    flex: 0.58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  searchInputWrap: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#00C853',
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    height: '100%',
    outlineStyle: 'none',
  } as any,
  clearBtn: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
});
