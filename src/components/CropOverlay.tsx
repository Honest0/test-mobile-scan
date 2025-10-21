import React, { useState } from 'react';
import { View, StyleSheet, Dimensions, PanResponder } from 'react-native';

type Rect = { x: number; y: number; width: number; height: number };

interface Props {
  box: Rect;
  onChange: (r: Rect) => void;
  boundsPadding?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CropOverlay({ box, onChange, boundsPadding = 0 }: Props) {
  const [currentBox, setCurrentBox] = useState(box);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (evt, gestureState) => {
      const minX = boundsPadding;
      const minY = boundsPadding + 80;
      const maxX = SCREEN_WIDTH - boundsPadding - currentBox.width;
      const maxY = SCREEN_HEIGHT - boundsPadding - 140 - currentBox.height;
      
      const newX = clamp(box.x + gestureState.dx, minX, maxX);
      const newY = clamp(box.y + gestureState.dy, minY, maxY);
      
      setCurrentBox(prev => ({ ...prev, x: newX, y: newY }));
    },
    onPanResponderRelease: () => {
      onChange(currentBox);
    },
  });

  return (
    <View 
      style={[
        styles.overlay, 
        {
          left: currentBox.x,
          top: currentBox.y,
          width: currentBox.width,
          height: currentBox.height,
        }
      ]} 
      {...panResponder.panHandlers}
    >
      <View style={styles.handleTL} />
      <View style={styles.handleTR} />
      <View style={styles.handleBL} />
      <View style={styles.handleBR} />
    </View>
  );
}

const handle = {
  width: 18,
  height: 18,
  borderRadius: 4,
  backgroundColor: '#67e8f9',
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#67e8f9',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  handleTL: { position: 'absolute', left: -9, top: -9, ...handle },
  handleTR: { position: 'absolute', right: -9, top: -9, ...handle },
  handleBL: { position: 'absolute', left: -9, bottom: -9, ...handle },
  handleBR: { position: 'absolute', right: -9, bottom: -9, ...handle },
});



