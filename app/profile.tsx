import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { AppearanceModal } from "@/components/profile/AppearanceModal";
import { ProfileStatsCards } from "@/components/profile/ProfileStatsCards";
import { ProfileScreenHeader } from "@/components/themed/ThemedUi";
import { ZoomableImageModal } from "@/components/ZoomableImageModal";
import { useAppearance } from "@/context/AppearanceContext";
import { getLastMainTabRoute } from "@/lib/bottomTabHistory";
import {
  deleteAccountAfterReauth,
  reauthenticateWithPassword,
} from "@/lib/deleteUserAccount";
import { firebaseAuthErrorMessage } from "@/lib/firebaseAuthErrors";
import { subscribeProfileWorkoutStats } from "@/lib/profileStats";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import {
  bmiBandKey,
  buildWorkoutPlanArchiveEntry,
  calcBmi,
  pickOrGenerateWorkoutPlanForBand,
  type PlanDuration,
  workoutPlansByBmiGoalField,
} from "@/lib/workoutPlan";
import {
  normalizeNutritionActivity,
  normalizeNutritionDietary,
  normalizeNutritionGoal,
  nutritionIntakeTargetKcal,
  nutritionPlanArchiveUpdateFields,
  nutritionPlanDurationFromUserData,
  pickOrGenerateNutritionPlan,
  type ActiveNutritionPlan,
} from "@/lib/nutritionPlan";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
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
  const tabBarPadding = useBottomTabBarScrollPadding();
  const { mode, theme } = useAppearance();
  useAdminRedirect();

  const [userName, setUserName] = useState(" ");
  const [userEmail, setUserEmail] = useState(" ");
  const [goal, setGoal] = useState<GoalLabel>("Lose Weight");
  const [recommendedGoalLabel, setRecommendedGoalLabel] = useState<GoalLabel | null>(null);
  const [gender, setGender] = useState<Gender>("male");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bmiValue, setBmiValue] = useState<number | null>(null);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);

  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

  const [deletePasswordModal, setDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [profileViewerVisible, setProfileViewerVisible] = useState(false);

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

        const weight =
          typeof data?.weight === "number" && Number.isFinite(data.weight) && data.weight > 0
            ? data.weight
            : null;
        setCurrentWeightKg(weight);
      },
      (error) => console.log("Failed to subscribe profile:", error)
    );

    const unsubStats = subscribeProfileWorkoutStats(
      user.uid,
      (stats) => {
        setTotalCalories(stats.totalCalories);
        setTotalWorkouts(stats.totalWorkouts);
      },
      (error) => console.log("Failed to subscribe workout stats:", error)
    );

    return () => {
      unsub();
      unsubStats();
    };
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
      "Your daily calorie target, workout plan, and nutrition plan will be recalculated. When you switch back, your previous nutrition progress will be restored.",
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
              const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};

              const updates: Record<string, unknown> = {
                recommendedPlan: newKey,
              };

              const weight = Number(data?.weight ?? 0);
              const height = Number(data?.height ?? 0);
              const bmi = calcBmi(weight, height);

              const desiredDuration = data?.planDuration as PlanDuration | undefined;

              if (desiredDuration && bmi) {
                const plan = pickOrGenerateWorkoutPlanForBand(data, bmi, newKey, desiredDuration).plan;
                const band = bmiBandKey(bmi);
                updates.planDuration = plan.duration;
                updates.planDurationChosenAt = serverTimestamp();
                updates.activeWorkoutPlan = plan;
                updates[workoutPlansByBmiGoalField(band, newKey, plan.duration)] =
                  buildWorkoutPlanArchiveEntry(plan, null, null);
              }

              const existingNutritionPlan =
                (data.activeNutritionPlan as ActiveNutritionPlan | undefined) ?? null;
              const nutritionLcd = Number(data.activeNutritionPlanLastCompletedDay);
              const nutritionLastCompletedDay =
                Number.isFinite(nutritionLcd) && nutritionLcd > 0 ? Math.floor(nutritionLcd) : null;
              const nutritionLastCompletedAt =
                (data.activeNutritionPlanLastCompletedAt as { toDate?: () => Date } | undefined)
                  ?.toDate?.() instanceof Date
                  ? (data.activeNutritionPlanLastCompletedAt as { toDate: () => Date }).toDate()
                  : null;

              const archivePatch = existingNutritionPlan
                ? nutritionPlanArchiveUpdateFields(
                    existingNutritionPlan,
                    nutritionLastCompletedDay,
                    nutritionLastCompletedAt
                  )
                : {};
              Object.assign(updates, archivePatch);

              const nutritionDuration = nutritionPlanDurationFromUserData(data);
              const nutritionGoal = normalizeNutritionGoal(newKey);
              const dietaryPreference = normalizeNutritionDietary(
                typeof data.dietaryPreference === "string" ? data.dietaryPreference : null
              );
              const activityLevel = normalizeNutritionActivity(
                typeof data.activityLevel === "string" ? data.activityLevel : null,
                typeof data.activityMultiplier === "number" ? data.activityMultiplier : null
              );
              const dailyCalorieTarget = nutritionIntakeTargetKcal({
                weightKg: weight,
                heightCm: height,
                age: Number(data.age ?? 0),
                gender:
                  data.gender === "male" || data.gender === "female" ? data.gender : null,
                activityMultiplier:
                  typeof data.activityMultiplier === "number" ? data.activityMultiplier : null,
                goal: nutritionGoal,
              });

              const {
                plan: nutritionPlan,
                lastCompletedDay,
                lastCompletedAt,
              } = pickOrGenerateNutritionPlan({
                data: { ...data, ...archivePatch },
                duration: nutritionDuration,
                bmi,
                goal: nutritionGoal,
                dietaryPreference,
                activityLevel,
                dailyCalorieTarget,
              });

              updates.activeNutritionPlan = nutritionPlan;
              updates.activeNutritionPlanLastCompletedDay = lastCompletedDay;
              updates.activeNutritionPlanLastCompletedAt = lastCompletedAt
                ? Timestamp.fromDate(lastCompletedAt)
                : null;

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

  const closeChangePasswordModal = () => {
    setChangePasswordVisible(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleChangePassword = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      Alert.alert(
        "Cannot change password",
        "This account cannot change password from the app. Please contact support."
      );
      return;
    }
    if (!currentPassword.trim()) {
      Alert.alert("Password required", "Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Weak password", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert("Same password", "Choose a new password that is different from your current one.");
      return;
    }

    try {
      setChangingPassword(true);
      await reauthenticateWithPassword(user, currentPassword.trim());
      await updatePassword(user, newPassword);
      closeChangePasswordModal();
      Alert.alert("Password updated", "Your password has been changed successfully.");
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        Alert.alert("Wrong password", "Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        Alert.alert("Weak password", "Please choose a stronger password.");
      } else {
        Alert.alert("Error", firebaseAuthErrorMessage(e));
      }
    } finally {
      setChangingPassword(false);
    }
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

  const rowStyle = {
    backgroundColor: theme.rowBg,
    borderColor: theme.cardBorder,
    borderWidth: 1,
  };

  const appearanceLabel = mode === "dark" ? "Dark mode" : "Light mode";

  const profilePhotoSource = profileImage
    ? { uri: profileImage }
    : gender === "male"
      ? require("../assets/images/malefitnesspic.avif")
      : require("../assets/images/femalefitnesspic.avif");

  return (
    <View className="flex-1" style={{ backgroundColor: theme.screenBg }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: tabBarPadding,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <ProfileScreenHeader
          title="Profile"
          titleClassName="text-3xl"
          onBack={() => {
            // Tab switches use replace(), so router.back() can leave the app
            // (e.g. launch/login). Return to the previous main tab instead.
            router.replace(getLastMainTabRoute());
          }}
        />

        <View>
          <View className="items-center mb-6">
            <View className="relative">
              <Pressable onPress={() => setProfileViewerVisible(true)} accessibilityLabel="View profile photo">
                <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
                  <Image
                    source={profilePhotoSource}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                </View>
              </Pressable>
            </View>

            <Text className="text-3xl font-extrabold mt-4" style={{ color: theme.textPrimary }}>
              {userName}
            </Text>
            <Text className="text-lg mt-1.5" style={{ color: theme.textMuted }}>
              {userEmail}
            </Text>
          </View>

          <ProfileStatsCards
            totalCalories={totalCalories}
            totalWorkouts={totalWorkouts}
            currentWeightKg={currentWeightKg}
            theme={theme}
          />

          <Pressable
            onPress={() => router.push("/EditProfile")}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="person" size={20} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Edit Profile
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/my-report" as any)}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="document-text-outline" size={20} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                My Report
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/reminder")}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="alarm-outline" size={20} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Reminders
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/favourites")}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="heart-outline" size={20} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Favourites
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => setGoalModalVisible(true)}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="radio-button-on-outline" size={20} color={theme.accent} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold" style={{ color: theme.textPrimary }}>
                  My Goals
                </Text>
                <Text className="text-sm font-semibold mt-0.5" style={{ color: theme.accent }}>
                  Goal: {goal}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => setAppearanceVisible(true)}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="contrast-outline" size={20} color={theme.accent} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold" style={{ color: theme.textPrimary }}>
                  Appearance
                </Text>
                <Text className="text-sm font-semibold mt-0.5" style={{ color: theme.accentText }}>
                  {appearanceLabel}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/terms-of-service")}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Feather name="file-text" size={18} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Terms of Service
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => setChangePasswordVisible(true)}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
            style={rowStyle}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="key-outline" size={20} color={theme.accent} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Change password
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={() => setDeletePasswordModal(true)}
            className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-6 shadow-sm"
            style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder, borderWidth: 1 }}
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.dangerSoft }}
              >
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </View>
              <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
                Delete account
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
          </Pressable>

          <Pressable
            onPress={handleLogout}
            className="rounded-3xl py-4 items-center justify-center"
            style={rowStyle}
          >
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="logout" size={20} color={theme.danger} />
              <Text className="text-base font-bold ml-2" style={{ color: theme.danger }}>
                Logout
              </Text>
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
            className="rounded-3xl p-6"
            style={{ backgroundColor: theme.modalBg, borderColor: theme.cardBorder, borderWidth: 1 }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-extrabold" style={{ color: theme.textPrimary }}>Edit your goal</Text>
            <Text className="mt-2" style={{ color: theme.textMuted }}>
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
                    className="rounded-2xl border p-4"
                    style={
                      active
                        ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                        : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                    }
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="pr-3 flex-1">
                        <View className="flex-row items-center flex-wrap">
                          <Text className="text-base font-extrabold" style={{ color: theme.textPrimary }}>{o.label}</Text>
                          {recommended ? (
                            <View className="ml-2 px-2 py-1 rounded-full bg-amber-50 border border-amber-200">
                              <Text className="text-[10px] font-extrabold text-amber-800">
                                RECOMMEND
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm mt-1" style={{ color: theme.textMuted }}>{o.desc}</Text>
                      </View>
                      <View
                        className="w-6 h-6 rounded-full border-2 items-center justify-center"
                        style={{ borderColor: active ? theme.accent : theme.iconMuted }}
                      >
                        {active && <View className="w-3 h-3 rounded-full bg-[#76C893]" />}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {recommendedGoalLabel && goal !== recommendedGoalLabel ? (
              <View
                className="mt-5 rounded-2xl p-4 border"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
              >
                <View className="flex-row items-start">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: theme.cardBg }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={theme.accent} />
                  </View>
                  <Text className="flex-1 text-sm leading-6" style={{ color: theme.textSecondary }}>
                    To improve your health, we recommended you{" "}
                    <Text className="font-extrabold" style={{ color: theme.danger }}>{recommendedGoalLabel}</Text> goal.
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
                <Text className="font-extrabold" style={{ color: theme.textMuted }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={changePasswordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !changingPassword && closeChangePasswordModal()}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center px-6"
            onPress={() => !changingPassword && closeChangePasswordModal()}
          >
            <Pressable
              className="rounded-3xl p-6"
              style={{ backgroundColor: theme.modalBg, borderColor: theme.cardBorder, borderWidth: 1 }}
              onPress={(e) => e.stopPropagation()}
            >
              <Text className="text-lg font-extrabold" style={{ color: theme.textPrimary }}>
                Change password
              </Text>
              <Text className="text-sm mt-2 leading-5" style={{ color: theme.textMuted }}>
                Enter your current password, then choose a new one.
              </Text>

              {(
                [
                  {
                    label: "Current password",
                    value: currentPassword,
                    setValue: setCurrentPassword,
                    show: showCurrentPassword,
                    setShow: setShowCurrentPassword,
                  },
                  {
                    label: "New password",
                    value: newPassword,
                    setValue: setNewPassword,
                    show: showNewPassword,
                    setShow: setShowNewPassword,
                  },
                  {
                    label: "Confirm new password",
                    value: confirmPassword,
                    setValue: setConfirmPassword,
                    show: showConfirmPassword,
                    setShow: setShowConfirmPassword,
                  },
                ] as const
              ).map((field) => (
                <View key={field.label} className="mt-4">
                  <Text className="text-xs font-bold mb-1.5 ml-1" style={{ color: theme.textMuted }}>
                    {field.label}
                  </Text>
                  <View
                    className="rounded-2xl pl-4 pr-2 py-1 flex-row items-center"
                    style={{
                      backgroundColor: theme.rowBg,
                      borderColor: theme.cardBorder,
                      borderWidth: 1,
                    }}
                  >
                    <TextInput
                      value={field.value}
                      onChangeText={field.setValue}
                      secureTextEntry={!field.show}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={field.label}
                      placeholderTextColor={theme.textMuted}
                      editable={!changingPassword}
                      className="flex-1 py-3 pr-2 text-base"
                      style={{ color: theme.textPrimary }}
                    />
                    <Pressable
                      onPress={() => field.setShow((v) => !v)}
                      disabled={changingPassword}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      className="p-2 rounded-xl"
                    >
                      <Ionicons
                        name={field.show ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={theme.iconMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}

              <View className="flex-row gap-3 mt-5">
                <Pressable
                  onPress={closeChangePasswordModal}
                  disabled={changingPassword}
                  className="flex-1 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: theme.rowBg }}
                >
                  <Text className="font-bold" style={{ color: theme.textSecondary }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleChangePassword()}
                  disabled={changingPassword}
                  className="flex-1 py-3.5 rounded-2xl items-center justify-center active:opacity-90"
                  style={{ backgroundColor: theme.accent }}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="font-bold text-white">Update</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
              className="rounded-3xl p-6"
              style={{ backgroundColor: theme.modalBg, borderColor: theme.cardBorder, borderWidth: 1 }}
              onPress={(e) => e.stopPropagation()}
            >
              <Text className="text-lg font-extrabold" style={{ color: theme.textPrimary }}>
                Enter your password
              </Text>
              <Text className="text-sm mt-2 leading-5" style={{ color: theme.textMuted }}>
                For your security, confirm your password before we can continue with account
                deletion.
              </Text>
              <View
                className="rounded-2xl pl-4 pr-2 py-1 mt-4 flex-row items-center"
                style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder, borderWidth: 1 }}
              >
                <TextInput
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  secureTextEntry={!showDeletePassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Password"
                  placeholderTextColor={theme.textMuted}
                  editable={!deleteBusy}
                  className="flex-1 py-3 pr-2 text-base"
                  style={{ color: theme.textPrimary }}
                />
                <Pressable
                  onPress={() => setShowDeletePassword((v) => !v)}
                  disabled={deleteBusy}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="p-2 rounded-xl"
                  accessibilityLabel={
                    showDeletePassword ? "Hide password" : "Show password"
                  }
                >
                  <Ionicons
                    name={showDeletePassword ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={theme.iconMuted}
                  />
                </Pressable>
              </View>
              <View className="flex-row gap-3 mt-5">
                <Pressable
                  onPress={closeDeleteModal}
                  disabled={deleteBusy}
                  className="flex-1 py-3.5 rounded-2xl items-center"
                  style={{ backgroundColor: theme.rowBg }}
                >
                  <Text className="font-bold" style={{ color: theme.textSecondary }}>Cancel</Text>
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

      <AppearanceModal visible={appearanceVisible} onClose={() => setAppearanceVisible(false)} />

      <ZoomableImageModal
        visible={profileViewerVisible}
        source={profilePhotoSource}
        onClose={() => setProfileViewerVisible(false)}
      />

      <BottomTabBar active="profile" />
    </View>
  );
}
