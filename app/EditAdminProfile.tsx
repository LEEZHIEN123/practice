import { Pressable } from "@/components/Pressable";
import {
    ThemedBackButton,
    ThemedCard,
    ThemedScreen,
    ThemedText,
    useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { checkIsAdmin, syncAuthorProfileImageOnPosts } from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
    Alert,
    Image,
    Modal,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";

const ADMIN_OPTION_BLUE = "#2563eb";

export default function EditAdminProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useThemedScreen();
  const { inputStyle, rowStyle, placeholderColor, modalCardStyle } = useProfileCardStyles();

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userBio, setUserBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [photoSourceVisible, setPhotoSourceVisible] = useState(false);

  useEffect(() => {
    void (async () => {
      const isAdmin = await checkIsAdmin();
      if (!isAdmin) {
        router.replace("/login");
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        router.replace("/login");
        return;
      }

      setUserEmail(user.email ?? "");
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data();
        setUserName(typeof data?.name === "string" ? data.name : "Support Admin");
        setUserBio(typeof data?.bio === "string" ? data.bio : "");
        setProfileImage(typeof data?.profileImage === "string" ? data.profileImage : null);
      } catch {
        // Use defaults
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        useCamera
          ? "We need access to your camera."
          : "We need access to your photo library."
      );
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const openPhotoSourcePicker = () => {
    setPhotoSourceVisible(true);
  };

  const choosePhotoSource = (useCamera: boolean) => {
    setPhotoSourceVisible(false);
    void pickImage(useCamera);
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const trimmedName = userName.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter your display name.");
      return;
    }

    try {
      setLoading(true);

      let profileImageUrl: string | null = profileImage;
      if (profileImage && !profileImage.startsWith("http")) {
        const blob = await (await fetch(profileImage)).blob();
        const objectRef = ref(storage, `users/${user.uid}/profile.jpg`);
        await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
        profileImageUrl = await getDownloadURL(objectRef);
      }

      await updateDoc(doc(db, "users", user.uid), {
        name: trimmedName.slice(0, 32),
        bio: userBio.trim().slice(0, 200),
        profileImage: profileImageUrl,
      });

      if (typeof profileImageUrl === "string" && profileImageUrl.startsWith("http")) {
        await syncAuthorProfileImageOnPosts(profileImageUrl).catch(() => {});
      }

      Alert.alert("Profile updated", "Your admin profile has been saved.");
      router.back();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <ThemedScreen className="items-center justify-center">
        <ThemedText variant="muted" className="text-sm">
          Loading...
        </ThemedText>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 84,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="relative mb-6 h-12 justify-center">
          <View className="absolute left-0 top-0 h-14 w-20 justify-center pl-2 z-10">
            <ThemedBackButton onPress={() => router.back()} icon="arrow-back" />
          </View>

          <ThemedText className="text-center text-xl font-extrabold">Edit Admin Profile</ThemedText>

          <Pressable
            onPress={() => void handleSave()}
            disabled={loading}
            className="absolute right-0 top-0 h-14 w-20 justify-center items-end pr-2"
          >
            <ThemedText
              className="text-base font-extrabold"
              style={{ color: loading ? theme.iconMuted : theme.accent }}
            >
              Save
            </ThemedText>
          </Pressable>
        </View>

        <ThemedCard className="p-5 mb-4">
          <View className="flex-row items-center mb-4">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: theme.accentSoft }}
            >
              <Ionicons name="shield-checkmark" size={20} color="#2563eb" />
            </View>
            <View className="ml-3 flex-1">
              <ThemedText className="text-base font-extrabold">Support Admin account</ThemedText>
              <ThemedText variant="muted" className="text-sm mt-0.5">
                Update how you appear to community members.
              </ThemedText>
            </View>
          </View>

          <View className="items-center mb-5">
            <Pressable onPress={openPhotoSourcePicker}>
              <View
                className="w-32 h-32 rounded-full border-4 items-center justify-center overflow-hidden"
                style={{ borderColor: theme.accent, backgroundColor: theme.accentSoft }}
              >
                {profileImage ? (
                  <Image source={{ uri: profileImage }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <Ionicons name="person" size={48} color={theme.accent} />
                )}
              </View>
            </Pressable>
            <ThemedText variant="muted" className="text-sm mt-3">
              Tap photo to use camera or gallery
            </ThemedText>
          </View>

          <ThemedText variant="secondary" className="text-sm font-bold mb-2">
            Display name
          </ThemedText>
          <TextInput
            value={userName}
            onChangeText={(t) => setUserName(t.slice(0, 32))}
            maxLength={32}
            className="rounded-xl px-4 py-3 mb-4"
            style={inputStyle}
            placeholder="Support Admin"
            placeholderTextColor={placeholderColor}
          />

          <ThemedText variant="secondary" className="text-sm font-bold mb-2">
            Email
          </ThemedText>
          <View className="rounded-xl px-4 py-3 mb-4 flex-row items-center justify-between" style={rowStyle}>
            <ThemedText variant="muted" className="flex-1">
              {userEmail}
            </ThemedText>
            <Ionicons name="lock-closed" size={18} color={theme.iconMuted} />
          </View>

          <ThemedText variant="secondary" className="text-sm font-bold mb-2">
            Bio (optional)
          </ThemedText>
          <TextInput
            value={userBio}
            onChangeText={(t) => setUserBio(t.slice(0, 200))}
            maxLength={200}
            multiline
            textAlignVertical="top"
            className="rounded-xl px-4 py-3 min-h-[100px]"
            style={inputStyle}
            placeholder="Short note shown on your admin profile..."
            placeholderTextColor={placeholderColor}
          />
        </ThemedCard>

        <Pressable
          onPress={() => void handleSave()}
          disabled={loading}
          className={`py-4 rounded-full items-center ${loading ? "opacity-60" : ""}`}
          style={{ backgroundColor: theme.accent }}
        >
          <Text className="font-extrabold text-base" style={{ color: "#ffffff" }}>
            {loading ? "Saving..." : "Save changes"}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={photoSourceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSourceVisible(false)}
      >
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.modalOverlay }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setPhotoSourceVisible(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            className="rounded-2xl px-4 pt-4 pb-2"
            style={[
              modalCardStyle,
              {
                width: 280,
                maxWidth: "82%",
              },
            ]}
          >
            <ThemedText className="text-lg font-extrabold mb-3">
              Change profile picture
            </ThemedText>

            <View className="items-end pr-1">
              <Pressable
                onPress={() => choosePhotoSource(true)}
                className="py-2.5 px-1"
                hitSlop={4}
              >
                <Text
                  className="text-[15px] font-bold text-right"
                  style={{ color: ADMIN_OPTION_BLUE }}
                >
                  Take Photo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => choosePhotoSource(false)}
                className="py-2.5 px-1"
                hitSlop={4}
              >
                <Text
                  className="text-[15px] font-bold text-right"
                  style={{ color: ADMIN_OPTION_BLUE }}
                >
                  Choose from Gallery
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPhotoSourceVisible(false)}
                className="py-2.5 px-1 mb-1"
                hitSlop={4}
              >
                <Text
                  className="text-[15px] font-bold text-right"
                  style={{ color: ADMIN_OPTION_BLUE }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedScreen>
  );
}
