/**
 * Floating workout window without NativeWind `className`.
 * Avoids React 19 + css-interop "Couldn't find a navigation context" when
 * toggling expanded/collapsed (same pattern as day-workout-unstyled).
 */
import { BOTTOM_TAB_BAR_CORE_HEIGHT, isBottomTabRoute } from "@/components/navigation/BottomTabBar";
import { useWorkoutSession } from "@/context/WorkoutSessionContext";
import {
    MIN_RECORD_SECONDS,
    completeMinimizedWorkout,
} from "@/lib/completeMinimizedWorkout";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { getWorkoutDetail } from "@/lib/workoutCatalog";
import { getWorkoutInstructionImage } from "@/lib/workoutInstructionImages";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

const COLLAPSED_H = 64;
const COLLAPSED_W = 168;
const CARD_PAD = 8;
const TIMER_RED = "#dc2626";
const ACCENT_GREEN = "#76C893";

function fmtHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function typeIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("yoga")) return "leaf-outline";
  if (t.includes("hiit")) return "flash-outline";
  if (t.includes("cardio")) return "walk-outline";
  return "barbell-outline";
}

function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  screenW: number,
  screenH: number,
  topInset: number,
  bottomInset: number
) {
  const minX = CARD_PAD;
  const minY = topInset + CARD_PAD;
  const maxX = screenW - w - CARD_PAD;
  const maxY = screenH - h - bottomInset - CARD_PAD;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

/** Always dock to the nearer left or right edge. */
function snapToSide(
  x: number,
  y: number,
  w: number,
  h: number,
  screenW: number,
  screenH: number,
  topInset: number,
  bottomInset: number
) {
  const leftX = CARD_PAD;
  const rightX = screenW - w - CARD_PAD;
  const centerX = x + w / 2;
  const nx = centerX < screenW / 2 ? leftX : rightX;
  return clampPos(nx, y, w, h, screenW, screenH, topInset, bottomInset);
}

export function WorkoutMiniPlayer() {
  const pathname = usePathname();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { cardStyle, textPrimary, textSecondary, textMuted, theme } = useThemedScreen();
  const {
    session,
    minimized,
    displayElapsed,
    pauseMinimized,
    resumeMinimized,
    dismiss,
    setMinimized,
    getLiveSnapshot,
  } = useWorkoutSession();
  const [completing, setCompleting] = useState(false);

  const cardW = Math.min(300, Math.round(screenW * 0.86));
  const cardH = Math.min(420, Math.round(screenH * 0.55));
  const movedRef = useRef(false);
  const headerMovedRef = useRef(false);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const posReadyRef = useRef(false);
  const sessionKeyRef = useRef<string | null>(null);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);

  const instructionImage = useMemo(
    () => (session ? getWorkoutInstructionImage(session.workoutName) : null),
    [session?.workoutName]
  );
  const instructionText = useMemo(() => {
    if (!session) return "";
    const detail = getWorkoutDetail(session.workoutType, session.workoutName);
    return (
      detail?.instruction ??
      "Follow a steady pace, focus on form, and stop if you feel pain. You can pause anytime."
    );
  }, [session?.workoutType, session?.workoutName]);

  const bottomInset = useMemo(() => {
    const tabBarReserve = isBottomTabRoute(pathname) ? BOTTOM_TAB_BAR_CORE_HEIGHT + 8 : 0;
    return insets.bottom + tabBarReserve;
  }, [pathname, insets.bottom]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!session || !minimized) {
      posReadyRef.current = false;
      sessionKeyRef.current = null;
      return;
    }
    const key = `${session.kind}:${session.href}:${session.sessionId ?? "none"}`;
    const isNewSession = sessionKeyRef.current !== key;
    if (isNewSession) {
      sessionKeyRef.current = key;
      setExpanded(false);
      const next = snapToSide(
        screenW - COLLAPSED_W - CARD_PAD,
        insets.top + 120,
        COLLAPSED_W,
        COLLAPSED_H,
        screenW,
        screenH,
        insets.top,
        bottomInset
      );
      setPos(next);
      posRef.current = next;
      posReadyRef.current = true;
    }
  }, [session, minimized, screenW, screenH, insets.top, bottomInset, cardW, cardH]);

  const applyDrag = useCallback(
    (dx: number, dy: number) => {
      const w = expanded ? cardW : COLLAPSED_W;
      const h = expanded ? cardH : COLLAPSED_H;
      const origin = dragOriginRef.current;
      const next = clampPos(
        origin.x + dx,
        origin.y + dy,
        w,
        h,
        screenW,
        screenH,
        insets.top,
        bottomInset
      );
      setPos(next);
    },
    [cardW, cardH, expanded, screenW, screenH, insets.top, bottomInset]
  );

  const panCollapsed = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragOriginRef.current = { ...posRef.current };
          movedRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) movedRef.current = true;
          applyDrag(g.dx, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (!movedRef.current && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
            setExpanded(true);
            setPos((p) =>
              snapToSide(p.x, p.y, cardW, cardH, screenW, screenH, insets.top, bottomInset)
            );
          } else if (movedRef.current) {
            setPos((p) =>
              snapToSide(
                p.x,
                p.y,
                COLLAPSED_W,
                COLLAPSED_H,
                screenW,
                screenH,
                insets.top,
                bottomInset
              )
            );
          }
          movedRef.current = false;
        },
      }),
    [applyDrag, cardW, cardH, screenW, screenH, insets.top, bottomInset]
  );

  const panHeader = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          dragOriginRef.current = { ...posRef.current };
          headerMovedRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) headerMovedRef.current = true;
          applyDrag(g.dx, g.dy);
        },
        onPanResponderRelease: () => {
          if (headerMovedRef.current) {
            setPos((p) =>
              snapToSide(p.x, p.y, cardW, cardH, screenW, screenH, insets.top, bottomInset)
            );
          }
          headerMovedRef.current = false;
        },
      }),
    [applyDrag, cardW, cardH, screenW, screenH, insets.top, bottomInset]
  );

  const persistPaused = async (elapsedSeconds: number, sessionId: string | null) => {
    const u = auth.currentUser;
    if (!u || !sessionId) return;
    try {
      await updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
        elapsedSeconds,
        status: "paused",
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* ignore */
    }
  };

  const persistRunning = async (sessionId: string | null) => {
    const u = auth.currentUser;
    if (!u || !sessionId) return;
    try {
      await updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
        status: "running",
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* ignore */
    }
  };

  const handleClose = () => {
    posReadyRef.current = false;
    sessionKeyRef.current = null;
    const folded = dismiss();
    if (folded) {
      void persistPaused(folded.baseElapsedSeconds, folded.sessionId);
    }
  };

  const handleShrink = () => {
    setExpanded(false);
    setPos((p) =>
      snapToSide(
        p.x,
        p.y,
        COLLAPSED_W,
        COLLAPSED_H,
        screenW,
        screenH,
        insets.top,
        bottomInset
      )
    );
  };

  const openWorkout = () => {
    if (!session) return;
    setMinimized(false);
    router.push(session.href as any);
  };

  const togglePause = () => {
    if (!session || completing) return;
    if (session.running) {
      pauseMinimized();
      const elapsed =
        session.baseElapsedSeconds +
        (session.startedAtMs != null
          ? Math.max(0, Math.floor((Date.now() - session.startedAtMs) / 1000))
          : 0);
      void persistPaused(elapsed, session.sessionId);
    } else {
      resumeMinimized();
      void persistRunning(session.sessionId);
    }
  };

  const completeWorkout = async () => {
    if (!session || completing) return;
    setCompleting(true);
    pauseMinimized();
    const live = getLiveSnapshot() ?? session;
    const elapsed = Math.max(0, Math.floor(live.baseElapsedSeconds));

    try {
      const result = await completeMinimizedWorkout({
        kind: live.kind,
        workoutName: live.workoutName,
        workoutType: live.workoutType,
        sessionId: live.sessionId,
        elapsedSeconds: elapsed,
        sessionStartedAtMs: live.sessionStartedAtMs,
        day: live.day,
        calendarTz,
      });

      dismiss();
      posReadyRef.current = false;
      sessionKeyRef.current = null;

      if (result === "recorded") {
        Alert.alert("Workout recorded", "Your workout has been saved successfully.");
      } else if (result === "too_short") {
        Alert.alert(
          "Workout not saved",
          `Workouts under ${MIN_RECORD_SECONDS} seconds won't be saved as a record.`
        );
      } else if (result === "zero_kcal") {
        Alert.alert(
          "Workout not saved",
          "This workout finished at 0 kcal, so it won't be saved as a record."
        );
      } else if (result === "unsigned") {
        Alert.alert("Sign in required", "Sign in to save your workout.");
      } else {
        Alert.alert("Error", "Could not save the workout. Please try again.");
      }
    } finally {
      setCompleting(false);
    }
  };

  if (!session || !minimized) return null;

  const onWorkoutScreen =
    pathname === "/day-workout" ||
    pathname === "/free-workout" ||
    (typeof pathname === "string" &&
      (pathname.endsWith("day-workout") || pathname.endsWith("free-workout")));
  if (onWorkoutScreen) return null;

  const iconName = typeIcon(session.workoutType) as any;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
      <View
        style={{
          position: "absolute",
          left: pos.x,
          top: pos.y,
          width: expanded ? cardW : COLLAPSED_W,
        }}
      >
        {!expanded ? (
          <View {...panCollapsed.panHandlers} collapsable={false}>
            <View style={[styles.collapsedPill, { minHeight: COLLAPSED_H, width: COLLAPSED_W }]}>
              <View style={styles.collapsedIconWrap}>
                <Ionicons name={iconName} size={20} color="#fff" />
              </View>
              <View style={styles.collapsedTextCol}>
                <Text style={styles.collapsedWorkout} numberOfLines={1}>
                  {session.workoutName}
                </Text>
                <Text style={styles.collapsedTimer} numberOfLines={1}>
                  {fmtHms(displayElapsed)}
                </Text>
              </View>
              {session.running ? <View style={styles.runningDot} /> : null}
            </View>
          </View>
        ) : (
          <View style={[styles.card, cardStyle, { width: cardW, maxHeight: cardH }]}>
            <View
              style={[
                styles.header,
                { backgroundColor: theme.rowBg, borderBottomColor: theme.cardBorder },
              ]}
            >
              <View {...panHeader.panHandlers} style={styles.dragArea}>
                <Ionicons name="menu" size={20} color={theme.iconMuted} />
                <Text style={[styles.dragLabel, { color: theme.textMuted }]}>DRAG</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={handleShrink} hitSlop={10} style={styles.iconBtn}>
                  <Ionicons name="chevron-down" size={22} color={theme.textPrimary} />
                </Pressable>
                <Pressable onPress={handleClose} hitSlop={10} style={styles.iconBtn}>
                  <Ionicons name="close" size={22} color={theme.danger} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={{ maxHeight: cardH - 52 - 110 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Pressable onPress={openWorkout}>
                <Text style={[styles.title, textPrimary]} numberOfLines={1}>
                  {session.workoutName}
                </Text>
                <Text style={[styles.subtitle, textSecondary]} numberOfLines={1}>
                  {session.title}
                </Text>

                {instructionImage ? (
                  <Image
                    source={instructionImage}
                    style={styles.instructionImage}
                    contentFit="contain"
                    transition={0}
                    autoplay
                    recyclingKey={`mini-gif:${session.workoutName}`}
                  />
                ) : (
                  <View style={[styles.imageFallback, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name={iconName} size={36} color={theme.accent} />
                  </View>
                )}

                <Text style={[styles.sectionLabel, textMuted]}>INSTRUCTIONS</Text>
                <Text style={[styles.instructionBody, textSecondary]}>{instructionText}</Text>
              </Pressable>
            </ScrollView>

            <View
              style={[
                styles.footer,
                {
                  backgroundColor: theme.cardBg,
                  borderTopColor: theme.cardBorder,
                },
              ]}
            >
              <Text style={styles.timer}>{fmtHms(displayElapsed)}</Text>
              <View style={styles.controls}>
                <Pressable
                  onPress={togglePause}
                  disabled={completing}
                  style={[
                    styles.pauseBtn,
                    { backgroundColor: session.running ? TIMER_RED : ACCENT_GREEN },
                  ]}
                >
                  <Ionicons name={session.running ? "pause" : "play"} size={22} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => void completeWorkout()}
                  disabled={completing}
                  style={[styles.completeBtn, completing ? { opacity: 0.6 } : null]}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.completeBtnText}>{completing ? "Saving…" : "Complete"}</Text>
                </Pressable>
                <Pressable
                  onPress={openWorkout}
                  disabled={completing}
                  style={[styles.openBtn, { backgroundColor: theme.accentSoft }]}
                >
                  <Text style={[styles.openBtnText, { color: theme.accentText }]}>Open</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 9998, elevation: 13 },
  collapsedPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: ACCENT_GREEN,
    borderWidth: 2,
    borderColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  collapsedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  collapsedTextCol: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
  },
  collapsedWorkout: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  collapsedTimer: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  runningDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#a7f3d0",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  dragArea: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  dragLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  instructionImage: {
    width: "100%",
    height: 140,
    marginTop: 10,
    borderRadius: 12,
  },
  imageFallback: {
    marginTop: 10,
    height: 100,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 12,
  },
  instructionBody: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 18,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  timer: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: TIMER_RED,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 10,
    flexWrap: "wrap",
  },
  pauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  completeBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  openBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
