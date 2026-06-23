import { Pressable } from "@/components/Pressable";
import { checkIsAdmin } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";

export default function EditAdminProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userBio, setUserBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

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

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setProfileImage(result.assets[0].uri);
    }
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
      <View className="flex-1 bg-[#eef2f1] items-center justify-center">
        <Text className="text-sm text-gray-500">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#eef2f1]"
      contentContainerStyle={{
        paddingBottom: insets.bottom + 84,
        paddingHorizontal: 12,
        paddingTop: insets.top + 12,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="relative mb-6 h-12 justify-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="absolute left-0 top-0 h-14 w-20 justify-center pl-2 z-10"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </View>
        </Pressable>

        <Text className="text-center text-xl font-extrabold text-gray-900">Edit Admin Profile</Text>

        <Pressable
          onPress={() => void handleSave()}
          disabled={loading}
          className="absolute right-0 top-0 h-14 w-20 justify-center items-end pr-2"
        >
          <Text className={`text-base font-extrabold ${loading ? "text-gray-400" : "text-[#76C893]"}`}>
            Save
          </Text>
        </Pressable>
      </View>

      <View className="bg-white rounded-[28px] p-5 border border-gray-200 mb-4">
        <View className="flex-row items-center mb-4">
          <View className="w-10 h-10 rounded-full bg-[#dbeafe] items-center justify-center">
            <Ionicons name="shield-checkmark" size={20} color="#2563eb" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-extrabold text-gray-900">Support Admin account</Text>
            <Text className="text-sm text-gray-500 mt-0.5">
              Update how you appear to community members.
            </Text>
          </View>
        </View>

        <View className="items-center mb-5">
          <Pressable onPress={() => void pickImage()}>
            <View className="w-32 h-32 rounded-full border-4 border-[#b7ead1] bg-[#eaf7f0] items-center justify-center overflow-hidden">
              {profileImage ? (
                <Image source={{ uri: profileImage }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Ionicons name="person" size={48} color="#52B69A" />
              )}
            </View>
          </Pressable>
          <Text className="text-sm text-gray-500 mt-3">Tap photo to change profile picture</Text>
        </View>

        <Text className="text-sm font-bold text-gray-700 mb-2">Display name</Text>
        <TextInput
          value={userName}
          onChangeText={(t) => setUserName(t.slice(0, 32))}
          maxLength={32}
          className="bg-[#f3f4f3] rounded-xl px-4 py-3 mb-4 text-gray-800 border border-gray-200"
          placeholder="Support Admin"
        />

        <Text className="text-sm font-bold text-gray-700 mb-2">Email</Text>
        <View className="bg-gray-100 rounded-xl px-4 py-3 mb-4 flex-row items-center justify-between">
          <Text className="text-gray-500 flex-1">{userEmail}</Text>
          <Ionicons name="lock-closed" size={18} color="#6b7280" />
        </View>

        <Text className="text-sm font-bold text-gray-700 mb-2">Bio (optional)</Text>
        <TextInput
          value={userBio}
          onChangeText={(t) => setUserBio(t.slice(0, 200))}
          maxLength={200}
          multiline
          textAlignVertical="top"
          className="bg-[#f3f4f3] rounded-xl px-4 py-3 text-gray-800 border border-gray-200 min-h-[100px]"
          placeholder="Short note shown on your admin profile..."
        />
      </View>

      <Pressable
        onPress={() => void handleSave()}
        disabled={loading}
        className={`bg-[#52B69A] py-4 rounded-full items-center ${loading ? "opacity-60" : ""}`}
      >
        <Text className="text-white font-extrabold text-base">
          {loading ? "Saving..." : "Save changes"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
