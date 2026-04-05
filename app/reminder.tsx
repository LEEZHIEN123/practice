import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Notifications from "expo-notifications";
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
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig";
type ReminderKey = "workout" | "meal" | "water";

type ReminderTime = {
  id: string;
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
      { id: "w1", hour: 8, minute: 0, period: "AM", enabled: true },
      { id: "w2", hour: 5, minute: 0, period: "PM", enabled: true },
    ],
    scheduledIds: [],
  },
  meal: {
    times: [{ id: "m1", hour: 12, minute: 30, period: "PM", enabled: true }],
    scheduledIds: [],
  },
  water: {
    times: [
      { id: "wa1", hour: 9, minute: 0, period: "AM", enabled: true },
      { id: "wa2", hour: 11, minute: 0, period: "AM", enabled: true },
      { id: "wa3", hour: 1, minute: 0, period: "PM", enabled: true },
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
      hour: parsed.hour,
      minute: parsed.minute,
      period: parsed.period,
      enabled: typeof maybeOld.enabled === "boolean" ? maybeOld.enabled : true,
    };
  }

  return {
    id: maybeOld.id || fallbackId,
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

export default function RemindersScreen() {
  const router = useRouter();
  const [reminders, setReminders] = useState<ReminderData>(defaultReminderData);
  const [repeatDays, setRepeatDays] = useState<boolean[]>(DEFAULT_REPEAT);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditingState>(null);
  const persistTailRef = useRef(Promise.resolve());

  useEffect(() => {
    const init = async () => {
      await ensureNotificationPermission();

      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;

        const data = snap.data();

        if (data.reminders) {
          setReminders({
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
          });
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

  const ensureNotificationPermission = async () => {
    try {
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
        Alert.alert(
          "Notifications disabled",
          "Please allow notifications so reminder banner notifications can appear."
        );
      }
    } catch (error) {
      console.log("Notification permission error:", error);
    }
  };

  const openAddModal = (section: ReminderKey) => {
    setEditor({
      section,
      timeId: null,
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
      hour: item.hour,
      minute: item.minute,
      period: item.period,
      repeatDays: [...repeatDays],
    });
  };

  const cancelScheduledFor = async (data: ReminderData) => {
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
      await cancelScheduledFor(prev);

      const workoutIds = await scheduleSectionNotifications(
        "workout",
        next.workout,
        days
      );
      const mealIds = await scheduleSectionNotifications("meal", next.meal, days);
      const waterIds = await scheduleSectionNotifications("water", next.water, days);

      const payload: ReminderData = {
        workout: { ...next.workout, scheduledIds: workoutIds },
        meal: { ...next.meal, scheduledIds: mealIds },
        water: { ...next.water, scheduledIds: waterIds },
      };

      await setDoc(
        doc(db, "users", user.uid),
        {
          reminders: payload,
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
  };

  const scheduleSectionNotifications = async (
    key: ReminderKey,
    section: ReminderSection,
    days: boolean[]
  ) => {
    const meta = sectionMeta[key];
    const scheduledIds: string[] = [];

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      if (!days[dayIndex]) continue;

      const weekday = UI_TO_EXPO_WEEKDAY[dayIndex];

      for (const item of section.times) {
        if (!item.enabled) continue;

        const hour24 = convertTo24Hour(item.hour, item.period);

        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: meta.title,
            body: meta.body,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: hour24,
            minute: item.minute,
            channelId: "reminders",
          } as Notifications.NotificationTriggerInput,
        });

        scheduledIds.push(id);
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
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-14">
          <View className="relative mb-8 h-12 justify-center">
            <Pressable
              onPress={() => router.push("/profile")}
              hitSlop={12}
              className="absolute left-0 top-0 h-12 w-16 justify-center"
            >
              <Ionicons name="chevron-back" size={34} color="#76C893" />
            </Pressable>

            <Text className="text-center text-2xl font-extrabold text-[#0f172a]">
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
            <Text className="text-center text-[26px] font-extrabold text-[#0f172a]">
              Set New Reminder
            </Text>

            <Text className="text-center text-[17px] text-[#667085] mt-2 mb-8">
              {editor ? sectionMeta[editor.section].subtitle : ""}
            </Text>

           <View className="border border-[#b7ead1] rounded-[26px] px-4 py-6 mb-8">
  <View className="bg-[#eef2f1] rounded-xl flex-row items-center justify-center py-3">
    <View className="flex-1">
      <Picker
        selectedValue={editor?.hour ?? 5}
        onValueChange={(value) =>
          setEditor((prev) => (prev ? { ...prev, hour: value } : prev))
        }
        style={{
          height: 80,
          fontSize: 40,
          color: "#0f172a",
        }}
        itemStyle={{ fontSize: 40, fontWeight: "800", color: "#0f172a" }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
          <Picker.Item
            key={hour}
            label={String(hour).padStart(2, "0")}
            value={hour}
          />
        ))}
      </Picker>
    </View>

    <Text className="text-[40px] font-extrabold text-[#0f172a] mx-2">:</Text>

    <View className="flex-1">
      <Picker
        selectedValue={editor?.minute ?? 23}
        onValueChange={(value) =>
          setEditor((prev) => (prev ? { ...prev, minute: value } : prev))
        }
        style={{
          height: 80,
          fontSize: 40,
          color: "#0f172a",
        }}
        itemStyle={{ fontSize: 40, fontWeight: "800", color: "#0f172a" }}
      >
        {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
          <Picker.Item
            key={minute}
            label={String(minute).padStart(2, "0")}
            value={minute}
          />
        ))}
      </Picker>
    </View>

    <View className="flex-1">
      <Picker
        selectedValue={editor?.period ?? "AM"}
        onValueChange={(value) =>
          setEditor((prev) =>
            prev ? { ...prev, period: value as "AM" | "PM" } : prev
          )
        }
        style={{
          height: 80,
          fontSize: 40,
          color: "#0f172a",
        }}
        itemStyle={{ fontSize: 40, fontWeight: "800", color: "#0f172a" }}
      >
        <Picker.Item label="AM" value="AM" />
        <Picker.Item label="PM" value="PM" />
      </Picker>
    </View>
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
              className="bg-[#76C893] rounded-[24px] py-6 items-center shadow-sm"
            >
              <Text className="text-white text-[22px] font-extrabold">
                Save Reminder
              </Text>
            </Pressable>

            <Pressable onPress={() => setEditor(null)} className="items-center mt-6">
              <Text className="text-[#98a2b3] text-[19px] font-semibold">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}