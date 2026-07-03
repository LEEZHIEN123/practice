import { Pressable } from "@/components/Pressable";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { uploadAndSaveProfilePhoto } from "@/lib/profilePhotoStorage";
import { Ionicons } from "@expo/vector-icons";
import { ImageEditor } from "expo-dynamic-image-crop";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ProfilePhotoEditFlowProps = {
  open: boolean;
  currentProfileImage: string | null;
  onClose: () => void;
  onSaved: (profileImageUrl: string) => void;
};

export function ProfilePhotoEditFlow({
  open,
  currentProfileImage,
  onClose,
  onSaved,
}: ProfilePhotoEditFlowProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useThemedScreen();
  const openedRef = useRef(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cropperVisible, setCropperVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetEditor = () => {
    setEditorVisible(false);
    setEditorImage(null);
    setCropperVisible(false);
    setProcessingPhoto(false);
  };

  const closeFlow = () => {
    resetEditor();
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera or photo access to change your profile photo.");
      closeFlow();
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
        });

    if (result.canceled || !result.assets[0]?.uri) {
      closeFlow();
      return;
    }

    setEditorImage(result.assets[0].uri);
    setEditorVisible(true);
  };

  const openSourcePicker = useCallback(() => {
    const buttons: {
      text: string;
      style?: "cancel" | "destructive" | "default";
      onPress?: () => void;
    }[] = [
      { text: "Take Photo", onPress: () => void pickImage(true) },
      { text: "Choose from Gallery", onPress: () => void pickImage(false) },
    ];

    if (currentProfileImage) {
      buttons.unshift({
        text: "Edit Current Photo",
        onPress: () => {
          setEditorImage(currentProfileImage);
          setEditorVisible(true);
        },
      });
    }

    buttons.push({ text: "Cancel", style: "cancel", onPress: closeFlow });

    Alert.alert("Edit profile photo", undefined, buttons);
  }, [currentProfileImage]);

  useEffect(() => {
    if (open) {
      if (!openedRef.current) {
        openedRef.current = true;
        openSourcePicker();
      }
      return;
    }
    openedRef.current = false;
    resetEditor();
  }, [open, openSourcePicker]);

  const rotateLeft = async () => {
    if (!editorImage) return;
    try {
      setProcessingPhoto(true);
      const result = await ImageManipulator.manipulateAsync(
        editorImage,
        [{ rotate: -90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditorImage(result.uri);
    } catch {
      Alert.alert("Error", "Failed to rotate image.");
    } finally {
      setProcessingPhoto(false);
    }
  };

  const rotateRight = async () => {
    if (!editorImage) return;
    try {
      setProcessingPhoto(true);
      const result = await ImageManipulator.manipulateAsync(
        editorImage,
        [{ rotate: 90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditorImage(result.uri);
    } catch {
      Alert.alert("Error", "Failed to rotate image.");
    } finally {
      setProcessingPhoto(false);
    }
  };

  const saveEditedPhoto = async () => {
    if (!editorImage) return;
    try {
      setSaving(true);
      const profileImageUrl = await uploadAndSaveProfilePhoto(editorImage);
      resetEditor();
      onSaved(profileImageUrl);
      onClose();
      Alert.alert("Profile photo updated", "Your profile picture has been saved.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save profile photo.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditor = () => {
    resetEditor();
    closeFlow();
  };

  if (!open && !editorVisible) return null;

  return (
    <>
      <Modal visible={editorVisible} animationType="slide" transparent={false} onRequestClose={cancelEditor}>
        <View className="flex-1" style={{ backgroundColor: "#000000" }}>
          <View
            className="flex-row items-center justify-between px-3 pb-4"
            style={{ paddingTop: insets.top + 8 }}
          >
            <Pressable onPress={cancelEditor} hitSlop={8}>
              <Ionicons name="arrow-back" size={26} color="white" />
            </Pressable>
            <Text className="text-white text-lg font-bold">Edit Photo</Text>
            <View className="w-12" />
          </View>

          <View className="flex-1 items-center justify-center px-4">
            {editorImage ? (
              <Image
                source={{ uri: editorImage }}
                style={{ width: "100%", height: 420, borderRadius: 20 }}
                resizeMode="contain"
              />
            ) : (
              <Text className="text-white">No image selected</Text>
            )}
          </View>

          <View
            className="px-3 pt-4 rounded-t-3xl"
            style={{ backgroundColor: theme.navBg, paddingBottom: insets.bottom + 16 }}
          >
            <Text className="text-center mb-5" style={{ color: theme.textSecondary }}>
              {processingPhoto || saving ? "Processing..." : "Photo tools"}
            </Text>

            <View className="flex-row justify-between">
              <Pressable
                onPress={() => void rotateLeft()}
                disabled={processingPhoto || saving}
                className="flex-1 mr-2 rounded-2xl py-4 items-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <Ionicons name="refresh-outline" size={22} color={theme.textPrimary} />
                <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                  Rotate Left
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void rotateRight()}
                disabled={processingPhoto || saving}
                className="flex-1 ml-2 rounded-2xl py-4 items-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <Ionicons name="reload-outline" size={22} color={theme.textPrimary} />
                <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                  Rotate Right
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setCropperVisible(true)}
              disabled={processingPhoto || saving || !editorImage}
              className="mt-4 rounded-2xl py-4 items-center"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="crop-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                Free Crop
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void saveEditedPhoto()}
              disabled={processingPhoto || saving || !editorImage}
              className="mt-4 rounded-2xl py-4 items-center"
              style={{ backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-base font-bold">Save Photo</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {editorImage ? (
        <ImageEditor
          isVisible={cropperVisible}
          imageUri={editorImage}
          onEditingComplete={(croppedImageData) => {
            setEditorImage(croppedImageData.uri);
            setCropperVisible(false);
          }}
          onEditingCancel={() => setCropperVisible(false)}
          dynamicCrop
        />
      ) : null}
    </>
  );
}
