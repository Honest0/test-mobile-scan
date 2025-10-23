import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions, ToastAndroid, Platform, Modal, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PreviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = route.params as RootStackParamList['Preview'];
  const [showDialog, setShowDialog] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const subjects = ['Math', 'Biology', 'Physics', 'Chemistry', 'History', 'Geography'];

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
    console.log('Image URI:', params.photo.uri);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Preview Question</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Cropped image card - matching screenshot design */}
        <View style={styles.imageCard}>
          <View style={styles.cardInner}>
            <Image 
              source={{ uri: params.photo.uri }} 
              style={styles.previewImage} 
              resizeMode="contain"
            />
          </View>
          <Text style={styles.imageLabel}>Detected Question</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={[styles.button, styles.retakeButton]}
          >
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={onConfirm} 
            style={[styles.button, styles.confirmButton]}
          >
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>

        {/* Subject Selection Modal - matching screenshot design */}
        <Modal
          visible={showDialog}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDialog(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {/* Question preview in modal */}
              <View style={styles.modalPreviewCard}>
                <Image 
                  source={{ uri: params.photo.uri }} 
                  style={styles.modalPreviewImage} 
                  resizeMode="contain" 
                />
              </View>

              {/* Question prompt */}
              <Text style={styles.modalTitle}>What is the question{'\n'}related to?</Text>

              {/* Subject buttons */}
              <ScrollView 
                style={styles.subjectList} 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.subjectListContent}
              >
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

              {/* Swipe indicator */}
              <View style={styles.swipeIndicator} />
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
    backgroundColor: '#1a1a1a',
  },
  container: { 
    flex: 1, 
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  placeholder: {
    width: 40,
  },
  
  // Image card - matching screenshot design
  imageCard: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 24,
    padding: 20,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardInner: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imageLabel: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  
  // Action buttons
  buttonsContainer: { 
    flexDirection: 'row', 
    gap: 12, 
    paddingVertical: 16,
    paddingBottom: 20,
  },
  button: { 
    flex: 1, 
    paddingVertical: 18, 
    borderRadius: 16, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  retakeButton: { 
    backgroundColor: '#374151',
  },
  retakeButtonText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 16,
  },
  confirmButton: { 
    backgroundColor: '#14b8a6',
  },
  confirmButtonText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 16,
  },
  
  // Modal styles - matching screenshot
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  swipeIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalPreviewCard: {
    width: '100%',
    height: 100,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  modalPreviewImage: {
    width: '100%',
    height: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 28,
  },
  subjectList: {
    maxHeight: 400,
  },
  subjectListContent: {
    paddingBottom: 8,
  },
  subjectButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  subjectButtonSelected: {
    backgroundColor: '#d1fae5',
    borderColor: '#14b8a6',
  },
  subjectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
});
