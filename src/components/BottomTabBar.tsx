import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme/colors';
import { LockIcon } from './Icons';

interface Props {
  activeTab: 'orders' | 'tables';
  onTabChange: (tab: 'orders' | 'tables') => void;
  onMenuPress?: () => void;
  onLockPress?: () => void;
  showTablesTab?: boolean;
  scale?: number;
}

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
      <View style={styles.container}>
        {/* Menu Button */}
        <TouchableOpacity style={styles.sideButton} onPress={onMenuPress}>
          <Feather name="menu" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        
        {/* Center Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'orders' && styles.activeTab]}
            onPress={() => onTabChange('orders')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText, { fontSize: 16 }]}>
              Заказы
            </Text>
          </TouchableOpacity>
          
          {showTablesTab && (
            <TouchableOpacity
              style={[styles.tab, activeTab === 'tables' && styles.activeTab]}
              onPress={() => onTabChange('tables')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === 'tables' && styles.activeTabText, { fontSize: 16 }]}>
                Столы
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Lock Button */}
        <TouchableOpacity style={styles.sideButton} onPress={onLockPress}>
          <LockIcon size={30} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  container: {
    height: 60,
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius,
    alignItems: 'center',
    padding: 6,
    gap: 6,
  },
  sideButton: {
    width: 56,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius - 2,
  },
  tabsContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    gap: 6,
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
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: '#FFFFFF',
  },
});
