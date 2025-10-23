# Scan Crop Demo

A React Native app that captures photos and provides **real-time auto-detection** of question areas with live preview, similar to Brainly. Built with Expo and TypeScript.

## 🆕 What's New - Real-Time Auto-Detection

The app now features **live detection** that shows a hovering detection box over the camera preview *before* you take a photo! As you move your camera, the app automatically tracks and highlights potential question areas in real-time.

**Key Improvements:**
- ✨ Live detection box visible during camera preview (not just after capture)
- 🖐️ **Fully interactive** - drag to move, resize from corners (NEW!)
- ⏸️ **Auto-pause detection** - stops updating when you touch the box (NEW!)
- 📐 **Stable tracking** - no more jitter or shaking (NEW!)
- 🎯 Auto-detection toggle for switching between automatic and manual modes  
- 🚀 Instant cropping - images are cropped before preview screen
- 🎨 Polished UI matching the reference design with smooth animations
- ⚡ Optimized performance with 3 FPS detection for battery efficiency

**New Interactive Features:**
- Drag the box anywhere to reposition it
- Grab any corner handle to resize
- Detection automatically pauses while you adjust
- Your manual adjustments are saved and used for cropping

See [FEATURES.md](FEATURES.md) for detailed documentation and [GESTURE_GUIDE.md](GESTURE_GUIDE.md) for gesture controls.

## Features

- 📸 **Camera Integration**: Capture photos using device camera
- 🎯 **Real-Time Auto-Detection**: Live detection box that tracks questions as you move the camera (like Brainly)
- 🖐️ **Interactive Gestures**: Drag to move, resize from corners - fully touch-enabled
- ⏸️ **Smart Pause**: Detection automatically pauses when you interact with the box
- 📐 **Stable Tracking**: Threshold-based updates prevent jitter and shaking
- ⚡ **Instant Cropping**: Automatic crop to detected area before preview - no post-processing needed
- 🔄 **Auto/Manual Toggle**: Switch between automatic detection and manual mode
- 🎯 **Bounds Protection**: Box stays within valid area, enforces min/max sizes
- ✋ **Smooth Animations**: Buttery-smooth 60fps animations using React Native Reanimated
- 📱 **Cross-Platform**: Works on iOS, Android, and Web
- 🎨 **Modern UI**: Dark theme with clean, professional design matching the reference screenshot
- 💾 **Adjustment Memory**: Manual changes are saved and used for cropping

## How to Run Locally

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g @expo/cli`
- iOS Simulator (for iOS development) or Android Studio (for Android development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd scan-crop-demo
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

### Running on iOS Simulator

1. **Start the development server**
   ```bash
   npm run ios
   # or
   yarn ios
   ```

2. **Alternative method (if you have iOS Simulator installed)**
   ```bash
   npm start
   # Then press 'i' to open iOS Simulator
   ```

### Running on Android Emulator

1. **Ensure Android Studio is installed with an emulator set up**

2. **Start the development server**
   ```bash
   npm run android
   # or
   yarn android
   ```

3. **Alternative method**
   ```bash
   npm start
   # Then press 'a' to open Android Emulator
   ```

### Running on Web

```bash
npm run web
# or
yarn web
```

### Troubleshooting

- **iOS Simulator not opening**: Make sure Xcode is installed and iOS Simulator is available
- **Android Emulator issues**: Ensure Android Studio is properly configured and an emulator is running
- **Metro bundler issues**: Try clearing cache with `npx expo start --clear`

## Decisions and Tradeoffs

### Crop Overlay Approach

**Decision**: Custom PanResponder-based gesture handling instead of third-party libraries

**Rationale**: 
- Full control over gesture behavior and performance
- Avoided dependency bloat from gesture libraries
- Custom implementation allows for precise constraint handling
- Better integration with our specific use case

**Tradeoffs**:
- More complex implementation requiring careful state management
- Need to handle edge cases manually (gesture termination, bounds checking)
- More code to maintain compared to using react-native-gesture-handler

### Image Handling Strategy

**Decision**: Real-time cropping with debounced updates

**Rationale**:
- Provides immediate visual feedback during adjustments
- Debouncing prevents excessive API calls during rapid gestures
- Uses `expo-image-manipulator` for reliable cross-platform image processing

**Tradeoffs**:
- Higher CPU usage during active gestures
- Potential memory pressure with large images
- Complex state synchronization between UI and image processing

### Animation Choices

**Decision**: `requestAnimationFrame` for smooth UI updates

**Rationale**:
- Eliminates visual stuttering during gestures
- Provides 60fps smooth animations
- Better user experience compared to direct state updates

**Tradeoffs**:
- More complex state management with refs and animation frames
- Potential for memory leaks if not properly cleaned up
- Slightly higher complexity in debugging gesture states

### Auto-Detection Algorithm

**Decision**: Density-based heuristic analysis instead of ML/OCR

**Rationale**:
- No external dependencies or API calls required
- Works offline and is privacy-friendly
- Fast execution suitable for real-time use
- Customizable parameters for different document types

**Tradeoffs**:
- Less accurate than OCR-based solutions
- Requires manual tuning for different document layouts
- May not work well with complex or unusual text arrangements

### Layout and Responsive Design

**Decision**: Fixed container heights with SafeAreaView

**Rationale**:
- Prevents layout shifts during gestures
- Ensures consistent UI across different screen sizes
- SafeAreaView handles device-specific safe areas automatically

**Tradeoffs**:
- Less flexible for different content sizes
- May not adapt well to very small or very large screens
- Fixed heights might not work for all use cases

## Known Limitations

### Current Limitations

1. **Auto-Detection Accuracy**
   - Works best with clear, high-contrast text
   - May struggle with handwritten text or unusual fonts
   - Limited to horizontal text layouts

2. **Performance**
   - Large images may cause memory pressure
   - Real-time cropping can be CPU intensive on older devices
   - No image compression before processing

3. **Platform Differences**
   - Gesture behavior may vary slightly between iOS and Android
   - Camera permissions handling differs between platforms
   - Web version has limited camera access

4. **Error Handling**
   - Limited fallback mechanisms for failed image processing
   - No retry logic for network-related issues
   - Basic error messages for users

5. **Accessibility**
   - Limited screen reader support
   - No keyboard navigation for web version
   - Gesture-based interface may be challenging for some users

### What I Would Do Next with More Time

#### Short Term (1-2 weeks)

1. **Enhanced Auto-Detection**
   - Integrate OCR (Tesseract.js) for more accurate text detection
   - Add machine learning model for better question area prediction
   - Implement multiple detection algorithms with fallbacks

2. **Performance Optimizations**
   - Add image compression before processing
   - Implement image caching and lazy loading
   - Optimize gesture handling for smoother performance

3. **Better Error Handling**
   - Comprehensive error boundaries
   - User-friendly error messages with retry options
   - Offline mode with queue for failed operations

#### Medium Term (1-2 months)

4. **Advanced Features**
   - Multiple crop area support
   - Batch processing capabilities
   - Cloud storage integration
   - Export to various formats (PDF, images)

5. **Accessibility Improvements**
   - Full screen reader support
   - Keyboard navigation for web
   - Voice commands for gesture control
   - High contrast mode

6. **Testing and Quality**
   - Comprehensive unit and integration tests
   - E2E testing with Detox
   - Performance monitoring and analytics
   - A/B testing for UI improvements

#### Long Term (3+ months)

7. **AI/ML Integration**
   - Custom trained model for question detection
   - Smart cropping suggestions based on document type
   - Automatic quality assessment and recommendations

8. **Advanced UI/UX**
   - Undo/redo functionality
   - Multiple editing modes (precise, quick, batch)
   - Customizable interface themes
   - Advanced gesture customization

9. **Enterprise Features**
   - Multi-user support
   - Document management system
   - API for third-party integrations
   - Advanced analytics and reporting

## Technical Architecture

### Key Components

- **CameraScreen**: Real-time detection with live camera preview and auto-detection toggle
- **AutoDetectionBox**: Animated detection box overlay with smooth transitions
- **PreviewScreen**: Simplified preview showing already-cropped images
- **realtimeDetection**: Fast heuristic-based detection algorithms for live preview
- **imageUtils**: Legacy text detection and image processing utilities
- **CropOverlay**: Legacy manual crop overlay component

### Dependencies

- **Expo**: Cross-platform development framework
- **React Navigation**: Screen navigation
- **expo-camera**: Camera functionality and capture
- **expo-image-manipulator**: Image processing and cropping
- **react-native-reanimated**: 60fps smooth animations on UI thread
- **react-native-gesture-handler**: Advanced gesture handling
- **TypeScript**: Type safety and better development experience

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.