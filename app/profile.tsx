import {
  deleteAccountAfterReauth,
  reauthenticateWithPassword,
} from "@/lib/deleteUserAccount";
import {
  bmiBandKey,
  calcBmi,
  pickOrGenerateWorkoutPlanForBand,
  type PlanDuration,
  workoutPlansByBmiGoalField,
} from "@/lib/workoutPlan";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type GoalLabel = "Gain Weight" | "Maintain Weight" | "Lose Weight";
type Gender = "male" | "female";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [userName, setUserName] = useState(" ");
  const [userEmail, setUserEmail] = useState(" ");
  const [goal, setGoal] = useState<GoalLabel>("Lose Weight");
  const [recommendedGoalLabel, setRecommendedGoalLabel] = useState<GoalLabel | null>(null);
  const [gender, setGender] = useState<Gender>("male");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bmiValue, setBmiValue] = useState<number | null>(null);

  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

  const [deletePasswordModal, setDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;

        if (typeof data?.name === "string") setUserName(data.name);
        if (typeof data?.email === "string") setUserEmail(data.email);
        if (data?.gender === "male" || data?.gender === "female") setGender(data.gender);

        if (data?.recommendedPlan === "gain") setGoal("Gain Weight");
        else if (data?.recommendedPlan === "maintain") setGoal("Maintain Weight");
        else if (data?.recommendedPlan === "lose") setGoal("Lose Weight");

        const bmi =
          typeof data?.bmi === "number" && Number.isFinite(data.bmi)
            ? data.bmi
            : calcBmi(Number(data?.weight ?? 0), Number(data?.height ?? 0));
        if (typeof bmi === "number" && Number.isFinite(bmi)) {
          setBmiValue(bmi);
          if (bmi < 18.5) setRecommendedGoalLabel("Gain Weight");
          else if (bmi <= 24.9) setRecommendedGoalLabel("Maintain Weight");
          else setRecommendedGoalLabel("Lose Weight");
        } else {
          setBmiValue(null);
          setRecommendedGoalLabel(null);
        }

        if (typeof data?.profileImage === "string" && data.profileImage.length > 0) setProfileImage(data.profileImage);
        else setProfileImage(null);
      },
      (error) => console.log("Failed to subscribe profile:", error)
    );

    return () => unsub();
  }, []);

  const goalLabelToKey = (g: GoalLabel): "gain" | "maintain" | "lose" => {
    if (g === "Gain Weight") return "gain";
    if (g === "Maintain Weight") return "maintain";
    return "lose";
  };

  const setGoalAndPersist = async (next: GoalLabel) => {
    const user = auth.currentUser;
    if (!user) return;

    if (next === goal) {
      Alert.alert("No change", "This is already your current goal.");
      return;
    }

    const newKey = goalLabelToKey(next);

    Alert.alert(
      "Update goal?",
      "Your daily calorie target and personalised workout plan will be recalculated. This may change your remaining calories and future workouts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Update",
          style: "default",
          onPress: async () => {
            try {
              setSavingGoal(true);
              setGoal(next);

              const userRef = doc(db, "users", user.uid);
              const snap = await getDoc(userRef);
              const data = snap.exists() ? (snap.data() as any) : {};

              const updates: any = {
                recommendedPlan: newKey,
              };

              const weight = Number(data?.weight ?? 0);
              const height = Number(data?.height ?? 0);
              const bmi = calcBmi(weight, height);

              const desiredDuration = data?.planDuration as PlanDuration | undefined;

              if (desiredDuration && bmi) {
                const plan = pickOrGenerateWorkoutPlanForBand(data, bmi, newKey, desiredDuration);
                const band = bmiBandKey(bmi);
                updates.planDuration = plan.duration;
                updates.planDurationChosenAt = serverTimestamp();
                updates.activeWorkoutPlan = plan;
                updates[workoutPlansByBmiGoalField(band, newKey, plan.duration)] = plan;
              }

              await updateDoc(userRef, updates);

              setGoalModalVisible(false);
              Alert.alert("Goal updated", "Your goal has been updated successfully.");
            } catch (e) {
              console.log("Failed to update goal:", e);
              Alert.alert("Error", "Failed to update your goal. Please try again.");
            } finally {
              setSavingGoal(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("Log out?", "You will need to sign in again to use your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("/");
          } catch (error) {
            console.log("Logout failed:", error);
            Alert.alert("Error", "Could not log out. Please try again.");
          }
        },
      },
    ]);
  };

  const closeDeleteModal = () => {
    setDeletePasswordModal(false);
    setDeletePassword("");
    setShowDeletePassword(false);
  };

  const handleDeletePasswordContinue = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      Alert.alert(
        "Cannot delete",
        "This account cannot be deleted from the app. Please contact support."
      );
      return;
    }
    const pwd = deletePassword.trim();
    if (!pwd) {
      Alert.alert("Password required", "Please enter your password.");
      return;
    }

    setDeleteBusy(true);
    try {
      await reauthenticateWithPassword(user, pwd);
      closeDeleteModal();
      Alert.alert(
        "Delete account permanently?",
        "All your data will be removed permanently. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, delete",
            style: "destructive",
            onPress: async () => {
              const u = auth.currentUser;
              if (!u) {
                router.replace("/login");
                return;
              }
              try {
                setDeleteBusy(true);
                await deleteAccountAfterReauth(u);
                router.replace("/login");
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Something went wrong.";
                Alert.alert("Deletion failed", msg);
              } finally {
                setDeleteBusy(false);
              }
            },
          },
        ]
      );
    } catch {
      Alert.alert("Incorrect password", "Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const rowClass =
    "bg-[#f7f7f7] rounded-3xl px-5 py-5 flex-row items-center justify-between mb-3.5 shadow-sm";

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 120,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="relative mb-6 h-12 justify-center">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="absolute left-0 top-0 h-14 w-20 justify-center pl-2"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </View>
          </Pressable>
          <Text className="text-center text-xl font-extrabold text-gray-900">Profile</Text>
        </View>

        <View>
          <View className="items-center mb-6">
            <View className="relative">
              <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
                <Image
                  source={
                    profileImage
                      ? { uri: profileImage }
                      : gender === "male"
                        ? require("../assets/images/malefitnesspic.avif")
                        : require("../assets/images/femalefitnesspic.avif")
                  }
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
            </View>

            <Text className="text-3xl font-extrabold text-gray-900 mt-4">{userName}</Text>
            <Text className="text-gray-500 text-lg mt-1.5">{userEmail}</Text>
          </View>

          <Pressable
            onPress={() => router.push("/EditProfile")}
            className={rowClass}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Ionicons name="person" size={22} color="#76C893" />
              </View>
              <Text className="text-lg font-bold text-gray-900 ml-4">Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable onPress={() => router.push("/reminder")} className={rowClass}>
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Ionicons name="alarm-outline" size={22} color="#76C893" />
              </View>
              <Text className="text-lg font-bold text-gray-900 ml-4">Reminders</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable onPress={() => setGoalModalVisible(true)} className={rowClass}>
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Ionicons name="radio-button-on-outline" size={22} color="#76C893" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-gray-900">My Goals</Text>
                <Text className="text-[#76C893] text-base font-semibold mt-1">
                  Goal: {goal}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable
            onPress={() => router.push("/terms-of-service")}
            className={rowClass}
          >
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Feather name="file-text" size={20} color="#76C893" />
              </View>
              <Text className="text-lg font-bold text-gray-900 ml-4">Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable
            onPress={() => router.push("/contact-us")}
            className="bg-[#f7f7f7] rounded-3xl px-5 py-5 flex-row items-center justify-between mb-3.5 shadow-sm"
          >
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Feather name="mail" size={20} color="#76C893" />
              </View>
              <Text className="text-lg font-bold text-gray-900 ml-4">Contact Us</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable
            onPress={() => setDeletePasswordModal(true)}
            className="bg-[#f7f7f7] rounded-3xl px-5 py-5 flex-row items-center justify-between mb-8 shadow-sm"
          >
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 rounded-full bg-[#fef2f2] items-center justify-center">
                <Ionicons name="trash-outline" size={22} color="#dc2626" />
              </View>
              <Text className="text-lg font-bold text-gray-900 ml-4">Delete account</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          <Pressable
            onPress={handleLogout}
            className="bg-[#f7f7f7] rounded-3xl py-5 items-center justify-center"
          >
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="logout" size={22} color="#ef4444" />
              <Text className="text-red-500 text-lg font-bold ml-2">Logout</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={goalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !savingGoal && setGoalModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center px-6"
          onPress={() => !savingGoal && setGoalModalVisible(false)}
        >
          <Pressable
            className="bg-white rounded-3xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-extrabold text-gray-900">Edit your goal</Text>
            <Text className="text-gray-500 mt-2">
              This will update your daily calorie target on the Home page.
            </Text>

            <View className="mt-5 gap-3">
              {(
                [
                  { label: "Maintain Weight" as const, desc: "Target = TDEE" },
                  { label: "Lose Weight" as const, desc: "Target = TDEE - 500" },
                  { label: "Gain Weight" as const, desc: "Target = TDEE + 300" },
                ] as const
              )
                .filter((o) => {
                  if (typeof bmiValue === "number") {
                    if (bmiValue < 18.5 && o.label === "Lose Weight") return false;
                    if (bmiValue > 24.9 && o.label === "Gain Weight") return false;
                  }
                  return true;
                })
                .map((o) => {
                const active = goal === o.label;
                const recommended = recommendedGoalLabel === o.label;
                return (
                  <Pressable
                    key={o.label}
                    disabled={savingGoal}
                    onPress={() => void setGoalAndPersist(o.label)}
                    className={`rounded-2xl border p-4 ${
                      active ? "border-[#76C893] bg-[#eaf7f0]" : "border-gray-200 bg-[#fafafa]"
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="pr-3 flex-1">
                        <View className="flex-row items-center flex-wrap">
                          <Text className="text-base font-extrabold text-gray-900">{o.label}</Text>
                          {recommended ? (
                            <View className="ml-2 px-2 py-1 rounded-full bg-amber-50 border border-amber-200">
                              <Text className="text-[10px] font-extrabold text-amber-800">
                                RECOMMEND
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm text-gray-500 mt-1">{o.desc}</Text>
                      </View>
                      <View
                        className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                          active ? "border-[#76C893]" : "border-gray-300"
                        }`}
                      >
                        {active && <View className="w-3 h-3 rounded-full bg-[#76C893]" />}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {recommendedGoalLabel && goal !== recommendedGoalLabel ? (
              <View className="mt-5 bg-[#eaf7f0] border border-[#b7ead1] rounded-2xl p-4">
                <View className="flex-row items-start">
                  <View className="w-8 h-8 rounded-full bg-white items-center justify-center mr-3">
                    <Ionicons name="information-circle-outline" size={18} color="#52B69A" />
                  </View>
                  <Text className="flex-1 text-sm text-gray-700 leading-6">
                    To improve your health, we recommended you{" "}
                    <Text className="font-extrabold text-red-600">{recommendedGoalLabel}</Text> goal.
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="flex-row justify-end mt-6">
              <Pressable
                onPress={() => setGoalModalVisible(false)}
                disabled={savingGoal}
                className="px-4 py-3"
              >
                <Text className="font-extrabold text-gray-500">Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={deletePasswordModal}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center px-6"
            onPress={() => !deleteBusy && closeDeleteModal()}
          >
            <Pressable
              className="bg-white rounded-3xl p-6"
              onPress={(e) => e.stopPropagation()}
            >
              <Text className="text-lg font-extrabold text-gray-900">
                Enter your password
              </Text>
              <Text className="text-gray-500 text-sm mt-2 leading-5">
                For your security, confirm your password before we can continue with account
                deletion.
              </Text>
              <View className="border border-gray-200 rounded-2xl pl-4 pr-2 py-1 mt-4 flex-row items-center bg-[#fafafa]">
                <TextInput
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  secureTextEntry={!showDeletePassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Password"
                  placeholderTextColor="#9ca3af"
                  editable={!deleteBusy}
                  className="flex-1 py-3 pr-2 text-base text-gray-900"
                />
                <Pressable
                  onPress={() => setShowDeletePassword((v) => !v)}
                  disabled={deleteBusy}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="p-2 rounded-xl active:bg-gray-200/60"
                  accessibilityLabel={
                    showDeletePassword ? "Hide password" : "Show password"
                  }
                >
                  <Ionicons
                    name={showDeletePassword ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color="#6b7280"
                  />
                </Pressable>
              </View>
              <View className="flex-row gap-3 mt-5">
                <Pressable
                  onPress={closeDeleteModal}
                  disabled={deleteBusy}
                  className="flex-1 py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200"
                >
                  <Text className="font-bold text-gray-700">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleDeletePasswordContinue()}
                  disabled={deleteBusy}
                  className="flex-1 py-3.5 rounded-2xl bg-red-600 items-center justify-center active:opacity-90"
                >
                  {deleteBusy ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="font-bold text-white">Continue</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable onPress={() => router.replace("/home")} className="items-center">
          <Ionicons name="home-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">HOME</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/discover")} className="items-center">
          <Ionicons name="compass-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">DISCOVER</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/progress")} className="items-center">
          <Ionicons name="stats-chart-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">PROGRESS</Text>
        </Pressable>

        <Pressable className="items-center">
          <Ionicons name="person" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">PROFILE</Text>
        </Pressable>
      </View>
    </View>
  );
}
