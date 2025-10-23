import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Platform, Alert } from 'react-native';
import { Camera, CameraType, AutoFocus } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { detectTextArea, analyzeTextDensity } from '../utils/imageUtils';
import AutoDetectionBox from '../components/AutoDetectionBox';
import { detectQuestionAreaFast, smoothBoxTransition, mapPreviewBoxToImageCoords, type DetectionRect } from '../utils/realtimeDetection';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CameraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cameraRef = useRef<Camera | null>(null);
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const [type] = useState(CameraType.back);
  const [autoMode, setAutoMode] = useState(true);
  
  // Auto-detection state
  const [isAutoDetecting, setIsAutoDetecting] = useState(true);
  const [detectedBox, setDetectedBox] = useState<DetectionRect | null>(null);
  const [isBoxLocked, setIsBoxLocked] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectedBoxRef = useRef<DetectionRect | null>(null);
  const manualBoxRef = useRef<DetectionRect | null>(null);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [permission]);

  // Real-time detection loop - runs at 3 fps when auto-detecting
  useEffect(() => {
    if (!isReady || !isAutoDetecting || isBoxLocked || isUserInteracting) {
      // Clear interval if conditions not met
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      return;
    }

    console.log('🎯 Starting real-time detection loop');
    
    // Calculate preview area (between top bar and bottom bar)
    const previewTop = 120;
    const previewBottom = 100;
    const previewHeight = SCREEN_HEIGHT - previewTop - previewBottom;
    const previewWidth = SCREEN_WIDTH;

    // Threshold for movement - only update if change is significant
    const POSITION_THRESHOLD = 5; // pixels
    const SIZE_THRESHOLD = 10; // pixels

    // Run detection at 3 fps
    const runDetection = () => {
      try {
        // If user has manually adjusted, keep that box
        if (manualBoxRef.current) {
          setDetectedBox(manualBoxRef.current);
          return;
        }

        // Fast heuristic-based detection
        const newBox = detectQuestionAreaFast(previewWidth, previewHeight, {
          verticalBias: 0.18,  // 18% from top - questions are usually in upper area
          widthRatio: 0.65,    // 65% width - most questions don't span full width
          heightRatio: 0.10,   // 10% height - compact for single-line questions
        });
        
        // Adjust for top offset
        const adjustedBox = {
          ...newBox,
          y: newBox.y + previewTop,
        };

        // Check if change is significant enough to update
        if (lastDetectedBoxRef.current) {
          const deltaX = Math.abs(adjustedBox.x - lastDetectedBoxRef.current.x);
          const deltaY = Math.abs(adjustedBox.y - lastDetectedBoxRef.current.y);
          const deltaW = Math.abs(adjustedBox.width - lastDetectedBoxRef.current.width);
          const deltaH = Math.abs(adjustedBox.height - lastDetectedBoxRef.current.height);

          // Only update if changes exceed threshold
          if (
            deltaX < POSITION_THRESHOLD &&
            deltaY < POSITION_THRESHOLD &&
            deltaW < SIZE_THRESHOLD &&
            deltaH < SIZE_THRESHOLD
          ) {
            // Change too small, keep current box
            return;
          }
        }

        // Apply smoothing to prevent jitter (less aggressive than before)
        const smoothedBox = smoothBoxTransition(
          lastDetectedBoxRef.current,
          adjustedBox,
          0.4 // Higher smoothing factor for more stability
        );

        lastDetectedBoxRef.current = smoothedBox;
        setDetectedBox(smoothedBox);
      } catch (error) {
        console.error('❌ Detection error:', error);
      }
    };

    // Run immediately
    runDetection();

    // Then run every 333ms (3 fps)
    detectionIntervalRef.current = setInterval(runDetection, 333);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [isReady, isAutoDetecting, isBoxLocked, isUserInteracting]);

  const onCapture = useCallback(async () => {
    if (!cameraRef.current) {
      console.log('Camera ref is null, cannot take picture.');
      return;
    }
    console.log('🔍 Attempting to take picture...');
    try {
      let photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false, // Don't need base64 anymore since we're using detected box
        exif: true,
        skipProcessing: false,
      });
      console.log('✅ Photo captured successfully');
      
      // Flip the photo on Android since we flipped the camera preview
      if (Platform.OS === 'android') {
        console.log('🔄 Flipping photo for Android...');
        const flippedPhoto = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ flip: ImageManipulator.FlipType.Vertical }],
          { compress: 1.0, format: ImageManipulator.SaveFormat.JPEG }
        );
        photo = { ...photo, uri: flippedPhoto.uri };
        console.log('✅ Photo flipped successfully');
      }
      
      const { width: photoWidth, height: photoHeight } = photo;
      
      // Use detected box if available, otherwise fall back to default
      let cropRect: { originX: number; originY: number; width: number; height: number } | null = null;
      
      // Use manual box if user adjusted it, otherwise use detected box
      const boxToUse = manualBoxRef.current || detectedBox;
      
      if (boxToUse && isAutoDetecting) {
        console.log('📦 Using box for cropping:', boxToUse, manualBoxRef.current ? '(manual)' : '(auto)');
        
        // Calculate preview area dimensions
        const previewTop = 120;
        const previewBottom = 100;
        const previewHeight = SCREEN_HEIGHT - previewTop - previewBottom;
        const previewWidth = SCREEN_WIDTH;
        
        // Calculate how the camera image is actually displayed in the preview
        // The camera view is full screen, so we need to map directly to the full image
        const photoAspect = photoWidth / photoHeight;
        const previewAspect = SCREEN_WIDTH / SCREEN_HEIGHT;
        
        let scaleX: number;
        let scaleY: number;
        let offsetX = 0;
        let offsetY = 0;
        
        if (photoAspect > previewAspect) {
          // Photo is wider - fits to height, crops width
          scaleY = photoHeight / SCREEN_HEIGHT;
          scaleX = scaleY;
          offsetX = (photoWidth - (SCREEN_WIDTH * scaleX)) / 2;
        } else {
          // Photo is taller - fits to width, crops height
          scaleX = photoWidth / SCREEN_WIDTH;
          scaleY = scaleX;
          offsetY = (photoHeight - (SCREEN_HEIGHT * scaleY)) / 2;
        }
        
        // Map box coordinates from screen to photo coordinates
        cropRect = {
          originX: Math.round((boxToUse.x * scaleX) + offsetX),
          originY: Math.round((boxToUse.y * scaleY) + offsetY),
          width: Math.round(boxToUse.width * scaleX),
          height: Math.round(boxToUse.height * scaleY),
        };
        
        // Ensure crop rect is within image bounds
        cropRect.originX = Math.max(0, Math.min(cropRect.originX, photoWidth - cropRect.width));
        cropRect.originY = Math.max(0, Math.min(cropRect.originY, photoHeight - cropRect.height));
        cropRect.width = Math.min(cropRect.width, photoWidth - cropRect.originX);
        cropRect.height = Math.min(cropRect.height, photoHeight - cropRect.originY);
        
        console.log('✂️ Mapped crop rect:', cropRect);
        console.log('📐 Photo aspect:', photoAspect.toFixed(2), 'Preview aspect:', previewAspect.toFixed(2));
        console.log('📐 Scale:', scaleX.toFixed(2), 'x', scaleY.toFixed(2), 'Offset:', offsetX.toFixed(0), ',', offsetY.toFixed(0));
      }
      
      // Crop the image if we have a crop rect
      let finalPhotoUri = photo.uri;
      if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
        try {
          console.log('✂️ Cropping image with rect:', cropRect);
          const croppedPhoto = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ crop: cropRect }],
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalPhotoUri = croppedPhoto.uri;
          console.log('✅ Image cropped successfully');
        } catch (cropError) {
          console.error('❌ Failed to crop image:', cropError);
          // Continue with uncropped image
        }
      }
      
      // Navigate to preview with the cropped image
      navigation.navigate('Preview', { 
        photo: { uri: finalPhotoUri, width: photoWidth, height: photoHeight },
        crop: null // Already cropped, no need for further cropping
      });
      
    } catch (e: any) {
      console.error('❌ Failed to take picture:', e);
      Alert.alert('Error', 'Failed to capture photo: ' + (e.message || 'Unknown error'));
    }
  }, [navigation, detectedBox, isAutoDetecting]);

  // Handlers for user interaction with detection box
  const handleInteractionStart = useCallback(() => {
    console.log('👆 User started interacting with box - pausing detection');
    setIsUserInteracting(true);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    console.log('✋ User finished interacting with box - resuming detection');
    setIsUserInteracting(false);
  }, []);

  const handleBoxChange = useCallback((newBox: DetectionRect) => {
    console.log('📐 User manually adjusted box:', newBox);
    manualBoxRef.current = newBox;
    setDetectedBox(newBox);
  }, []);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>We need camera permission</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.smallBtn}><Text style={styles.smallBtnText}>Grant</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera 
        ref={(r) => (cameraRef.current = r)} 
        style={styles.camera} 
        type={type}
        onCameraReady={() => {
          setIsReady(true);
          console.log('Camera is ready!');
        }}
        autoFocus={AutoFocus.on}
      />

      {/* Top bar with controls */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topButton}>
          <Text style={styles.topButtonIcon}>↻</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.getProButton}>
          <Text style={styles.getProIcon}>🎁</Text>
          <Text style={styles.getProText}>Get pro</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.topButton}>
          <Text style={styles.topButtonIcon}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Auto-detection toggle button */}
      <View style={styles.autoDetectToggleContainer}>
        <TouchableOpacity 
          style={[styles.autoDetectButton, isAutoDetecting && styles.autoDetectButtonActive]}
          onPress={() => {
            const newState = !isAutoDetecting;
            setIsAutoDetecting(newState);
            if (newState) {
              // Turning auto-detection ON - clear manual box to restart auto-detection
              manualBoxRef.current = null;
              lastDetectedBoxRef.current = null;
              setIsBoxLocked(false);
            }
          }}
        >
          <Text style={styles.autoDetectIcon}>{isAutoDetecting ? '🎯' : '📐'}</Text>
          <Text style={styles.autoDetectText}>
            {isAutoDetecting ? 'Auto' : 'Manual'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Real-time auto-detection box */}
      <AutoDetectionBox
        detectedBox={detectedBox}
        isLocked={isBoxLocked}
        isAutoDetecting={isAutoDetecting}
        containerWidth={SCREEN_WIDTH}
        containerHeight={SCREEN_HEIGHT}
        onInteractionStart={handleInteractionStart}
        onInteractionEnd={handleInteractionEnd}
        onBoxChange={handleBoxChange}
      />

      {/* Flash control (floating above shutter) */}
      <View style={styles.flashButtonContainer}>
        <TouchableOpacity style={styles.flashButton}>
          <Text style={styles.flashIcon}>⭐</Text>
        </TouchableOpacity>
      </View>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 


      {/* Bottom black bar with camera controls */}
      <View style={styles.bottomBlackBar}>
        <TouchableOpacity style={styles.sideButton}>
          <Text style={styles.sideButtonIcon}>🏔️</Text>
        </TouchableOpacity>
        
        <TouchableOpacity disabled={!isReady} onPress={onCapture} style={[styles.shutterButton, !isReady && { opacity: 0.5 }]}>
          <View style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.sideButton}>
          <Text style={styles.sideButtonIcon}>🎤</Text>
        </TouchableOpacity>
      </View>

      {/* Debugging overlay to show camera readiness */}
      {!isReady && (
        <View style={styles.cameraNotReadyOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.cameraNotReadyText}>Waiting for camera...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000',
    width: '100%',
    marginHorizontal: 0,
    paddingHorizontal: 0,
  },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  camera: { 
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  
  // Top bar with controls - full width
  topBar: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 15,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topButtonIcon: {
    fontSize: 20,
    color: '#333',
  },
  getProButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#67e8f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  getProIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  getProText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  
  // Auto-detection toggle
  autoDetectToggleContainer: {
    position: 'absolute',
    top: 120,
    left: 20,
    zIndex: 15,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  autoDetectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  autoDetectButtonActive: {
    backgroundColor: 'rgba(20, 184, 166, 0.9)',
    borderColor: '#14b8a6',
  },
  autoDetectIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  autoDetectText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  
  // Flash control (floating above shutter)
  flashButtonContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 12,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  flashIcon: {
    fontSize: 20,
    color: '#ffd700',
  },
  
  // Bottom black bar
  bottomBlackBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  sideButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideButtonIcon: {
    fontSize: 24,
  },
  
  // Shutter button
  shutterButton: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#14b8a6',
  },
  
  smallBtn: { marginTop: 12, backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  cameraNotReadyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  cameraNotReadyText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
});


