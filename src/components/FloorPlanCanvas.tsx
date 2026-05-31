import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { theme } from '../theme/colors';
import { VenueTable, VenueZone } from '../store/venueStore';

const GAP = 8;

interface TableRenderInfo {
  table: VenueTable;
  bgColor: string;
  label?: string;
  borderWidth?: number;
  borderColor?: string;
}

interface Props {
  zone: VenueZone;
  padding?: number;
  getTableStyle: (table: VenueTable) => Omit<TableRenderInfo, 'table'>;
  onTablePress: (table: VenueTable) => void;
  renderTableContent?: (table: VenueTable, fontSize: number) => React.ReactNode;
}

export const FloorPlanCanvas: React.FC<Props> = ({
  zone,
  padding = 0,
  getTableStyle,
  onTablePress,
  renderTableContent,
}) => {
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const handleLayout = (e: LayoutChangeEvent) => {
    setCanvasSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  };

  let maxCol = zone.cols;
  let maxRow = zone.rows;
  zone.tables.forEach((t) => {
    const sw = t.colSpan || 2;
    const sh = t.rowSpan || 2;
    maxCol = Math.max(maxCol, t.col + sw);
    maxRow = Math.max(maxRow, t.row + sh);
  });

  const availW = canvasSize.w - padding * 2;
  const availH = canvasSize.h - padding * 2;
  const cellW = availW > 0 ? (availW - (maxCol - 1) * GAP) / maxCol : 0;
  const cellH = availH > 0 ? (availH - (maxRow - 1) * GAP) / maxRow : 0;

  return (
    <View style={styles.canvas} onLayout={handleLayout}>
      {cellW > 0 && cellH > 0 && zone.tables.map((table) => {
        const { bgColor, label, borderWidth = 0, borderColor = 'transparent' } = getTableStyle(table);

        const sw = table.colSpan || 2;
        const sh = table.rowSpan || 2;
        const left = padding + table.col * (cellW + GAP);
        const top = padding + table.row * (cellH + GAP);
        const width = cellW * sw + GAP * (sw - 1);
        const height = cellH * sh + GAP * (sh - 1);
        const isCircle = table.size === 'circle';
        const isSquare = table.size === 'square';
        const radius = isCircle ? Math.min(width, height) / 2 : isSquare ? 4 : Math.min(width, height) * 0.12;
        const fontSize = 24;

        return (
          <TouchableOpacity
            key={table.id}
            activeOpacity={0.7}
            onPress={() => onTablePress(table)}
            style={[
              styles.table,
              {
                left, top, width, height,
                backgroundColor: bgColor,
                borderRadius: radius,
                borderWidth,
                borderColor,
              },
            ]}
          >
            {renderTableContent ? (
              renderTableContent(table, fontSize)
            ) : (
              <>
                <Text style={[styles.tableNumber, { fontSize }]}>{table.number}</Text>
                {label && <Text style={[styles.tableLabel, { fontSize: 16 }]}>{label}</Text>}
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  table: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableNumber: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tableLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 2,
  },
});
