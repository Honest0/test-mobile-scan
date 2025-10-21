import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, ToastAndroid, Platform, PanResponder, Modal, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import * as ImageManipulator from 'expo-image-manipulator';
import { analyzeTextDensity } from '../utils/imageUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PreviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = route.params as RootStackParamList['Preview'];
  const [croppedUri, setCroppedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Calculate initial crop box with better defaults
  const getInitialCropBox = () => {
    if (params.crop) return params.crop;
    
    // Use safer initial values that fit within typical container
    const containerWidth = SCREEN_WIDTH;
    const containerHeight = SCREEN_HEIGHT * 0.55; // Fixed container height
    
    return {
      x: containerWidth * 0.1,
      y: containerHeight * 0.15, // Position from top of container, not screen
      width: containerWidth * 0.8,
      height: Math.min(containerHeight * 0.35, containerWidth * 0.4) // Ensure height fits
    };
  };
  
  const [cropBox, setCropBox] = useState(getInitialCropBox());
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [autoDetectComplete, setAutoDetectComplete] = useState(false);

  // Use refs to track gesture state to avoid stale closures
  const dragStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const activeHandleRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const cropBoxRef = useRef(cropBox); // Add ref to track current crop box
  const animationFrameRef = useRef<number | null>(null);
  const pendingCropRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const hasCroppedImageRef = useRef(false);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const subjects = ['Math', 'Biology', 'Physics', 'Chemistry', 'History', 'Geography'];

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  // Constrain crop box to stay within container boundaries
  const constrainCropBox = useCallback((box: { x: number; y: number; width: number; height: number }) => {
    const containerWidth = imageLayout.width || SCREEN_WIDTH;
    const containerHeight = imageLayout.height || SCREEN_HEIGHT * 0.55;
    
    let { x, y, width, height } = box;
    
    // Ensure dimensions don't exceed container (no minimum size constraint for accurate capture)
    width = Math.min(width, containerWidth);
    height = Math.min(height, containerHeight);
    
    // Ensure position keeps box within bounds
    x = clamp(x, 0, containerWidth - width);
    y = clamp(y, 0, containerHeight - height);
    
    console.log('📏 Constrained crop box:', { x, y, width, height }, 'Container:', { containerWidth, containerHeight });
    
    return { x, y, width, height };
  }, [imageLayout.width, imageLayout.height]);

  // Debug: Log component mount and set fallback preview
  useEffect(() => {
    console.log('🚀 PreviewScreen mounted');
    console.log('📸 Photo dimensions:', params.photo.width, 'x', params.photo.height);
    console.log('📦 Initial crop box:', cropBox);
    
    // Emergency fallback: show original image immediately
    // This ensures SOMETHING is always displayed
    console.log('🆘 Setting emergency fallback to original photo');
    setCroppedUri(params.photo.uri);
    
    return () => {
      console.log('👋 PreviewScreen unmounting');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Constrain crop box when image layout changes to prevent overflow
  useEffect(() => {
    if (imageLayout.width > 0 && imageLayout.height > 0) {
      console.log('📐 Image layout ready, constraining crop box to fit');
      const constrainedBox = constrainCropBox(cropBox);
      
      // Only update if the box actually changed
      if (constrainedBox.x !== cropBox.x || constrainedBox.y !== cropBox.y || 
          constrainedBox.width !== cropBox.width || constrainedBox.height !== cropBox.height) {
        console.log('⚠️ Crop box was out of bounds, correcting...');
        setCropBox(constrainedBox);
      }
    }
  }, [imageLayout.width, imageLayout.height, constrainCropBox]);

  // Safety function to clear stuck gesture states
  const clearGestureStates = useCallback(() => {
    console.log('🧹 Clearing gesture states');
    isDraggingRef.current = false;
    isResizingRef.current = false;
    activeHandleRef.current = null;
    setIsDragging(false);
    setIsResizing(false);
    if (pendingCropRef.current) {
      setCropBox(pendingCropRef.current);
      pendingCropRef.current = null;
    }
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = null;
    }
  }, []);

  // Auto-clear gesture states if they get stuck (safety mechanism)
  useEffect(() => {
    if (isDragging || isResizing) {
      // Set a timeout to auto-clear if gesture doesn't end within 10 seconds
      gestureTimeoutRef.current = setTimeout(() => {
        console.warn('⚠️ Gesture state stuck! Auto-clearing...');
        clearGestureStates();
      }, 10000);
      
      return () => {
        if (gestureTimeoutRef.current) {
          clearTimeout(gestureTimeoutRef.current);
          gestureTimeoutRef.current = null;
        }
      };
    }
  }, [isDragging, isResizing, clearGestureStates]);

  // Smooth update function using requestAnimationFrame
  const updateCropBox = useCallback((newBox: { x: number; y: number; width: number; height: number }) => {
    // Cancel any pending animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Constrain the box to stay within boundaries
    const constrainedBox = constrainCropBox(newBox);

    // Schedule update in next animation frame for smooth rendering
    animationFrameRef.current = requestAnimationFrame(() => {
      cropBoxRef.current = constrainedBox;
      setCropBox(constrainedBox);
      animationFrameRef.current = null;
    });
  }, [constrainCropBox]);

  // Keep cropBoxRef synchronized with cropBox state
  // But don't update during active gestures to prevent interference
  useEffect(() => {
    if (!isDraggingRef.current && !isResizingRef.current) {
      cropBoxRef.current = cropBox;
    }
  }, [cropBox]);

  // Cleanup animation frames on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Auto-detect question area when image layout is ready
  const performAutoDetection = useCallback(async () => {
    if (autoDetectComplete || !imageLayout.width || !imageLayout.height || params.crop) {
      console.log('⏭️ Skipping auto-detection:', { autoDetectComplete, hasLayout: !!imageLayout.width, hasCrop: !!params.crop });
      return; // Skip if already detected, layout not ready, or crop provided
    }

    console.log('🔍 Starting auto-detection of question area...');
    
    try {
      // Calculate the actual displayed image dimensions
      const photoAspect = params.photo.width / params.photo.height;
      const containerAspect = imageLayout.width / imageLayout.height;
      
      let displayedImageWidth = imageLayout.width;
      let displayedImageHeight = imageLayout.height;
      let imageOffsetX = 0;
      let imageOffsetY = 0;
      
      if (photoAspect > containerAspect) {
        displayedImageHeight = imageLayout.width / photoAspect;
        imageOffsetY = (imageLayout.height - displayedImageHeight) / 2;
      } else {
        displayedImageWidth = imageLayout.height * photoAspect;
        imageOffsetX = (imageLayout.width - displayedImageWidth) / 2;
      }

      console.log('📐 Calling analyzeTextDensity...');
      // Use analyzeTextDensity to find the tight-fit area
      const detectedRect = await analyzeTextDensity(
        params.photo.uri,
        params.photo.width,
        params.photo.height,
        displayedImageWidth,
        displayedImageHeight
      );

      if (detectedRect) {
        // Adjust for image offset in container
        const adjustedRect = {
          x: detectedRect.x + imageOffsetX,
          y: detectedRect.y + imageOffsetY,
          width: detectedRect.width,
          height: detectedRect.height
        };

        console.log('✅ Auto-detected question area:', adjustedRect);
        updateCropBox(adjustedRect);
      } else {
        console.log('⚠️ Auto-detection returned null, keeping default crop box');
      }
    } catch (error) {
      console.error('❌ Error in auto-detection:', error);
    } finally {
      // Always mark as complete, even if detection failed
      console.log('✓ Auto-detection complete');
      setAutoDetectComplete(true);
    }
  }, [imageLayout, params, autoDetectComplete, updateCropBox]);

  // Main drag responder for moving the crop box
  const dragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => {
      return !isResizingRef.current;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return !isResizingRef.current && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2);
    },
    onPanResponderGrant: (evt) => {
      isDraggingRef.current = true;
      setIsDragging(true);
      // Capture current position at start of drag
      dragStartRef.current = { 
        x: cropBoxRef.current.x, 
        y: cropBoxRef.current.y, 
        width: cropBoxRef.current.width, 
        height: cropBoxRef.current.height 
      };
    },
    onPanResponderMove: (evt, gestureState) => {
      if (isResizingRef.current) return;
      
      const { width, height } = dragStartRef.current;
      const containerWidth = imageLayout.width || SCREEN_WIDTH;
      const containerHeight = imageLayout.height || SCREEN_HEIGHT * 0.55;
      
      const newX = clamp(dragStartRef.current.x + gestureState.dx, 0, containerWidth - width);
      const newY = clamp(dragStartRef.current.y + gestureState.dy, 0, containerHeight - height);
      
      // Update crop box ref immediately for responsive feedback
      const newBox = { x: newX, y: newY, width, height };
      cropBoxRef.current = newBox;
      pendingCropRef.current = newBox;
      
      // Use RAF for smooth visual update
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          if (pendingCropRef.current) {
            setCropBox(pendingCropRef.current);
            pendingCropRef.current = null;
          }
          animationFrameRef.current = null;
        });
      }
    },
    onPanResponderRelease: () => {
      isDraggingRef.current = false;
      // Ensure final position is set
      if (pendingCropRef.current) {
        setCropBox(pendingCropRef.current);
        pendingCropRef.current = null;
      }
      setIsDragging(false);
    },
    onPanResponderTerminate: () => {
      // Called when gesture is interrupted (e.g., by another gesture or alert)
      isDraggingRef.current = false;
      // Ensure final position is set
      if (pendingCropRef.current) {
        setCropBox(pendingCropRef.current);
        pendingCropRef.current = null;
      }
      setIsDragging(false);
    },
  }), [imageLayout.height]);

  // Create individual resize responders for each handle
  const createResizeResponder = useCallback((handle: string) => PanResponder.create({
    onStartShouldSetPanResponder: () => {
      return !isDraggingRef.current;
    },
    onMoveShouldSetPanResponder: () => {
      return !isDraggingRef.current;
    },
    onPanResponderGrant: (evt) => {
      isResizingRef.current = true;
      activeHandleRef.current = handle;
      setIsResizing(true);
      // Capture current position at start of resize
      dragStartRef.current = { 
        x: cropBoxRef.current.x, 
        y: cropBoxRef.current.y, 
        width: cropBoxRef.current.width, 
        height: cropBoxRef.current.height 
      };
    },
    onPanResponderMove: (evt, gestureState) => {
      if (isDraggingRef.current || !isResizingRef.current || activeHandleRef.current !== handle) return;
      
      const minSize = 1; // Minimum 1px to prevent invalid dimensions
      const containerWidth = imageLayout.width || SCREEN_WIDTH;
      const containerHeight = imageLayout.height || SCREEN_HEIGHT * 0.55;
      const { x: startX, y: startY, width: startWidth, height: startHeight } = dragStartRef.current;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startX;
      let newY = startY;
      
      if (handle === 'BR') {
        newWidth = clamp(startWidth + gestureState.dx, minSize, containerWidth - startX);
        newHeight = clamp(startHeight + gestureState.dy, minSize, containerHeight - startY);
      } else if (handle === 'TR') {
        newWidth = clamp(startWidth + gestureState.dx, minSize, containerWidth - startX);
        const potentialHeight = startHeight - gestureState.dy;
        const potentialY = startY + gestureState.dy;
        if (potentialHeight >= minSize && potentialY >= 0) {
          newHeight = potentialHeight;
          newY = potentialY;
        }
      } else if (handle === 'BL') {
        const potentialWidth = startWidth - gestureState.dx;
        const potentialX = startX + gestureState.dx;
        if (potentialWidth >= minSize && potentialX >= 0) {
          newWidth = potentialWidth;
          newX = potentialX;
        }
        newHeight = clamp(startHeight + gestureState.dy, minSize, containerHeight - startY);
      } else if (handle === 'TL') {
        const potentialWidth = startWidth - gestureState.dx;
        const potentialX = startX + gestureState.dx;
        if (potentialWidth >= minSize && potentialX >= 0) {
          newWidth = potentialWidth;
          newX = potentialX;
        }
        const potentialHeight = startHeight - gestureState.dy;
        const potentialY = startY + gestureState.dy;
        if (potentialHeight >= minSize && potentialY >= 0) {
          newHeight = potentialHeight;
          newY = potentialY;
        }
      }
      
      // Update crop box ref immediately for responsive feedback
      const newBox = { x: newX, y: newY, width: newWidth, height: newHeight };
      cropBoxRef.current = newBox;
      pendingCropRef.current = newBox;
      
      // Use RAF for smooth visual update
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          if (pendingCropRef.current) {
            setCropBox(pendingCropRef.current);
            pendingCropRef.current = null;
          }
          animationFrameRef.current = null;
        });
      }
    },
    onPanResponderRelease: () => {
      isResizingRef.current = false;
      activeHandleRef.current = null;
      // Ensure final position is set
      if (pendingCropRef.current) {
        setCropBox(pendingCropRef.current);
        pendingCropRef.current = null;
      }
      setIsResizing(false);
    },
    onPanResponderTerminate: () => {
      // Called when gesture is interrupted (e.g., by another gesture or alert)
      isResizingRef.current = false;
      activeHandleRef.current = null;
      // Ensure final position is set
      if (pendingCropRef.current) {
        setCropBox(pendingCropRef.current);
        pendingCropRef.current = null;
      }
      setIsResizing(false);
    },
  }), [imageLayout.height]);

  const resizeResponderTL = useMemo(() => createResizeResponder('TL'), [createResizeResponder]);
  const resizeResponderTR = useMemo(() => createResizeResponder('TR'), [createResizeResponder]);
  const resizeResponderBL = useMemo(() => createResizeResponder('BL'), [createResizeResponder]);
  const resizeResponderBR = useMemo(() => createResizeResponder('BR'), [createResizeResponder]);

  const cropAsync = useCallback(async () => {
    if (!imageLayout.width || !imageLayout.height) {
      console.log('⏳ Image layout not ready yet');
      return;
    }
    
    console.log('🔄 Starting crop operation...');
    console.log('📦 Crop box:', cropBox);
    console.log('🎯 Gesture state - isDragging:', isDraggingRef.current, 'isResizing:', isResizingRef.current);
    
    // Don't show loading - we always show the image now (original or cropped)
    // Loading state is no longer needed since we have a fallback
    setLoading(false);
    try {
      // Calculate the actual displayed image dimensions with resizeMode="contain"
      const photoAspect = params.photo.width / params.photo.height;
      const containerAspect = imageLayout.width / imageLayout.height;
      
      let displayedImageWidth = imageLayout.width;
      let displayedImageHeight = imageLayout.height;
      let imageOffsetX = 0;
      let imageOffsetY = 0;
      
      // Image is scaled to fit within container while maintaining aspect ratio
      if (photoAspect > containerAspect) {
        // Image is wider - fits to width
        displayedImageHeight = imageLayout.width / photoAspect;
        imageOffsetY = (imageLayout.height - displayedImageHeight) / 2;
      } else {
        // Image is taller - fits to height
        displayedImageWidth = imageLayout.height * photoAspect;
        imageOffsetX = (imageLayout.width - displayedImageWidth) / 2;
      }
      
      console.log('📐 Container size:', imageLayout.width, 'x', imageLayout.height);
      console.log('📐 Displayed image size:', displayedImageWidth, 'x', displayedImageHeight);
      console.log('📐 Image offset:', imageOffsetX, ',', imageOffsetY);
      
      // Calculate scale from displayed size to actual photo size
      const scaleX = params.photo.width / displayedImageWidth;
      const scaleY = params.photo.height / displayedImageHeight;
      
      // Adjust crop box coordinates to be relative to the displayed image
      const adjustedX = cropBox.x - imageOffsetX;
      const adjustedY = cropBox.y - imageOffsetY;
      
      console.log('📦 Crop box (container coords):', cropBox);
      console.log('📦 Adjusted crop box (image coords):', adjustedX, ',', adjustedY);
      console.log('📐 Scale factors - X:', scaleX.toFixed(2), 'Y:', scaleY.toFixed(2));
      
      // Convert to actual photo coordinates
      let photoX = Math.round(adjustedX * scaleX);
      let photoY = Math.round(adjustedY * scaleY);
      let photoWidth = Math.round(cropBox.width * scaleX);
      let photoHeight = Math.round(cropBox.height * scaleY);
      
      // Ensure crop rect is completely within image bounds
      photoX = Math.max(0, photoX);
      photoY = Math.max(0, photoY);
      
      // Adjust width and height to fit within image boundaries
      photoWidth = Math.min(photoWidth, params.photo.width - photoX);
      photoHeight = Math.min(photoHeight, params.photo.height - photoY);
      
      // Ensure minimum size (1px minimum to prevent invalid dimensions)
      photoWidth = Math.max(1, photoWidth);
      photoHeight = Math.max(1, photoHeight);
      
      // If the crop area is still invalid, use a safe default
      if (photoX + photoWidth > params.photo.width || photoY + photoHeight > params.photo.height) {
        console.warn('⚠️ Crop rect exceeds image bounds, adjusting...');
        photoWidth = Math.min(photoWidth, params.photo.width - photoX - 1);
        photoHeight = Math.min(photoHeight, params.photo.height - photoY - 1);
      }
      
      const cropRect = {
        originX: photoX,
        originY: photoY,
        width: photoWidth,
        height: photoHeight,
      } as const;

      console.log('✂️ Final crop rect:', cropRect);
      console.log('📸 Original photo:', params.photo.width, 'x', params.photo.height);
      console.log('✅ Crop validation - within bounds:', 
        cropRect.originX >= 0 && 
        cropRect.originY >= 0 && 
        cropRect.originX + cropRect.width <= params.photo.width &&
        cropRect.originY + cropRect.height <= params.photo.height
      );

      // Validate crop rect one more time before calling manipulateAsync
      if (cropRect.width <= 0 || cropRect.height <= 0) {
        console.error('❌ Invalid crop dimensions:', cropRect);
        throw new Error(`Invalid crop dimensions: ${cropRect.width}x${cropRect.height}`);
      }
      
      if (cropRect.originX < 0 || cropRect.originY < 0) {
        console.error('❌ Invalid crop origin:', cropRect);
        throw new Error(`Invalid crop origin: (${cropRect.originX}, ${cropRect.originY})`);
      }

      console.log('🎬 Calling ImageManipulator.manipulateAsync...');
      const res = await ImageManipulator.manipulateAsync(
        params.photo.uri,
        [{ crop: cropRect }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      console.log('📸 ImageManipulator returned:', res);
      
      if (!res || !res.uri) {
        throw new Error('ImageManipulator returned invalid result');
      }
      
      setCroppedUri(res.uri);
      hasCroppedImageRef.current = true; // Mark that we have a cropped image
      console.log('✅ Cropped successfully! URI:', res.uri.substring(Math.max(0, res.uri.length - 30)));
      console.log('💾 croppedUri state updated');
    } catch (e: any) {
      console.error('❌ Error cropping image:', e);
      console.error('❌ Error message:', e.message);
      console.error('❌ Error stack:', e.stack);
      console.error('❌ Error details:', JSON.stringify(e, null, 2));
      // Fallback to original image if crop fails
      console.log('🔄 Falling back to original image');
      setCroppedUri(params.photo.uri);
      hasCroppedImageRef.current = true;
    } finally {
      // Only update loading state if not in the middle of a gesture
      if (!isDraggingRef.current && !isResizingRef.current) {
        setLoading(false);
      }
    }
  }, [params, cropBox, imageLayout]);

  // Simplified crop effect - runs whenever crop box changes and we're not gesturing
  useEffect(() => {
    // Must have image layout ready
    if (!imageLayout.width || !imageLayout.height) {
      console.log('⏸️ Waiting for image layout...');
      return;
    }
    
    // Skip during active gestures
    if (isDragging || isResizing) {
      console.log('✋ Gesture in progress, skipping crop');
      return;
    }
    
    console.log('⏱️ Scheduling crop operation');
    const timeoutId = setTimeout(() => {
      console.log('▶️ Executing crop operation');
      cropAsync();
    }, 200);

    return () => {
      console.log('🧹 Clearing crop timeout');
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropBox.x, cropBox.y, cropBox.width, cropBox.height, isDragging, isResizing, imageLayout.width, imageLayout.height]);

  // Trigger auto-detection when image layout is ready (runs in background, doesn't block crops)
  useEffect(() => {
    if (imageLayout.width > 0 && imageLayout.height > 0 && !autoDetectComplete) {
      console.log('🎯 Triggering auto-detection in background...');
      performAutoDetection();
    }
  }, [imageLayout, autoDetectComplete, performAutoDetection]);

  const onConfirm = () => {
    // Show the subject selection dialog
    setShowDialog(true);
  };

  const onSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    setShowDialog(false);
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Question saved in ${subject}!`, ToastAndroid.SHORT);
    }
    // Here you can save the cropped image and subject
    console.log('Selected subject:', subject);
    console.log('Cropped image URI:', croppedUri);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Adjust Question Area</Text>
      
      <View 
        style={styles.imageContainer}
        onLayout={(event) => {
          const { width, height, x, y } = event.nativeEvent.layout;
          setImageLayout({ width, height, x, y });
          console.log('📏 Image container layout:', width, 'x', height);
        }}
      >
        <Image 
          source={{ uri: params.photo.uri }} 
          style={styles.fullImage} 
          resizeMode="contain" 
        />
        
        {/* Dark overlay around crop area */}
        <View style={styles.darkOverlay} pointerEvents="none">
          {/* Top overlay */}
          <View style={[styles.overlaySection, { 
            top: 0, 
            left: 0, 
            right: 0, 
            height: cropBox.y 
          }]} />
          
          {/* Left overlay */}
          <View style={[styles.overlaySection, { 
            top: cropBox.y, 
            left: 0, 
            width: cropBox.x, 
            height: cropBox.height 
          }]} />
          
          {/* Right overlay */}
          <View style={[styles.overlaySection, { 
            top: cropBox.y, 
            left: cropBox.x + cropBox.width, 
            right: 0, 
            height: cropBox.height 
          }]} />
          
          {/* Bottom overlay */}
          <View style={[styles.overlaySection, { 
            top: cropBox.y + cropBox.height, 
            left: 0, 
            right: 0, 
            bottom: 0 
          }]} />
        </View>
        
        {/* Crop overlay with corner brackets */}
        <View 
          style={[
            styles.cropOverlay,
            {
              left: cropBox.x,
              top: cropBox.y,
              width: cropBox.width,
              height: cropBox.height,
            }
          ]} 
          {...dragResponder.panHandlers}
        >
          {/* Corner Brackets */}
          <View style={[styles.cornerBracket, styles.cornerTL, { 
            borderColor: (isDragging || isResizing) ? '#ff6b6b' : '#fff' 
          }]} />
          <View style={[styles.cornerBracket, styles.cornerTR, { 
            borderColor: (isDragging || isResizing) ? '#ff6b6b' : '#fff' 
          }]} />
          <View style={[styles.cornerBracket, styles.cornerBL, { 
            borderColor: (isDragging || isResizing) ? '#ff6b6b' : '#fff' 
          }]} />
          <View style={[styles.cornerBracket, styles.cornerBR, { 
            borderColor: (isDragging || isResizing) ? '#ff6b6b' : '#fff' 
          }]} />
          <View 
            style={[
              styles.handleTL,
              { backgroundColor: (isResizing && activeHandleRef.current === 'TL') ? '#ff6b6b' : '#67e8f9' }
            ]} 
            {...resizeResponderTL.panHandlers}
          />
          <View 
            style={[
              styles.handleTR,
              { backgroundColor: (isResizing && activeHandleRef.current === 'TR') ? '#ff6b6b' : '#67e8f9' }
            ]} 
            {...resizeResponderTR.panHandlers}
          />
          <View 
            style={[
              styles.handleBL,
              { backgroundColor: (isResizing && activeHandleRef.current === 'BL') ? '#ff6b6b' : '#67e8f9' }
            ]} 
            {...resizeResponderBL.panHandlers}
          />
          <View 
            style={[
              styles.handleBR,
              { backgroundColor: (isResizing && activeHandleRef.current === 'BR') ? '#ff6b6b' : '#67e8f9' }
            ]} 
            {...resizeResponderBR.panHandlers}
          />
        </View>
      </View>

      <View style={styles.previewContainer}>
        <Text style={styles.previewLabel}>Cropped Question Preview:</Text>
        <View style={styles.previewImageContainer}>
          {croppedUri || params.photo.uri ? (
            <Image 
              key={croppedUri || params.photo.uri} // Force re-render when URI changes
              source={{ uri: croppedUri || params.photo.uri }} 
              style={styles.previewImage} 
              resizeMode="contain"
              onError={(error) => {
                console.error('❌ Preview image load error:', error.nativeEvent.error);
                // Fallback to original if preview fails
                if (!croppedUri) {
                  setCroppedUri(params.photo.uri);
                }
              }}
              onLoad={() => {
                const displayUri = croppedUri || params.photo.uri;
                console.log('✅ Preview image loaded:', displayUri.substring(Math.max(0, displayUri.length - 20)));
              }}
            />
          ) : (
            <View style={styles.previewOverlay}>
              <ActivityIndicator color="#67e8f9" size="large" />
              <Text style={styles.previewOverlayText}>Loading preview...</Text>
            </View>
          )}
          {(isDragging || isResizing) && (croppedUri || params.photo.uri) && (
            <View style={styles.previewOverlay}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.previewOverlayText}>Adjusting...</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.btn, styles.secondary]}>
          <Text style={styles.btnText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfirm} style={[styles.btn, styles.primary]}>
          <Text style={[styles.btnText, { color: '#0b0b0b' }]}>Confirm</Text>
        </TouchableOpacity>
      </View>

      {/* Subject Selection Modal */}
      <Modal
        visible={showDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Cropped Question Preview */}
            <View style={styles.modalPreviewContainer}>
              <Image 
                source={{ uri: croppedUri ?? params.photo.uri }} 
                style={styles.modalPreviewImage} 
                resizeMode="contain" 
              />
            </View>

            {/* Question Text */}
            <Text style={styles.modalTitle}>What is the question related to?</Text>

            {/* Subject Options */}
            <ScrollView style={styles.subjectList} showsVerticalScrollIndicator={false}>
              {subjects.map((subject) => (
                <TouchableOpacity
                  key={subject}
                  style={[
                    styles.subjectButton,
                    selectedSubject === subject && styles.subjectButtonSelected
                  ]}
                  onPress={() => onSubjectSelect(subject)}
                >
                  <Text style={styles.subjectButtonText}>{subject}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  container: { 
    flex: 1, 
    backgroundColor: '#0b0b0b', 
    padding: 16, 
    paddingTop: 20, // Reduced since SafeAreaView handles top safe area
    paddingBottom: 8 // Reduced since SafeAreaView handles bottom safe area
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    height: SCREEN_HEIGHT * 0.55, // Fixed height to prevent layout shifts
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlaySection: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Dark semi-transparent overlay
  },
  cropOverlay: {
    position: 'absolute',
    // No border - using corner brackets instead
  },
  cornerBracket: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderWidth: 4,
    borderColor: '#fff',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  handleTL: { 
    position: 'absolute', 
    left: -15, 
    top: -15, 
    width: 30, 
    height: 30, 
    borderRadius: 15, 
    backgroundColor: '#67e8f9',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  handleTR: { 
    position: 'absolute', 
    right: -15, 
    top: -15, 
    width: 30, 
    height: 30, 
    borderRadius: 15, 
    backgroundColor: '#67e8f9',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  handleBL: { 
    position: 'absolute', 
    left: -15, 
    bottom: -15, 
    width: 30, 
    height: 30, 
    borderRadius: 15, 
    backgroundColor: '#67e8f9',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  handleBR: { 
    position: 'absolute', 
    right: -15, 
    bottom: -15, 
    width: 30, 
    height: 30, 
    borderRadius: 15, 
    backgroundColor: '#67e8f9',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  previewContainer: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
    minHeight: 200, // Fixed minimum height to prevent layout shifts
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#67e8f9',
    marginBottom: 12,
  },
  previewImageContainer: {
    position: 'relative',
    width: '100%',
    maxWidth: 300,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0b0b0b',
    borderWidth: 2,
    borderColor: '#67e8f9',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  previewOverlayText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  buttonsRow: { 
    flexDirection: 'row', 
    gap: 12, 
    paddingVertical: 16,
    marginBottom: 8 // Extra margin to prevent cutting at screen bottom
  },
  btn: { 
    flex: 1, 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  secondary: { 
    backgroundColor: '#374151' 
  },
  primary: { 
    backgroundColor: '#67e8f9' 
  },
  btnText: { 
    color: '#e5e7eb', 
    fontWeight: '700', 
    fontSize: 16 
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalPreviewContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#67e8f9',
    overflow: 'hidden',
  },
  modalPreviewImage: {
    width: '100%',
    height: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 20,
  },
  subjectList: {
    maxHeight: 300,
  },
  subjectButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  subjectButtonSelected: {
    backgroundColor: '#67e8f9',
  },
  subjectButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
});



