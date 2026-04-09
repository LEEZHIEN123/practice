import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import Constants from "expo-constants";
import { auth, db } from "../firebaseConfig";
import { useSafeAreaInsets } from "react-native-safe-area-context";
type ReminderKey = "workout" | "meal" | "water";

type ReminderTime = {
  id: string;
  name?: string;
  hour: number;
  minute: number;
  period: "AM" | "PM";
  enabled: boolean;
};

type ReminderSection = {
  times: ReminderTime[];
  scheduledIds?: string[];
};

type ReminderData = Record<ReminderKey, ReminderSection>;

type OldReminderTime = {
  id?: string;
  time?: string;
  enabled?: boolean;
};

const defaultReminderData: ReminderData = {
  workout: {
    times: [
      { id: "w1", hour: 8, minute: 0, period: "AM", enabled: false },
      { id: "w2", hour: 5, minute: 0, period: "PM", enabled: false },
    ],
    scheduledIds: [],
  },
  meal: {
    times: [{ id: "m1", hour: 12, minute: 30, period: "PM", enabled: false }],
    scheduledIds: [],
  },
  water: {
    times: [
      { id: "wa1", hour: 9, minute: 0, period: "AM", enabled: false },
      { id: "wa2", hour: 11, minute: 0, period: "AM", enabled: false },
      { id: "wa3", hour: 1, minute: 0, period: "PM", enabled: false },
    ],
    scheduledIds: [],
  },
};

const sectionMeta = {
  workout: {
    title: "Workout Reminder",
    subtitle: "Schedule your workout notification",
    body: "Time for your workout.",
  },
  meal: {
    title: "Meal Reminder",
    subtitle: "Schedule your meal notification",
    body: "Time for your meal.",
  },
  water: {
    title: "Water Intake",
    subtitle: "Schedule your water notification",
    body: "Time to drink water.",
  },
};

/** Main icon + circle colors per section (+ button stays app green for all). */
const sectionAccent: Record<ReminderKey, { circleClass: string; icon: string }> = {
  workout: {
    circleClass: "bg-[#edf5f1]",
    icon: "#76C893",
  },
  meal: {
    circleClass: "bg-[#fff4e6]",
    icon: "#c2410c",
  },
  water: {
    circleClass: "bg-[#e0f2fe]",
    icon: "#0284c7",
  },
};

const DEFAULT_REPEAT = [true, false, true, false, true, false, false];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UI_TO_EXPO_WEEKDAY = [2, 3, 4, 5, 6, 7, 1];

function formatRepeatDaysLine(days: boolean[]): string {
  const picked = days
    .map((on, i) => (on ? DAY_NAMES_SHORT[i] : null))
    .filter((x): x is string => x != null);
  if (picked.length === 0) return "No days selected";
  if (picked.length === 7) return "Every day";
  return picked.join(", ");
}

type EditingState = {
  section: ReminderKey;
  timeId: string | null;
  name: string;
  hour: number;
  minute: number;
  period: "AM" | "PM";
  repeatDays: boolean[];
} | null;

const parseOldTimeString = (value?: string) => {
  if (!value) return null;

  const cleaned = value.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
  if (!match) return null;

  return {
    hour: parseInt(match[1], 10),
    minute: parseInt(match[2], 10),
    period: match[3] as "AM" | "PM",
  };
};

const normalizeReminderTime = (
  item: ReminderTime | OldReminderTime,
  fallbackId: string
): ReminderTime => {
  const maybeNew = item as ReminderTime;

  if (
    typeof maybeNew.hour === "number" &&
    typeof maybeNew.minute === "number" &&
    (maybeNew.period === "AM" || maybeNew.period === "PM")
  ) {
    return {
      id: maybeNew.id || fallbackId,
      name: typeof (maybeNew as any).name === "string" ? (maybeNew as any).name : undefined,
      hour: maybeNew.hour,
      minute: maybeNew.minute,
      period: maybeNew.period,
      enabled: typeof maybeNew.enabled === "boolean" ? maybeNew.enabled : true,
    };
  }

  const maybeOld = item as OldReminderTime;
  const parsed = parseOldTimeString(maybeOld.time);

  if (parsed) {
    return {
      id: maybeOld.id || fallbackId,
      name: typeof (maybeOld as any).name === "string" ? (maybeOld as any).name : undefined,
      hour: parsed.hour,
      minute: parsed.minute,
      period: parsed.period,
      enabled: typeof maybeOld.enabled === "boolean" ? maybeOld.enabled : true,
    };
  }

  return {
    id: maybeOld.id || fallbackId,
    name: typeof (maybeOld as any).name === "string" ? (maybeOld as any).name : undefined,
    hour: 9,
    minute: 0,
    period: "AM",
    enabled: typeof maybeOld.enabled === "boolean" ? maybeOld.enabled : true,
  };
};

const normalizeSection = (
  rawSection: any,
  fallbackSection: ReminderSection,
  prefix: string
): ReminderSection => {
  const rawTimes = Array.isArray(rawSection?.times) ? rawSection.times : fallbackSection.times;

  return {
    times: rawTimes.map((item: any, index: number) =>
      normalizeReminderTime(item, `${prefix}-${index}-${Date.now()}`)
    ),
    scheduledIds: Array.isArray(rawSection?.scheduledIds) ? rawSection.scheduledIds : [],
  };
};

const formatTime = (t: ReminderTime) =>
  `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")} ${t.period}`;

const convertTo24Hour = (hour12: number, period: "AM" | "PM") => {
  let hour24 = hour12;
  if (period === "AM") {
    if (hour24 === 12) hour24 = 0;
  } else {
    if (hour24 !== 12) hour24 += 12;
  }
  return hour24;
};

const isExpoGo = Constants.appOwnership === "expo";

async function getNotifications() {
  try {
    const mod = await import("expo-notifications");
    return mod;
  } catch (e) {
    console.log("expo-notifications import failed:", e);
    return null as any;
  }
}

export default function RemindersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<ReminderData>(defaultReminderData);
  const [repeatDays, setRepeatDays] = useState<boolean[]>(DEFAULT_REPEAT);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditingState>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const persistTailRef = useRef(Promise.resolve());
  const expoGoWarnedRef = useRef(false);
  const notifyWarnedRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      await ensureNotificationPermission();

      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;

        const data = snap.data();

        const initialized = data.remindersInitialized === true;

        const loaded: ReminderData = data.reminders
          ? {
              workout: normalizeSection(
                data.reminders.workout,
                defaultReminderData.workout,
                "workout"
              ),
              meal: normalizeSection(
                data.reminders.meal,
                defaultReminderData.meal,
                "meal"
              ),
              water: normalizeSection(
                data.reminders.water,
                defaultReminderData.water,
                "water"
              ),
            }
          : defaultReminderData;

        // If the user never opened Reminders before, force all toggles OFF once.
        if (!initialized) {
          const forceOff = (s: ReminderSection): ReminderSection => ({
            ...s,
            times: s.times.map((t) => ({ ...t, enabled: false })),
          });
          const forced: ReminderData = {
            workout: forceOff(loaded.workout),
            meal: forceOff(loaded.meal),
            water: forceOff(loaded.water),
          };

          await setDoc(
            doc(db, "users", user.uid),
            {
              remindersInitialized: true,
              reminders: forced,
            },
            { merge: true }
          );

          setReminders(forced);
        } else {
          setReminders(loaded);
        }

        if (Array.isArray(data.reminderRepeatDays) && data.reminderRepeatDays.length === 7) {
          setRepeatDays(data.reminderRepeatDays);
        }
      } catch (error) {
        console.log("Failed to load reminders:", error);
      }
    };

    init();
  }, []);

  const ensureNotificationPermission = async (): Promise<boolean> => {
    const Notifications = await getNotifications();
    if (!Notifications) return false;
    try {
      // Ensure reminders show even when the app is open (foreground).
      if (!expoGoWarnedRef.current) {
        expoGoWarnedRef.current = true;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("reminders", {
          name: "Reminders",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;

      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true,
          },
        });
        status = requested.status;
      }

      if (status !== "granted") {
        if (!notifyWarnedRef.current) {
          notifyWarnedRef.current = true;
          Alert.alert(
            "Notifications disabled",
            "Please allow notifications so reminder banner notifications can appear."
          );
        }
        return false;
      }
      return true;
    } catch (error) {
      console.log("Notification permission error:", error);
      return false;
    }
  };

  const openAddModal = (section: ReminderKey) => {
    const nextIdx = (reminders[section]?.times?.length ?? 0) + 1;
    setEditor({
      section,
      timeId: null,
      name: `Reminder ${nextIdx}`,
      hour: 5,
      minute: 23,
      period: "AM",
      repeatDays: [...repeatDays],
    });
  };

  const openEditModal = (section: ReminderKey, item: ReminderTime) => {
    setEditor({
      section,
      timeId: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name : "Reminder",
      hour: item.hour,
      minute: item.minute,
      period: item.period,
      repeatDays: [...repeatDays],
    });
  };

  const cancelScheduledFor = async (data: ReminderData) => {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const allIds = [
      ...(data.workout.scheduledIds || []),
      ...(data.meal.scheduledIds || []),
      ...(data.water.scheduledIds || []),
    ];

    for (const id of allIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (error) {
        console.log("Cancel notification failed:", error);
      }
    }
  };

  const runPersistReminders = async (
    next: ReminderData,
    days: boolean[],
    prev: ReminderData
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setLoading(true);
      const canNotify = await ensureNotificationPermission();

      let workoutIds: string[] = [];
      let mealIds: string[] = [];
      let waterIds: string[] = [];

      if (canNotify) {
        await cancelScheduledFor(prev);
        workoutIds = await scheduleSectionNotifications("workout", next.workout, days);
        mealIds = await scheduleSectionNotifications("meal", next.meal, days);
        waterIds = await scheduleSectionNotifications("water", next.water, days);
      }

      const payload: ReminderData = {
        workout: { ...next.workout, scheduledIds: workoutIds },
        meal: { ...next.meal, scheduledIds: mealIds },
        water: { ...next.water, scheduledIds: waterIds },
      };

      // Firestore doesn't allow `undefined` values (e.g. optional `name`).
      const sanitizeTime = (t: ReminderTime) => {
        const base = {
          id: t.id,
          hour: t.hour,
          minute: t.minute,
          period: t.period,
          enabled: t.enabled,
        } as any;
        if (typeof t.name === "string" && t.name.trim()) base.name = t.name.trim();
        return base;
      };
      const sanitizeSection = (s: ReminderSection) => ({
        times: s.times.map(sanitizeTime),
        scheduledIds: Array.isArray(s.scheduledIds) ? s.scheduledIds : [],
      });
      const firestorePayload = {
        workout: sanitizeSection(payload.workout),
        meal: sanitizeSection(payload.meal),
        water: sanitizeSection(payload.water),
      };

      await setDoc(
        doc(db, "users", user.uid),
        {
          remindersInitialized: true,
          reminders: firestorePayload,
          reminderRepeatDays: days,
        },
        { merge: true }
      );

      setReminders(payload);
      setRepeatDays(days);
    } catch (error) {
      console.log("Persist reminders failed:", error);
      Alert.alert("Error", "Could not update reminders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const enqueuePersist = (next: ReminderData, days: boolean[], prev: ReminderData) => {
    persistTailRef.current = persistTailRef.current
      .then(() => runPersistReminders(next, days, prev))
      .catch(() => {});
  };

  const toggleEnabled = (section: ReminderKey, id: string) => {
    setReminders((prev) => {
      const next: ReminderData = {
        ...prev,
        [section]: {
          ...prev[section],
          times: prev[section].times.map((t) =>
            t.id === id ? { ...t, enabled: !t.enabled } : t
          ),
        },
      };
      enqueuePersist(next, repeatDays, prev);
      return next;
    });
  };

  const removeTime = (section: ReminderKey, id: string) => {
    setReminders((prev) => {
      const next: ReminderData = {
        ...prev,
        [section]: {
          ...prev[section],
          times: prev[section].times.filter((t) => t.id !== id),
        },
      };
      enqueuePersist(next, repeatDays, prev);
      return next;
    });
  };

  const confirmRemoveTime = (section: ReminderKey, id: string) => {
    Alert.alert(
      "Remove this reminder?",
      "This time will be deleted and notifications for it will stop.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeTime(section, id),
        },
      ]
    );
  };

  const saveModalReminder = () => {
    if (!editor) return;

    const newTime: ReminderTime = {
      id: editor.timeId ?? `${editor.section}-${Date.now()}`,
      name: editor.name?.trim() ? editor.name.trim() : undefined,
      hour: editor.hour,
      minute: editor.minute,
      period: editor.period,
      enabled: true,
    };

    const nextRepeat = [...editor.repeatDays];
    setRepeatDays(nextRepeat);

    setReminders((prev) => {
      const section = prev[editor.section];

      const updatedTimes = editor.timeId
        ? section.times.map((t) => (t.id === editor.timeId ? newTime : t))
        : [...section.times, newTime];

      const next: ReminderData = {
        ...prev,
        [editor.section]: {
          ...section,
          times: updatedTimes,
        },
      };
      enqueuePersist(next, nextRepeat, prev);
      return next;
    });

    setEditor(null);
    setShowTimePicker(false);
  };

  const scheduleSectionNotifications = async (
    key: ReminderKey,
    section: ReminderSection,
    days: boolean[]
  ) => {
    const Notifications = await getNotifications();
    if (!Notifications) return [];
    const meta = sectionMeta[key];
    const scheduledIds: string[] = [];

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      if (!days[dayIndex]) continue;

      const weekday = UI_TO_EXPO_WEEKDAY[dayIndex];

      for (const item of section.times) {
        if (!item.enabled) continue;

        const hour24 = convertTo24Hour(item.hour, item.period);

        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: meta.title,
              body: meta.body,
              sound: "default" as any,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour: hour24,
              minute: item.minute,
              channelId: "reminders",
            } as any,
          });
          scheduledIds.push(id);
        } catch (e) {
          console.log("Schedule notification failed:", e);
        }
      }
    }

    return scheduledIds;
  };

  const cards = useMemo(
    () => [
      { key: "workout" as ReminderKey },
      { key: "meal" as ReminderKey },
      { key: "water" as ReminderKey },
    ],
    []
  );

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: 32,
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View className="relative mb-6 h-12 justify-center" pointerEvents="box-none">
            <Pressable
              onPress={() => {
                try {
                  router.back();
                } catch {
                  router.replace("/profile");
                }
              }}
              hitSlop={12}
              className="absolute left-0 top-0 h-14 w-20 justify-center pl-2 z-10"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
                <Ionicons name="arrow-back" size={24} color="#111827" />
              </View>
            </Pressable>

            <Text className="text-center text-xl font-extrabold text-gray-900">
              Reminders
            </Text>
          </View>

          {cards.map(({ key }) => {
            const section = reminders[key];
            const meta = sectionMeta[key];
            const accent = sectionAccent[key];

            return (
              <View
                key={key}
                className="bg-[#f7f7f7] rounded-[30px] px-4 py-4 mb-5 shadow-sm"
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center flex-1 min-w-0">
                    <View
                      className={`w-14 h-14 rounded-full items-center justify-center shrink-0 ${accent.circleClass}`}
                    >
                      {key === "workout" ? (
                        <MaterialCommunityIcons
                          name="dumbbell"
                          size={24}
                          color={accent.icon}
                        />
                      ) : key === "meal" ? (
                        <MaterialCommunityIcons
                          name="silverware-fork-knife"
                          size={24}
                          color={accent.icon}
                        />
                      ) : (
                        <Ionicons
                          name="water-outline"
                          size={24}
                          color={accent.icon}
                        />
                      )}
                    </View>

                    <View className="ml-3 flex-1 min-w-0">
                      <Text className="text-lg font-extrabold text-[#0f172a]">
                        {meta.title}
                      </Text>
                      <Text className="text-xs text-[#667085] mt-0.5" numberOfLines={2}>
                        {meta.subtitle}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => openAddModal(key)}
                    className="w-12 h-12 rounded-full bg-[#edf5f1] items-center justify-center shrink-0 ml-2"
                  >
                    <Ionicons name="add" size={24} color="#76C893" />
                  </Pressable>
                </View>

                <View className="gap-3">
                  {section.times.map((item) => (
                    <View
                      key={item.id}
                      className="bg-[#eef2f1] rounded-[24px] px-4 py-4 flex-row items-center justify-between"
                    >
                      <View className="flex-1 min-w-0 mr-3">
                        <Text className="text-[#0f172a] text-lg font-extrabold">
                          {formatTime(item)}
                        </Text>
                        {typeof item.name === "string" && item.name.trim() ? (
                          <Text className="text-xs text-[#667085] font-semibold mt-1" numberOfLines={1}>
                            {item.name}
                          </Text>
                        ) : null}
                        <Text
                          className="text-xs text-[#52B69A] font-semibold mt-1"
                          numberOfLines={2}
                        >
                          {formatRepeatDaysLine(repeatDays)}
                        </Text>
                      </View>

                      <View className="flex-row items-center shrink-0">
                        <Pressable
                          onPress={() => toggleEnabled(key, item.id)}
                          className="mr-3"
                        >
                          <View
                            className={`w-11 h-[26px] rounded-full px-[2px] justify-center ${
                              item.enabled ? "bg-[#9adcb6]" : "bg-gray-300"
                            }`}
                          >
                            <View
                              className={`w-[22px] h-[22px] rounded-full items-center justify-center ${
                                item.enabled
                                  ? "self-end bg-[#76C893]"
                                  : "self-start bg-gray-400"
                              }`}
                            >
                              {item.enabled && (
                                <Ionicons name="checkmark" size={12} color="white" />
                              )}
                            </View>
                          </View>
                        </Pressable>

                        <Pressable
                          onPress={() => openEditModal(key, item)}
                          className="mr-3"
                        >
                          <Feather name="edit-2" size={20} color="#374151" />
                        </Pressable>

                        <Pressable onPress={() => confirmRemoveTime(key, item.id)}>
                          <Ionicons name="trash-outline" size={21} color="#dc2626" />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          <Text className="text-center text-[11px] font-bold text-[#98a2b3] tracking-[1.5px] px-6 mt-2 leading-5">
            CONFIGURE INDIVIDUAL REMINDERS TO KEEP YOUR ROUTINE BALANCED. TAP THE + ICON TO ADD NEW ALERT TIMES.
          </Text>
        </View>
      </ScrollView>

     

      <Modal visible={!!editor} transparent animationType="fade">
        <View className="flex-1 bg-black/35 justify-end">
          <View className="bg-[#f7f7f7] rounded-t-[38px] px-6 pt-8 pb-10">
            <Pressable
              onPress={() => {
                setEditor(null);
                setShowTimePicker(false);
              }}
              hitSlop={12}
              className="absolute right-5 top-6 w-12 h-12 rounded-full bg-white items-center justify-center border border-gray-200 z-20"
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>

            <Text className="text-center text-[26px] font-extrabold text-[#0f172a]">
              Set New Reminder
            </Text>

            <Text className="text-center text-[17px] text-[#667085] mt-2 mb-8">
              {editor ? sectionMeta[editor.section].subtitle : ""}
            </Text>

           <View className="border border-[#b7ead1] rounded-[26px] px-4 py-6 mb-6">
              <Text className="text-[18px] font-extrabold text-[#0f172a] mb-3">NAME</Text>
              <View className="bg-white rounded-2xl border border-gray-200 px-4 py-3 mb-6">
                <TextInput
                  value={editor?.name ?? ""}
                  onChangeText={(t: string) => setEditor((prev) => (prev ? { ...prev, name: t } : prev))}
                  placeholder="Reminder name"
                  placeholderTextColor="#9ca3af"
                  className="text-[18px] font-semibold text-[#0f172a]"
                />
              </View>

  <View className="bg-[#eef2f1] rounded-xl items-center justify-center py-3">
    {Platform.OS === "ios" ? (
      <DateTimePicker
        mode="time"
        display="spinner"
        value={(() => {
          const h12 = editor?.hour ?? 5;
          const m = editor?.minute ?? 0;
          const p = editor?.period ?? "AM";
          const h24 = p === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
          const d = new Date();
          d.setHours(h24, m, 0, 0);
          return d;
        })()}
        onChange={(_, date) => {
          if (!date) return;
          const h24 = date.getHours();
          const minute = date.getMinutes();
          const period = h24 >= 12 ? "PM" : "AM";
          const h12 = ((h24 + 11) % 12) + 1;
          setEditor((prev) =>
            prev ? { ...prev, hour: h12, minute, period: period as "AM" | "PM" } : prev
          );
        }}
        style={{ height: 140, width: "100%" }}
        textColor="#0f172a"
      />
    ) : (
      <>
        <Pressable
          onPress={() => setShowTimePicker(true)}
          className="bg-white rounded-2xl px-5 py-4 w-full active:opacity-90"
        >
          <Text className="text-[26px] font-extrabold text-[#0f172a] text-center">
            {String(editor?.hour ?? 5).padStart(2, "0")}:{String(editor?.minute ?? 0).padStart(2, "0")}{" "}
            {editor?.period ?? "AM"}
          </Text>
          <Text className="text-xs text-[#667085] text-center mt-1 font-semibold">
            Tap to change time
          </Text>
        </Pressable>

        {showTimePicker ? (
          <DateTimePicker
            mode="time"
            display="spinner"
            value={(() => {
              const h12 = editor?.hour ?? 5;
              const m = editor?.minute ?? 0;
              const p = editor?.period ?? "AM";
              const h24 = p === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
              const d = new Date();
              d.setHours(h24, m, 0, 0);
              return d;
            })()}
            onChange={(event, date) => {
              // Android: picker is a dialog; must handle dismissal.
              if (event?.type === "dismissed") {
                setShowTimePicker(false);
                return;
              }
              if (!date) return;
              const h24 = date.getHours();
              const minute = date.getMinutes();
              const period = h24 >= 12 ? "PM" : "AM";
              const h12 = ((h24 + 11) % 12) + 1;
              setEditor((prev) =>
                prev ? { ...prev, hour: h12, minute, period: period as "AM" | "PM" } : prev
              );
              setShowTimePicker(false);
            }}
          />
        ) : null}
      </>
    )}
  </View>
</View>

            <Text className="text-[18px] font-extrabold text-[#0f172a] mb-5">
              REPEAT
            </Text>

            <View className="flex-row justify-between mb-10">
              {(editor?.repeatDays || DEFAULT_REPEAT).map((active, index) => (
                <Pressable
                  key={index}
                  onPress={() =>
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            repeatDays: prev.repeatDays.map((d, i) =>
                              i === index ? !d : d
                            ),
                          }
                        : prev
                    )
                  }
                  className={`w-[50px] h-[50px] rounded-full items-center justify-center border ${
                    active
                      ? "bg-[#76C893] border-[#76C893]"
                      : "bg-transparent border-gray-300"
                  }`}
                >
                  <Text
                    className={`text-[18px] font-semibold ${
                      active ? "text-white" : "text-[#475467]"
                    }`}
                  >
                    {DAY_LABELS[index]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={saveModalReminder}
              className="bg-[#76C893] rounded-[24px] py-5 items-center shadow-sm"
            >
              <Text className="text-white text-[20px] font-extrabold">
                Save Reminder
              </Text>
            </Pressable>

            <Pressable onPress={() => setEditor(null)} className="items-center mt-5">
              <Text className="text-[#98a2b3] text-[17px] font-semibold">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}