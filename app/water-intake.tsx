import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { auth, db } from "../firebaseConfig";

const dateKeyYMD = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const formatLongDate = (d: Date) => {
  try {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toDateString();
  }
};

type WaterLogRow = { id: string; amountMl: number; createdAt: Date; dayKey: string };

export default function WaterIntakeScreen() {
  const router = useRouter();
  const [mlText, setMlText] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dayTotalMl, setDayTotalMl] = useState(0);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [recentLogs, setRecentLogs] = useState<WaterLogRow[]>([]);
  const [editingLog, setEditingLog] = useState<WaterLogRow | null>(null);
  const [editMlText, setEditMlText] = useState("");

  const isSelectedToday = useMemo(
    () => dateKeyYMD(selectedDate) === dateKeyYMD(new Date()),
    [selectedDate]
  );

  const selectedDayLogsCount = useMemo(() => {
    const k = dateKeyYMD(selectedDate);
    return recentLogs.reduce((n, r) => (r.dayKey === k ? n + 1 : n), 0);
  }, [recentLogs, selectedDate]);

  const selectedDayLogsTotalMl = useMemo(() => {
    const k = dateKeyYMD(selectedDate);
    return recentLogs.reduce((s, r) => (r.dayKey === k ? s + r.amountMl : s), 0);
  }, [recentLogs, selectedDate]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const k = dateKeyYMD(selectedDate);
    const ref = doc(db, "users", user.uid, "dailyStats", k);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const ml = typeof data?.waterMl === "number" && Number.isFinite(data.waterMl) ? data.waterMl : 0;
        setDayTotalMl(Math.round(ml));
        const ts = data?.waterRecordedAt;
        if (ts && typeof ts.toDate === "function") setRecordedAt(ts.toDate());
        else setRecordedAt(null);
      },
      () => {
        setDayTotalMl(0);
        setRecordedAt(null);
      }
    );
    return () => unsub();
  }, [selectedDate]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "waterLogs"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: WaterLogRow[] = [];
        for (const d of snap.docs) {
          const data = d.data() as any;
          const amountMl =
            typeof data?.amountMl === "number" && Number.isFinite(data.amountMl) ? Math.round(data.amountMl) : 0;
          const createdAt = data?.createdAt?.toDate?.() instanceof Date ? data.createdAt.toDate() : null;
          if (!createdAt) continue;
          const logDay = data?.logDate?.toDate?.() instanceof Date ? data.logDate.toDate() : null;
          const dayKey = logDay ? dateKeyYMD(logDay) : dateKeyYMD(createdAt);
          rows.push({ id: d.id, amountMl, createdAt, dayKey });
        }
        setRecentLogs(rows);
      },
      () => setRecentLogs([])
    );
    return () => unsub();
  }, []);

  const save = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const parsed = parseInt(mlText.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 20000) {
      Alert.alert("Invalid amount", "Enter milliliters between 1 and 20,000.");
      return;
    }
    try {
      setSaving(true);
      const day = startOfDay(selectedDate);
      const key = dateKeyYMD(selectedDate);

      await addDoc(collection(db, "users", user.uid, "waterLogs"), {
        amountMl: parsed,
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(day),
      });

      await setDoc(
        doc(db, "users", user.uid, "dailyStats", key),
        {
          waterMl: increment(parsed),
          waterRecordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMlText("");
    } catch (e) {
      console.log("Failed to save water:", e);
      Alert.alert("Error", "Could not save water intake.");
    } finally {
      setSaving(false);
    }
  };

  const add = (n: number) => {
    const cur = parseInt(mlText.replace(/[^\d]/g, ""), 10);
    const base = Number.isFinite(cur) ? cur : 0;
    setMlText(String(Math.min(20000, base + n)));
  };

  const beginEditLog = (r: WaterLogRow) => {
    setEditingLog(r);
    setEditMlText(String(r.amountMl));
  };

  const saveEditLog = async () => {
    const user = auth.currentUser;
    if (!user || !editingLog) return;
    const parsed = parseInt(editMlText.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 20000) {
      Alert.alert("Invalid amount", "Enter milliliters between 1 and 20,000.");
      return;
    }
    try {
      setSaving(true);
      const nextMl = Math.round(parsed);
      const delta = nextMl - editingLog.amountMl;
      await updateDoc(doc(db, "users", user.uid, "waterLogs", editingLog.id), {
        amountMl: nextMl,
      });
      if (delta !== 0) {
        await updateDoc(doc(db, "users", user.uid, "dailyStats", editingLog.dayKey), {
          waterMl: increment(delta),
          waterRecordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setEditingLog(null);
      setEditMlText("");
    } catch (e) {
      console.log("Edit water log failed:", e);
      Alert.alert("Error", "Could not update this water log.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteLog = (r: WaterLogRow) => {
    Alert.alert("Delete this log?", "This will remove the entry from your water history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const user = auth.currentUser;
          if (!user) return;
          try {
            setSaving(true);
            await deleteDoc(doc(db, "users", user.uid, "waterLogs", r.id));
            await updateDoc(doc(db, "users", user.uid, "dailyStats", r.dayKey), {
              waterMl: increment(-r.amountMl),
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            console.log("Delete water log failed:", e);
            Alert.alert("Error", "Could not delete this water log.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const groupedWater = useMemo(() => {
    const map = new Map<string, WaterLogRow[]>();
    for (const r of recentLogs) {
      const list = map.get(r.dayKey);
      if (list) list.push(r);
      else map.set(r.dayKey, [r]);
    }
    const keys = [...map.keys()]
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .sort((a, b) => b.localeCompare(a));
    return keys.map((dateKey) => {
      const entries = [...(map.get(dateKey) ?? [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const total = entries.reduce((s, e) => s + e.amountMl, 0);
      const parts = dateKey.split("-");
      const yy = parseInt(parts[0] ?? "0", 10);
      const mm = parseInt(parts[1] ?? "1", 10);
      const dd = parseInt(parts[2] ?? "1", 10);
      const dayDate = new Date(yy, mm - 1, dd);
      return { dateKey, entries, total, dayDate };
    });
  }, [recentLogs]);

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} className="px-6 pt-14">
        <View className="flex-row items-center justify-between mb-6">
          <Pressable onPress={() => router.back()} className="w-12 h-12 rounded-full bg-white items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-xl font-extrabold text-gray-900">Water Intake</Text>
          <View className="w-12 h-12" />
        </View>

        <View className="bg-white rounded-3xl p-5 border border-gray-100">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">
                {isSelectedToday ? "TODAY" : "SELECTED DAY"}
              </Text>
              <Text className="text-lg font-extrabold text-gray-900 mt-2">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <Text className="text-sm text-gray-600 mt-2 font-extrabold">
                Total: {(selectedDayLogsCount === 0 ? 0 : selectedDayLogsTotalMl).toLocaleString()} ml
              </Text>
              {recordedAt && isSelectedToday ? (
                <Text className="text-xs text-gray-500 mt-1">Last updated: {recordedAt.toLocaleString()}</Text>
              ) : null}
              {selectedDayLogsCount === 0 ? (
                <Text className="text-sm text-amber-700 font-semibold mt-2">
                  {isSelectedToday ? "You haven't recorded water today." : "No water logged for this day yet."}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="w-11 h-11 rounded-full bg-[#eaf7f0] border border-[#b7ead1] items-center justify-center"
            >
              <Ionicons name="calendar-outline" size={22} color="#52B69A" />
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              maximumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS !== "ios") setShowDatePicker(false);
                if (event.type === "dismissed") return;
                if (date) setSelectedDate(date);
              }}
            />
          )}

          <Text className="text-gray-900 font-extrabold mt-6 mb-2">AMOUNT TO ADD (ml)</Text>
          <TextInput
            value={mlText}
            onChangeText={(t) => setMlText(t.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
            className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 text-lg font-extrabold"
            placeholder="0"
          />

          <View className="flex-row gap-2 mt-4">
            <Pressable onPress={() => add(250)} className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center">
              <Text className="font-extrabold text-[#52B69A]">+250 ml</Text>
            </Pressable>
            <Pressable onPress={() => add(500)} className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center">
              <Text className="font-extrabold text-[#52B69A]">+500 ml</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => add(1000)} className="mt-2 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center">
            <Text className="font-extrabold text-[#52B69A]">+1000 ml</Text>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={saving}
            className={`mt-6 py-4 rounded-2xl bg-[#76C893] items-center ${saving ? "opacity-60" : ""}`}
          >
            <Text className="text-white font-extrabold text-base">{saving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </View>

        <View className="mt-6 bg-white rounded-3xl p-5 pb-6 border border-gray-100">
          <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">RECENT WATER INTAKE</Text>
          <Text className="text-xs text-gray-500 mt-1">Grouped by day: entries, then total for that day.</Text>
          <View className="mt-4 gap-4">
            {groupedWater.length === 0 ? (
              <Text className="text-gray-500 text-sm">No water logs yet.</Text>
            ) : (
              groupedWater.map((g) => (
                <View key={g.dateKey} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <Text className="text-base font-extrabold text-gray-900">{formatLongDate(g.dayDate)}</Text>
                  <View className="mt-2 gap-2">
                    {g.entries.map((r) => (
                      <View
                        key={r.id}
                        className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200"
                      >
                        <Text className="text-sm text-gray-600">{r.createdAt.toLocaleTimeString()}</Text>
                        <View className="flex-row items-center">
                          <Text className="text-base font-extrabold text-gray-900">
                            +{r.amountMl.toLocaleString()} ml
                          </Text>
                          <Pressable
                            onPress={() => beginEditLog(r)}
                            disabled={saving}
                            hitSlop={10}
                            className="ml-3 w-9 h-9 rounded-full bg-white border border-gray-200 items-center justify-center"
                          >
                            <Ionicons name="create-outline" size={18} color="#111827" />
                          </Pressable>
                          <Pressable
                            onPress={() => confirmDeleteLog(r)}
                            disabled={saving}
                            hitSlop={10}
                            className="ml-2 w-9 h-9 rounded-full bg-white border border-gray-200 items-center justify-center"
                          >
                            <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text className="text-sm font-extrabold text-[#52B69A] mt-2">
                    Total: {g.total.toLocaleString()} ml
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!editingLog} transparent animationType="fade" onRequestClose={() => setEditingLog(null)}>
        <Pressable
          className="flex-1 bg-black/40 justify-center px-5"
          onPress={() => setEditingLog(null)}
        >
          <Pressable
            className="bg-white rounded-3xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-extrabold text-gray-900">Edit water intake</Text>
            <Text className="text-sm text-gray-500 mt-2">
              Update the amount for this entry (ml).
            </Text>

            <View className="mt-5">
              <TextInput
                value={editMlText}
                onChangeText={setEditMlText}
                keyboardType="numeric"
                placeholder="e.g. 500"
                placeholderTextColor="#9ca3af"
                className="bg-[#fafafa] border border-gray-200 rounded-2xl px-4 py-3 text-base text-gray-900"
              />
            </View>

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() => setEditingLog(null)}
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200"
              >
                <Text className="font-extrabold text-gray-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEditLog}
                disabled={saving}
                className={`flex-1 py-3.5 rounded-2xl bg-[#76C893] items-center active:opacity-90 ${
                  saving ? "opacity-60" : ""
                }`}
              >
                <Text className="font-extrabold text-white">{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
