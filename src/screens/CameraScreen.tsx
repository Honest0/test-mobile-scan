import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Platform, Alert } from 'react-native';
import { Camera, CameraType, AutoFocus } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { detectTextArea, analyzeTextDensity } from '../utils/imageUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CameraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cameraRef = useRef<Camera | null>(null);
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const [type] = useState(CameraType.back);
  const [autoMode, setAutoMode] = useState(true);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [permission]);

  const onCapture = useCallback(async () => {
    if (!cameraRef.current) {
      console.log('Camera ref is null, cannot take picture.');
      return;
    }
    console.log('🔍 Attempting to take picture...');
    try {
      let photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: true, // Need base64 for pixel analysis
        exif: true,
        skipProcessing: false, // Let expo-camera process the image correctly
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
      
      // Analyze the image to find the area with the most text density
      console.log('🔍 Analyzing image for text density...');
      const textDensityResult = await analyzeTextDensity(
        photo.uri,
        photoWidth,
        photoHeight,
        SCREEN_WIDTH,
        SCREEN_HEIGHT
      );
      
      if (textDensityResult) {
        console.log('✨ Text-dense area detected!', textDensityResult);
        navigation.navigate('Preview', { 
          photo: { uri: photo.uri, width: photoWidth, height: photoHeight },
          crop: textDensityResult
        });
      } else {
        // Fallback to heuristic detection if analysis fails
        console.log('⚠️ Using fallback detection');
        const autoCrop = detectTextArea(SCREEN_WIDTH, SCREEN_HEIGHT, {
          topOffset: 120,
          bottomOffset: 120,
          widthRatio: 0.85,
          heightRatio: 0.4,
          verticalPosition: 'upper-center'
        });
        
        navigation.navigate('Preview', { 
          photo: { uri: photo.uri, width: photoWidth, height: photoHeight },
          crop: autoCrop
        });
      }
    } catch (e: any) {
      console.error('❌ Failed to take picture:', e);
      Alert.alert('Error', 'Failed to capture photo: ' + (e.message || 'Unknown error'));
    }
  }, [navigation]);


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

      {/* Semi-transparent document area overlay */}
      <View style={styles.documentArea}>
        {/* Flash control (floating above shutter) */}
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
    zIndex: 10,
    ...(Platform.OS === 'android' && {
      transform: [{ scaleY: -1 }],
    }),
  },
  
  // Document area overlay - full width
  documentArea: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    bottom: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#67e8f9', // Light blue border
    zIndex: 5,
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
  
  // Flash control (floating above shutter)
  flashButton: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  flashIcon: {
    fontSize: 16,
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
    borderWidth: 4,
    borderColor: '#14b8a6',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
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


