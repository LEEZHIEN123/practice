import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { Timestamp, addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type ActiveWorkoutPlan = {
  duration: "week" | "biweekly" | "monthly";
  createdAt: string;
  bmi: number | null;
  goal: "gain" | "maintain" | "lose" | null;
  suggestedTypes: string[];
  schedule: { day: number; type: string; workout: string }[];
};

function fmtHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function fmtDurationWords(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  if (mm <= 0) return `${ss} sec`;
  if (ss <= 0) return `${mm} min`;
  return `${mm} min ${ss} sec`;
}

function fmtTimeOnly(d: Date) {
  try {
    return d.toLocaleTimeString();
  } catch {
    return d.toTimeString();
  }
}

function fmtDateTime(d: Date) {
  try {
    return d.toLocaleString();
  } catch {
    return d.toString();
  }
}

function typeIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("yoga")) return "leaf-outline";
  if (t.includes("hiit")) return "flash-outline";
  if (t.includes("cardio")) return "heart-outline";
  return "barbell-outline";
}

function typeColor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("yoga")) return "#059669";
  if (t.includes("hiit")) return "#f97316";
  if (t.includes("cardio")) return "#ef4444";
  return "#1e3a8a";
}

export default function DayWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const params = useLocalSearchParams<{ day?: string }>();
  const dayNum = useMemo(() => {
    const n = Number(params.day);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }, [params.day]);

  const [plan, setPlan] = useState<ActiveWorkoutPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pauseMenuVisible, setPauseMenuVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"restart" | "complete" | null>(null);
  const [backConfirmVisible, setBackConfirmVisible] = useState(false);
  const [startChoiceVisible, setStartChoiceVisible] = useState(false);
  const [timerPickerVisible, setTimerPickerVisible] = useState(false);
  const [timerMinText, setTimerMinText] = useState("10");
  const [timerSecText, setTimerSecText] = useState("00");
  const [, setTargetSeconds] = useState<number | null>(null);
  const [, setMode] = useState<"countup" | "countdown">("countup");
  const modeRef = useRef<"countup" | "countdown">("countup");
  const targetSecondsRef = useRef<number | null>(null);
  const [dayRecords, setDayRecords] = useState<
    { startedAt: Date; endedAt: Date; elapsedSeconds: number }[]
  >([]);
  const [canResume, setCanResume] = useState(false);
  const autoCompleteFiredRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const sessionStartedAtMsRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const tickIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const row = useMemo(() => {
    const r = plan?.schedule?.find((x) => x.day === dayNum) ?? null;
    return r;
  }, [dayNum, plan]);

  const MIN_RECORD_SECONDS = 5;

  const planCreatedAtMs = useMemo(() => {
    const v: any = plan?.createdAt ?? null;
    if (!v) return null;
    if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
    if (typeof v === "string") {
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof v?.toMillis === "function") return Math.floor(v.toMillis());
    return null;
  }, [plan?.createdAt]);

  useEffect(() => {
    if (!uid || planCreatedAtMs == null) return;
    const q = query(
      collection(db, "users", uid, "workoutSessions"),
      orderBy("startedAt", "desc"),
      // When a new "running" session is created, it can push older completed
      // sessions out of a small limit. Use a larger window for stable records.
      limit(300)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: { startedAt: Date; endedAt: Date; elapsedSeconds: number }[] = [];
        for (const d of snap.docs) {
          const data = d.data() as any;
          if (data?.status !== "completed") continue;
          const planMsRaw = data?.planCreatedAt ?? null;
          const planMs =
            typeof planMsRaw === "number"
              ? Math.floor(planMsRaw)
              : typeof planMsRaw === "string"
                ? (() => {
                    const ms = Date.parse(planMsRaw);
                    return Number.isFinite(ms) ? ms : null;
                  })()
              : typeof planMsRaw?.toMillis === "function"
                ? Math.floor(planMsRaw.toMillis())
                : null;
          if (planMs == null || planMs !== planCreatedAtMs) continue;
          if (Number(data?.day) !== dayNum) continue;
          const startedAt = data?.startedAt?.toDate?.() instanceof Date ? data.startedAt.toDate() : null;
          const endedAt = data?.endedAt?.toDate?.() instanceof Date ? data.endedAt.toDate() : null;
          if (!startedAt || !endedAt) continue;
          const elapsedSeconds =
            typeof data?.elapsedSeconds === "number" && Number.isFinite(data.elapsedSeconds)
              ? Math.max(0, Math.floor(data.elapsedSeconds))
              : 0;
          if (elapsedSeconds < MIN_RECORD_SECONDS) continue;
          rows.push({ startedAt, endedAt, elapsedSeconds });
        }
        setDayRecords(rows.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime()));
      },
      () => setDayRecords([])
    );
    return () => unsub();
  }, [dayNum, planCreatedAtMs, uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        setPlan((data?.activeWorkoutPlan as ActiveWorkoutPlan) ?? null);
      },
      () => setPlan(null)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth as any, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const stopTicker = () => {
    if (tickIdRef.current) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
  };

  const startTicker = () => {
    stopTicker();
    tickIdRef.current = setInterval(() => {
      if (!startedAtRef.current) return;
      const now = Date.now();
      const delta = Math.floor((now - startedAtRef.current) / 1000);
      const nextElapsed = baseElapsedRef.current + delta;
      const m = modeRef.current;
      const tgt = targetSecondsRef.current;
      if (m === "countdown" && tgt != null) {
        const remain = Math.max(0, tgt - nextElapsed);
        setElapsed(remain);
        if (remain <= 0) {
          if (!autoCompleteFiredRef.current) {
            autoCompleteFiredRef.current = true;
            void completeWorkout().finally(() => {
              Alert.alert("Congratulations!", "Workout completed.");
              autoCompleteFiredRef.current = false;
            });
          }
        }
        return;
      }
      setElapsed(nextElapsed);
    }, 250);
  };

  useEffect(() => {
    return () => stopTicker();
  }, []);

  const clearCountdown = () => {
    if (countdownIdRef.current) {
      clearInterval(countdownIdRef.current);
      countdownIdRef.current = null;
    }
    setCountdown(null);
  };

  useEffect(() => {
    return () => clearCountdown();
  }, []);

  const startWorkoutInternal = async () => {
    const user = auth.currentUser;
    if (!user || !row) return;

    if (!sessionStartedAtMsRef.current) sessionStartedAtMsRef.current = Date.now();

    // Create a new session doc once.
    if (!sessionId) {
      const startedAtClient = new Date(sessionStartedAtMsRef.current);
      const ref = await addDoc(collection(db, "users", user.uid, "workoutSessions"), {
        day: row.day,
        type: row.type,
        workout: row.workout,
        duration: plan?.duration ?? null,
        goal: plan?.goal ?? null,
        planCreatedAt: plan?.createdAt ?? null,
        startedAt: Timestamp.fromDate(startedAtClient),
        startedAtClientMs: sessionStartedAtMsRef.current,
        elapsedSeconds: 0,
        status: "running",
        updatedAt: serverTimestamp(),
      });
      setSessionId(ref.id);
    } else {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "running",
        updatedAt: serverTimestamp(),
      });
    }

    startedAtRef.current = Date.now();
    setRunning(true);
    startTicker();
  };

  const beginStart = () => {
    if (running) return;
    // if timer already started, treat as start
    setStartChoiceVisible(true);
  };

  const parseTimerSeconds = () => {
    const mm = parseInt(timerMinText.replace(/[^\d]/g, ""), 10);
    const ss = parseInt(timerSecText.replace(/[^\d]/g, ""), 10);
    const m = Number.isFinite(mm) ? Math.max(0, mm) : 0;
    // Allow > 59 seconds by carrying into minutes.
    const sRaw = Number.isFinite(ss) ? Math.max(0, ss) : 0;
    const s = sRaw % 60;
    const carryMin = Math.floor(sRaw / 60);
    return (m + carryMin) * 60 + s;
  };

  const timerTotalSeconds = useMemo(() => parseTimerSeconds(), [timerMinText, timerSecText]);

  const setTimerSecondsNormalized = (rawSecondsText: string) => {
    const only = rawSecondsText.replace(/[^\d]/g, "").slice(0, 3);
    const sec = parseInt(only || "0", 10);
    const currentMin = parseInt(timerMinText.replace(/[^\d]/g, "") || "0", 10);
    const baseMin = Number.isFinite(currentMin) ? Math.max(0, currentMin) : 0;
    const s = Number.isFinite(sec) ? Math.max(0, sec) : 0;
    const carry = Math.floor(s / 60);
    const newMin = baseMin + carry;
    const newSec = s % 60;
    setTimerMinText(String(Math.min(999, newMin)));
    setTimerSecText(String(newSec).padStart(2, "0"));
  };

  const startCountdownWithPicker = () => {
    const total = parseTimerSeconds();
    if (total <= 0) {
      Alert.alert("Invalid timer", "Please set a timer greater than 0 seconds.");
      return;
    }
    if (total < MIN_RECORD_SECONDS) {
      Alert.alert("Timer too short", `Please set at least ${MIN_RECORD_SECONDS} seconds.`);
      return;
    }
    setMode("countdown");
    setTargetSeconds(total);
    modeRef.current = "countdown";
    targetSecondsRef.current = total;
    baseElapsedRef.current = 0;
    startedAtRef.current = null;
    setElapsed(total);
    setTimerPickerVisible(false);
    setTimeout(() => void startWithCountdown(), 0);
  };

  const startWithCountdown = async () => {
    if (running || countdown != null) return;
    // 3..2..1 overlay, then start timer.
    setCountdown(3);
    if (countdownIdRef.current) clearInterval(countdownIdRef.current);
    countdownIdRef.current = setInterval(() => {
      setCountdown((cur) => {
        if (cur == null) return null;
        if (cur <= 1) {
          // finish
          if (countdownIdRef.current) {
            clearInterval(countdownIdRef.current);
            countdownIdRef.current = null;
          }
          // kick off workout start after countdown disappears
          setTimeout(() => {
            void startWorkoutInternal();
          }, 50);
          return null;
        }
        return cur - 1;
      });
    }, 900);
  };

  const pauseWorkout = async () => {
    const user = auth.currentUser;
    if (!user) return;
    stopTicker();
    if (startedAtRef.current) {
      const now = Date.now();
      const delta = Math.floor((now - startedAtRef.current) / 1000);
      baseElapsedRef.current = baseElapsedRef.current + delta;
      const m = modeRef.current;
      const tgt = targetSecondsRef.current;
      if (m === "countdown" && tgt != null) {
        const remain = Math.max(0, tgt - baseElapsedRef.current);
        setElapsed(remain);
      } else {
        setElapsed(baseElapsedRef.current);
      }
      startedAtRef.current = null;
    }
    setRunning(false);
    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        elapsedSeconds: baseElapsedRef.current,
        status: "paused",
        updatedAt: serverTimestamp(),
      });
    }
  };

  const stopWorkout = async () => {
    const user = auth.currentUser;
    if (!user) return;
    await pauseWorkout();
    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "stopped",
        endedAt: serverTimestamp(),
        elapsedSeconds: baseElapsedRef.current,
        updatedAt: serverTimestamp(),
      });
    }
    setCanResume(true);
  };

  const completeWorkout = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const endedAtClient = new Date();
    await pauseWorkout();

    const elapsedSec = Math.max(0, Math.floor(baseElapsedRef.current));
    if (elapsedSec < MIN_RECORD_SECONDS) {
      // Too short: don't record as a completed workout record.
      if (sessionId) {
        try {
          await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
            status: "stopped",
            endedAt: Timestamp.fromDate(endedAtClient),
            endedAtClientMs: endedAtClient.getTime(),
            elapsedSeconds: elapsedSec,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.log("Failed to stop short workout:", e);
        }
      }
      Alert.alert("Workout not saved", `Workouts under ${MIN_RECORD_SECONDS} seconds won't be saved as a record.`);
      // Reset local timer for next start
      baseElapsedRef.current = 0;
      startedAtRef.current = null;
      sessionStartedAtMsRef.current = null;
      setElapsed(0);
      setRunning(false);
      stopTicker();
      setMode("countup");
      setTargetSeconds(null);
      modeRef.current = "countup";
      targetSecondsRef.current = null;
      setCanResume(false);
      return;
    }

    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "completed",
        endedAt: Timestamp.fromDate(endedAtClient),
        endedAtClientMs: endedAtClient.getTime(),
        elapsedSeconds: elapsedSec,
        updatedAt: serverTimestamp(),
      });
    }

    // Update workout record UI immediately (serverTimestamp fields may be pending briefly).
    const startedMs =
      typeof sessionStartedAtMsRef.current === "number" && Number.isFinite(sessionStartedAtMsRef.current)
        ? sessionStartedAtMsRef.current
        : endedAtClient.getTime() - Math.max(0, Math.floor(baseElapsedRef.current)) * 1000;
    const startedAtClient = new Date(startedMs);
    setDayRecords((prev) => [
      { startedAt: startedAtClient, endedAt: endedAtClient, elapsedSeconds: elapsedSec },
      ...prev,
    ]);

    // Mark completion (Workout Plan will advance to next day on the next calendar day).
    try {
      await updateDoc(doc(db, "users", user.uid), {
        activePlanLastCompletedDay: Math.max(1, Math.floor(dayNum)),
        activePlanLastCompletedAt: serverTimestamp(),
      } as any);
    } catch (e) {
      console.log("Failed to advance plan day:", e);
    }
    // reset local timer for next start
    baseElapsedRef.current = 0;
    startedAtRef.current = null;
    sessionStartedAtMsRef.current = null;
    setElapsed(0);
    setRunning(false);
    stopTicker();
    setMode("countup");
    setTargetSeconds(null);
    modeRef.current = "countup";
    targetSecondsRef.current = null;
    setCanResume(false);
  };

  const accent = row ? typeColor(row.type) : "#1e3a8a";

  const requestBack = () => {
    // If any timing has started, require confirmation and finish workout on exit.
    if (running || elapsed > 0 || baseElapsedRef.current > 0 || countdown != null) {
      setBackConfirmVisible(true);
      return;
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <View style={{ paddingTop: insets.top + 8 }} className="px-6 pb-4 flex-row items-center">
        <Pressable
          onPress={requestBack}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-3xl font-extrabold text-gray-900">Day {dayNum} workout</Text>
        </View>
      </View>

      <View className="px-6">
        <View className="bg-white rounded-3xl p-5 border border-gray-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[10px] tracking-widest text-gray-400 font-bold">WORKOUT TYPE</Text>
              <Text className="text-xl font-extrabold text-gray-900 mt-2">{row?.type ?? "—"}</Text>
            </View>
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center"
              style={{ backgroundColor: `${accent}15` }}
            >
              <Ionicons name={typeIcon(row?.type ?? "") as any} size={30} color={accent} />
            </View>
          </View>

          <Text className="text-[10px] tracking-widest text-gray-400 font-bold mt-5">WORKOUT</Text>
          <Text className="text-lg font-extrabold text-gray-900 mt-2">{row?.workout ?? "—"}</Text>
          <Text className="text-gray-600 mt-2 leading-6">
            Follow a steady pace, focus on form, and stop if you feel pain. You can pause anytime and your time will be recorded.
          </Text>
        </View>
      </View>

      {/* bottom timer display */}
      <View
        style={{ paddingBottom: insets.bottom + 10 }}
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-5"
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              if (!running) {
                if (canResume) {
                  // Resume after "Stop"
                  startedAtRef.current = Date.now();
                  setRunning(true);
                  startTicker();
                  const u = auth.currentUser;
                  if (u && sessionId) {
                    void updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
                      status: "running",
                      updatedAt: serverTimestamp(),
                    });
                  }
                  setCanResume(false);
                  return;
                }
                beginStart();
                return;
              }
              void pauseWorkout().then(() => setPauseMenuVisible(true));
            }}
            className={`flex-1 py-4 rounded-full active:opacity-90 ${running ? "bg-red-600" : "bg-[#76C893]"}`}
          >
            <Text className="text-white font-extrabold text-lg text-center">
              {running ? "Pause" : canResume ? "Resume" : "Start Workout"}
            </Text>
          </Pressable>

          <View className="items-start ml-5">
            <Text className="text-[10px] tracking-widest text-gray-400 font-bold">TIMER</Text>
            <Text className="text-3xl font-extrabold" style={{ color: accent }}>
              {fmtHms(elapsed)}
            </Text>
          </View>
        </View>
      </View>

      {/* Workout record for this day */}
      {dayRecords.length ? (
        <View className="px-6 mt-4">
          <View className="bg-white rounded-3xl p-5 border border-gray-100">
            <Text className="text-[10px] tracking-widest text-gray-400 font-bold">WORKOUT RECORD</Text>
            <View className="mt-3 gap-2">
              {dayRecords.map((r, idx) => (
                <View key={`rec-${idx}`} className="bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200">
                  <Text className="text-sm font-extrabold text-gray-900">
                    {fmtDateTime(r.startedAt)}  →  {fmtTimeOnly(r.endedAt)}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    Total:{" "}
                    <Text className="font-extrabold text-gray-900">{fmtDurationWords(r.elapsedSeconds)}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* Start choice modal */}
      <Modal visible={startChoiceVisible} transparent animationType="fade" onRequestClose={() => setStartChoiceVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Start workout</Text>
            <Text className="text-gray-500 mt-2 leading-6">Choose how you want to start.</Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setMode("countup");
                  setTargetSeconds(null);
                  modeRef.current = "countup";
                  targetSecondsRef.current = null;
                  setElapsed(0);
                  baseElapsedRef.current = 0;
                  setStartChoiceVisible(false);
                  void startWithCountdown();
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Start from 0</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setStartChoiceVisible(false);
                  setTimerPickerVisible(true);
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Set a timer</Text>
              </Pressable>
            </View>

            <View className="flex-row justify-end mt-6">
              <Pressable onPress={() => setStartChoiceVisible(false)} className="px-4 py-3">
                <Text className="font-extrabold text-gray-500">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Timer picker modal */}
      <Modal visible={timerPickerVisible} transparent animationType="fade" onRequestClose={() => setTimerPickerVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Set a timer</Text>
            <Text className="text-gray-500 mt-2 leading-6">Choose a duration (mm:ss).</Text>

            <View className="flex-row gap-3 mt-5">
              <View className="flex-1">
                <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">MINUTES</Text>
                <TextInput
                  value={timerMinText}
                  onChangeText={(t) => setTimerMinText(t.replace(/[^\d]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 text-lg font-extrabold"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">SECONDS</Text>
                <TextInput
                  value={timerSecText}
                  onChangeText={setTimerSecondsNormalized}
                  keyboardType="number-pad"
                  className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 text-lg font-extrabold"
                />
              </View>
            </View>

            {timerTotalSeconds > 0 && timerTotalSeconds < MIN_RECORD_SECONDS ? (
              <Text className="text-xs font-semibold text-red-600 mt-3">
                Minimum is {MIN_RECORD_SECONDS} seconds.
              </Text>
            ) : null}

            <View className="mt-4">
              <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">CUSTOM DURATION</Text>
              <View className="gap-2">
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setTimerMinText("10");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">10 min</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTimerMinText("20");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">20 min</Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setTimerMinText("30");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">30 min</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTimerMinText("60");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">60 min</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() => setTimerPickerVisible(false)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200"
              >
                <Text className="font-extrabold text-gray-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={startCountdownWithPicker}
                className="flex-1 py-3.5 rounded-2xl bg-[#76C893] items-center active:opacity-90"
              >
                <Text className="font-extrabold text-white">Start</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Countdown overlay */}
      {countdown != null ? (
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <View className="w-full px-10 items-center">
            <Text className="text-white text-lg font-extrabold mb-6 text-center">
              Your workout will begin in
            </Text>
            <View className="w-40 h-40 rounded-full bg-white items-center justify-center border border-gray-200">
              <Text className="text-6xl font-extrabold text-gray-900">{countdown}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Pause menu modal (Switch-plan style) */}
      <Modal visible={pauseMenuVisible} transparent animationType="fade" onRequestClose={() => setPauseMenuVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Workout paused</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              Choose what you want to do next.
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setPauseMenuVisible(false);
                  startedAtRef.current = Date.now();
                  setRunning(true);
                  startTicker();
                  const u = auth.currentUser;
                  if (u && sessionId) {
                    void updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
                      status: "running",
                      updatedAt: serverTimestamp(),
                    });
                  }
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Resume</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPauseMenuVisible(false);
                  void stopWorkout();
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Stop</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction("restart")}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Restart</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction("complete")}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Complete</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setPauseMenuVisible(false)}
              className="mt-5 py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
            >
              <Text className="text-gray-800 font-extrabold">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Confirm dialog modal for Restart/Complete */}
      <Modal visible={confirmAction != null} transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">
              {confirmAction === "restart" ? "Restart workout?" : "Complete workout?"}
            </Text>
            <Text className="text-gray-500 mt-2 leading-6">
              {confirmAction === "restart"
                ? "This will reset your timer to 0."
                : "This will finish the workout and save your time."}
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  setPauseMenuVisible(false);
                  if (action === "restart") {
                    baseElapsedRef.current = 0;
                    startedAtRef.current = null;
                    setElapsed(0);
                    setRunning(false);
                    clearCountdown();
                    setCanResume(false);
                  } else {
                    void completeWorkout();
                  }
                }}
                className="py-4 rounded-full items-center active:opacity-90 bg-red-600"
              >
                <Text className="text-white text-lg font-extrabold">Confirm</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction(null)}
                className="py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
              >
                <Text className="text-gray-800 font-extrabold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Back confirmation: finishes workout on exit */}
      <Modal visible={backConfirmVisible} transparent animationType="fade" onRequestClose={() => setBackConfirmVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Finish workout?</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              If you go back now, we will finish the workout and save your time.
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setBackConfirmVisible(false);
                  void completeWorkout().finally(() => router.back());
                }}
                className="py-4 rounded-full items-center active:opacity-90 bg-red-600"
              >
                <Text className="text-white text-lg font-extrabold">Confirm</Text>
              </Pressable>

              <Pressable
                onPress={() => setBackConfirmVisible(false)}
                className="py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
              >
                <Text className="text-gray-800 font-extrabold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

