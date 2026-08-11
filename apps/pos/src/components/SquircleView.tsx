import React, { useState } from 'react';
import { View, LayoutChangeEvent, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { squirclePath } from '../utils/squircle';

interface Props {
  borderRadius?: number;
  squircleN?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Apple-style continuous corner container.
 * Uses SVG for the squircle background, regular borderRadius for content clipping.
 */
export const SquircleView: React.FC<Props> = ({
  borderRadius = 12,
  squircleN = 5,
  backgroundColor = 'transparent',
  style,
  children,
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  const { width, height } = size;
  const r = borderRadius;
  const clipR = Math.max(0, r - 2);

  return (
    <View style={[styles.outer, style]} onLayout={onLayout}>
      {width > 0 && height > 0 && (
        <Svg
          width={width}
          height={height}
          style={[styles.svg, { pointerEvents: 'none' }]}
        >
          <Path
            d={squirclePath(width, height, r, squircleN)}
            fill={backgroundColor}
          />
        </Svg>
      )}
      <View
        style={[
          styles.inner,
          {
            borderRadius: clipR,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
});
