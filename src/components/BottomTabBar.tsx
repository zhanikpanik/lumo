import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';
import { LockIcon, HamburgerIcon } from './Icons';

interface Props {
  activeTab: 'orders' | 'tables';
  onTabChange: (tab: 'orders' | 'tables') => void;
  onMenuPress?: () => void;
  onLockPress?: () => void;
  showTablesTab?: boolean;
  scale?: number;
}

const GAP = 10;
const SIDE_W = 120;

export const BottomTabBar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  onMenuPress,
  onLockPress,
  showTablesTab = true,
  scale = 1,
}) => {
  return (
    <View style={styles.wrapper}>
      {/* Menu button — standalone */}
      <TouchableOpacity style={styles.sideButton} onPress={onMenuPress}>
        <HamburgerIcon size={24} color={theme.colors.textPrimary} />
      </TouchableOpacity>

      {/* Tab switcher */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'orders' && styles.activeTab]}
          onPress={() => onTabChange('orders')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText]}>
            Заказы
          </Text>
        </TouchableOpacity>

        {showTablesTab && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'tables' && styles.activeTab]}
            onPress={() => onTabChange('tables')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'tables' && styles.activeTabText]}>
              Столы
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Lock button — standalone */}
      <TouchableOpacity style={styles.sideButton} onPress={onLockPress}>
        <LockIcon size={30} color={theme.colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: GAP,
  },
  sideButton: {
    width: SIDE_W,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius,
  },
  tabsContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 56,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borderRadius - 2,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: theme.colors.tabActive,
  },
  tabText: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.white,
  },
});
