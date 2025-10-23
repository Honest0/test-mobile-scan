import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';

export type DetectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface Props {
  detectedBox: DetectionRect | null;
  isLocked: boolean;
  isAutoDetecting: boolean;
  containerWidth: number;
  containerHeight: number;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onBoxChange?: (box: DetectionRect) => void;
}

const MIN_BOX_SIZE = 80;
const MAX_BOX_WIDTH_RATIO = 0.95;
const MAX_BOX_HEIGHT_RATIO = 0.4;

export default function AutoDetectionBox({
  detectedBox,
  isLocked,
  isAutoDetecting,
  containerWidth,
  containerHeight,
  onInteractionStart,
  onInteractionEnd,
  onBoxChange,
}: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const boxLeft = useSharedValue(containerWidth * 0.1);
  const boxTop = useSharedValue(containerHeight * 0.3);
  const boxWidth = useSharedValue(containerWidth * 0.8);
  const boxHeight = useSharedValue(100);
  
  // Track initial values for gestures
  const startLeft = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startWidth = useSharedValue(0);
  const startHeight = useSharedValue(0);
  
  const isInteracting = useRef(false);

  // Animate box appearance
  useEffect(() => {
    if (detectedBox && isAutoDetecting) {
      if (opacity.value === 0) {
        // First appearance - show with pop animation
        opacity.value = withTiming(1, { duration: 300 });
        scale.value = withSequence(
          withSpring(1.05, { damping: 8, stiffness: 100 }),
          withSpring(1, { damping: 10, stiffness: 150 })
        );
      } else {
        opacity.value = withTiming(1, { duration: 200 });
      }
    } else if (!isAutoDetecting) {
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [detectedBox, isAutoDetecting]);

  // Update box position smoothly when detection changes (only when NOT interacting)
  useEffect(() => {
    if (detectedBox && isAutoDetecting && !isLocked && !isInteracting.current) {
      // Smooth interpolation to new position with higher damping for stability
      boxLeft.value = withSpring(detectedBox.x, { damping: 25, stiffness: 80 });
      boxTop.value = withSpring(detectedBox.y, { damping: 25, stiffness: 80 });
      boxWidth.value = withSpring(detectedBox.width, { damping: 25, stiffness: 80 });
      boxHeight.value = withSpring(detectedBox.height, { damping: 25, stiffness: 80 });
    }
  }, [detectedBox, isAutoDetecting, isLocked]);

  // Clamp function to keep box within bounds
  const clampBox = (x: number, y: number, w: number, h: number) => {
    'worklet';
    const maxWidth = containerWidth * MAX_BOX_WIDTH_RATIO;
    const maxHeight = containerHeight * MAX_BOX_HEIGHT_RATIO;
    
    // Clamp dimensions
    const clampedW = Math.max(MIN_BOX_SIZE, Math.min(w, maxWidth));
    const clampedH = Math.max(MIN_BOX_SIZE, Math.min(h, maxHeight));
    
    // Clamp position
    const clampedX = Math.max(0, Math.min(x, containerWidth - clampedW));
    const clampedY = Math.max(0, Math.min(y, containerHeight - clampedH));
    
    return { x: clampedX, y: clampedY, width: clampedW, height: clampedH };
  };

  // Pan gesture for dragging the entire box
  const panGesture = Gesture.Pan()
    .onStart(() => {
      startLeft.value = boxLeft.value;
      startTop.value = boxTop.value;
      if (onInteractionStart) {
        runOnJS(onInteractionStart)();
      }
      isInteracting.current = true;
    })
    .onUpdate((event) => {
      const newX = startLeft.value + event.translationX;
      const newY = startTop.value + event.translationY;
      const clamped = clampBox(newX, newY, boxWidth.value, boxHeight.value);
      
      boxLeft.value = clamped.x;
      boxTop.value = clamped.y;
    })
    .onEnd(() => {
      if (onInteractionEnd) {
        runOnJS(onInteractionEnd)();
      }
      if (onBoxChange) {
        runOnJS(onBoxChange)({
          x: boxLeft.value,
          y: boxTop.value,
          width: boxWidth.value,
          height: boxHeight.value,
        });
      }
      isInteracting.current = false;
    });

  // Create resize gestures for each corner
  const createCornerGesture = (corner: 'TL' | 'TR' | 'BL' | 'BR') => {
    return Gesture.Pan()
      .onStart(() => {
        startLeft.value = boxLeft.value;
        startTop.value = boxTop.value;
        startWidth.value = boxWidth.value;
        startHeight.value = boxHeight.value;
        if (onInteractionStart) {
          runOnJS(onInteractionStart)();
        }
        isInteracting.current = true;
      })
      .onUpdate((event) => {
        let newX = startLeft.value;
        let newY = startTop.value;
        let newW = startWidth.value;
        let newH = startHeight.value;

        switch (corner) {
          case 'TL':
            newX = startLeft.value + event.translationX;
            newY = startTop.value + event.translationY;
            newW = startWidth.value - event.translationX;
            newH = startHeight.value - event.translationY;
            break;
          case 'TR':
            newY = startTop.value + event.translationY;
            newW = startWidth.value + event.translationX;
            newH = startHeight.value - event.translationY;
            break;
          case 'BL':
            newX = startLeft.value + event.translationX;
            newW = startWidth.value - event.translationX;
            newH = startHeight.value + event.translationY;
            break;
          case 'BR':
            newW = startWidth.value + event.translationX;
            newH = startHeight.value + event.translationY;
            break;
        }

        const clamped = clampBox(newX, newY, newW, newH);
        boxLeft.value = clamped.x;
        boxTop.value = clamped.y;
        boxWidth.value = clamped.width;
        boxHeight.value = clamped.height;
      })
      .onEnd(() => {
        if (onInteractionEnd) {
          runOnJS(onInteractionEnd)();
        }
        if (onBoxChange) {
          runOnJS(onBoxChange)({
            x: boxLeft.value,
            y: boxTop.value,
            width: boxWidth.value,
            height: boxHeight.value,
          });
        }
        isInteracting.current = false;
      });
  };

  const cornerTLGesture = createCornerGesture('TL');
  const cornerTRGesture = createCornerGesture('TR');
  const cornerBLGesture = createCornerGesture('BL');
  const cornerBRGesture = createCornerGesture('BR');

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    left: boxLeft.value,
    top: boxTop.value,
    width: boxWidth.value,
    height: boxHeight.value,
  }));

  const darkTopStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: boxTop.value,
  }));

  const darkLeftStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: boxTop.value,
    left: 0,
    width: boxLeft.value,
    height: boxHeight.value,
  }));

  const darkRightStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: boxTop.value,
    left: boxLeft.value + boxWidth.value,
    right: 0,
    height: boxHeight.value,
  }));

  const darkBottomStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: boxTop.value + boxHeight.value,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  if (!isAutoDetecting || !detectedBox) {
    return null;
  }

  return (
    <>
      {/* Dark overlay covering entire screen */}
      <View 
        style={[
          styles.darkOverlay,
          Platform.OS === 'android' && { transform: [{ scaleY: -1 }] }
        ]}
        pointerEvents="none"
      >
        {/* Top dark area */}
        <Animated.View style={[styles.darkSection, darkTopStyle]} />
        
        {/* Left dark area */}
        <Animated.View style={[styles.darkSection, darkLeftStyle]} />
        
        {/* Right dark area */}
        <Animated.View style={[styles.darkSection, darkRightStyle]} />
        
        {/* Bottom dark area */}
        <Animated.View style={[styles.darkSection, darkBottomStyle]} />
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View 
          style={[
            styles.boxContainer, 
            animatedStyle,
            Platform.OS === 'android' && { transform: [{ scaleY: -1 }] }
          ]}
        >
          {/* White thin border around the box */}
          <View style={styles.outerBox} />
          
          {/* Corner brackets outside the box */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          
          {/* Invisible resize handles at corners for gesture detection */}
          <GestureDetector gesture={cornerTLGesture}>
            <Animated.View style={[styles.resizeHandle, styles.handleTL]} />
          </GestureDetector>
          <GestureDetector gesture={cornerTRGesture}>
            <Animated.View style={[styles.resizeHandle, styles.handleTR]} />
          </GestureDetector>
          <GestureDetector gesture={cornerBLGesture}>
            <Animated.View style={[styles.resizeHandle, styles.handleBL]} />
          </GestureDetector>
          <GestureDetector gesture={cornerBRGesture}>
            <Animated.View style={[styles.resizeHandle, styles.handleBR]} />
          </GestureDetector>
          
          {/* Lock indicator when locked */}
          {isLocked && (
            <View style={styles.lockIndicator}>
              <View style={styles.lockDot} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  darkSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  boxContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  outerBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 12,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#ffffff',
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  cornerTL: {
    top: -8,
    left: -8,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: -8,
    right: -8,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: -8,
    left: -8,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: -8,
    right: -8,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  lockIndicator: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#14b8a6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  lockDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  // Resize handles at corners - invisible but functional
  resizeHandle: {
    position: 'absolute',
    width: 50,
    height: 50,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  handleTL: {
    top: -20,
    left: -20,
  },
  handleTR: {
    top: -20,
    right: -20,
  },
  handleBL: {
    bottom: -20,
    left: -20,
  },
  handleBR: {
    bottom: -20,
    right: -20,
  },
});

