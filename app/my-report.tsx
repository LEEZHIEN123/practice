import { Pressable } from "@/components/Pressable";
import {
    ProfileScreenHeader,
    ThemedCard,
    ThemedScreen,
    ThemedText,
} from "@/components/themed/ThemedUi";
import { formatReportDayLabel } from "@/lib/reportCalendar";
import { formatMealMacroSummary, formatWorkoutDuration, loadUserReport, type ReportPeriod, type UserReport } from "@/lib/userReport";
import { shareUserReportPdf } from "@/lib/userReportPdf";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

const COLLAPSE_THRESHOLD = 3;

function ReportSection({
  title,
  children,
  headerRight,
  onHeaderPress,
}: {
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
  onHeaderPress?: () => void;
}) {
  const header = (
    <View className="flex-row items-center justify-between mb-3">
      <ThemedText className="text-base font-extrabold flex-1 pr-2">{title}</ThemedText>
      {headerRight}
    </View>
  );

  return (
    <ThemedCard className="p-4 mb-3" rounded="2xl">
      {onHeaderPress ? (
        <Pressable onPress={onHeaderPress} hitSlop={8}>
          {header}
        </Pressable>
      ) : (
        header
      )}
      {children}
    </ThemedCard>
  );
}

function CollapsibleReportList<T>({
  title,
  items,
  emptyText,
  itemKey,
  renderItem,
}: {
  title: string;
  items: T[];
  emptyText: string;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const { theme } = useThemedScreen();
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = items.length > COLLAPSE_THRESHOLD;
  const visibleItems =
    shouldCollapse && !expanded ? items.slice(0, COLLAPSE_THRESHOLD) : items;
  const hiddenCount = items.length - COLLAPSE_THRESHOLD;

  return (
    <ReportSection
      title={title}
      onHeaderPress={shouldCollapse ? () => setExpanded((value) => !value) : undefined}
      headerRight={
        shouldCollapse ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.iconMuted}
          />
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyLine text={emptyText} />
      ) : (
        <>
          {visibleItems.map((item, index) => (
            <View key={itemKey(item, index)}>{renderItem(item, index)}</View>
          ))}
          {shouldCollapse && !expanded ? (
            <Pressable onPress={() => setExpanded(true)} className="mt-1 active:opacity-80">
              <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
                Show {hiddenCount} more
              </ThemedText>
            </Pressable>
          ) : null}
          {shouldCollapse && expanded ? (
            <Pressable onPress={() => setExpanded(false)} className="mt-1 active:opacity-80">
              <ThemedText variant="muted" className="text-sm font-semibold">
                Show less
              </ThemedText>
            </Pressable>
          ) : null}
        </>
      )}
    </ReportSection>
  );
}

function EmptyLine({ text }: { text: string }) {
  const { theme } = useThemedScreen();
  return (
    <ThemedText className="text-sm" style={{ color: theme.iconMuted }}>
      {text}
    </ThemedText>
  );
}

function RecordTitle({ children }: { children: ReactNode }) {
  return (
    <ThemedText className="text-sm font-extrabold" style={{ color: "#2563eb" }}>
      {children}
    </ThemedText>
  );
}

function ReportContent({ report }: { report: UserReport }) {
  const { theme } = useThemedScreen();
  const hasWater = report.waterMl > 0;
  const hasSteps = report.steps > 0;

  return (
    <>
      <ThemedCard className="p-4 mb-4" rounded="2xl">
        <ThemedText className="text-xl font-extrabold">{report.subtitle}</ThemedText>
        <ThemedText className="text-xl font-extrabold mt-1">{report.title}</ThemedText>
        <View className="flex-row flex-wrap gap-2 mt-4">
          {[
            {
              label: report.period === "weekly" ? "Total Burned" : "Burned",
              value: `${report.totalBurnedKcal.toLocaleString()} kcal`,
              hasRecords: report.totalBurnedKcal > 0,
            },
            {
              label: report.period === "weekly" ? "Total Consumed" : "Consumed",
              value: `${report.totalConsumedKcal.toLocaleString()} kcal`,
              hasRecords: report.totalConsumedKcal > 0,
            },
            {
              label: report.period === "weekly" ? "Total Water" : "Water",
              value: `${report.waterMl.toLocaleString()} ml`,
              hasRecords: report.waterMl > 0,
            },
            {
              label: report.period === "weekly" ? "Total Steps" : "Steps",
              value: report.steps.toLocaleString(),
              hasRecords: report.steps > 0,
            },
            {
              label: "Weight",
              value: report.weightKg != null ? `${report.weightKg.toFixed(1)} kg` : "—",
              hasRecords: report.weightKg != null,
            },
          ].map((item) => (
            <View
              key={item.label}
              className="rounded-2xl px-3 py-2 border min-w-[46%] flex-1"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <ThemedText variant="muted" className="text-[10px] font-bold tracking-widest">
                {item.label.toUpperCase()}
              </ThemedText>
              <ThemedText
                className="text-base font-extrabold mt-1"
                style={{ color: item.hasRecords ? theme.accentText : theme.iconMuted }}
              >
                {item.value}
              </ThemedText>
            </View>
          ))}
        </View>
      </ThemedCard>

      <CollapsibleReportList
        title="Workouts"
        items={report.workouts}
        emptyText="No workouts completed in this period."
        itemKey={(item, index) => `${item.title}-${index}`}
        renderItem={(item) => (
          <View className="mb-2">
            <RecordTitle>{item.title}</RecordTitle>
            <ThemedText className="text-sm font-semibold" style={{ color: theme.accentText }}>
              {item.burnedKcal.toLocaleString()} kcal burned · {formatWorkoutDuration(item.durationMin)}
            </ThemedText>
          </View>
        )}
      />

      <CollapsibleReportList
        title="Nutrition"
        items={report.meals}
        emptyText="No meals logged in this period."
        itemKey={(item, index) => `${item.title}-${index}`}
        renderItem={(item) => {
          const macroLine = formatMealMacroSummary(item);
          return (
            <View className="mb-2">
              <RecordTitle>{item.title}</RecordTitle>
              <ThemedText className="text-sm font-semibold" style={{ color: theme.accentText }}>
                {item.calories.toLocaleString()} kcal
              </ThemedText>
              {macroLine ? (
                <ThemedText variant="muted" className="text-xs mt-0.5">
                  {macroLine}
                </ThemedText>
              ) : null}
            </View>
          );
        }}
      />

      <ReportSection title="Water intake">
        {hasWater ? (
          <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
            {report.waterMl.toLocaleString()} ml total
          </ThemedText>
        ) : (
          <EmptyLine text="No water logged in this period." />
        )}
      </ReportSection>

      {report.period === "weekly" ? (
        <CollapsibleReportList
          title="Steps"
          items={report.stepsByDay.filter((row) => row.steps > 0)}
          emptyText="No steps recorded in this period."
          itemKey={(item) => item.dayKey}
          renderItem={(row) => (
            <View className="flex-row justify-between mb-2">
              <ThemedText className="text-sm font-extrabold" style={{ color: "#2563eb" }}>
                {formatReportDayLabel(row.dayKey)}
              </ThemedText>
              <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
                {row.steps.toLocaleString()}
              </ThemedText>
            </View>
          )}
        />
      ) : (
        <ReportSection title="Steps">
          {hasSteps ? (
            <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
              {report.steps.toLocaleString()} steps
            </ThemedText>
          ) : (
            <EmptyLine text="No steps recorded in this period." />
          )}
        </ReportSection>
      )}

      <CollapsibleReportList
        title="Weight"
        items={report.weightEntries}
        emptyText={
          report.weightKg != null
            ? `Latest weight: ${report.weightKg.toFixed(1)} kg`
            : "No weight logged in this period."
        }
        itemKey={(item) => item.dayKey}
        renderItem={(item) => (
          <View className="flex-row justify-between mb-2">
            <ThemedText className="text-sm font-extrabold" style={{ color: "#2563eb" }}>
              {formatReportDayLabel(item.dayKey)}
            </ThemedText>
            <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
              {item.weightKg.toFixed(1)} kg
            </ThemedText>
          </View>
        )}
      />

      <CollapsibleReportList
        title="Achievements unlocked"
        items={report.achievements}
        emptyText="No achievements unlocked in this period."
        itemKey={(item) => item.id}
        renderItem={(item) => (
          <View className="mb-3">
            <View className="flex-row items-center">
              <Ionicons name="trophy" size={16} color="#2563eb" />
              <ThemedText className="text-sm font-extrabold ml-2" style={{ color: "#2563eb" }}>
                {item.title}
              </ThemedText>
            </View>
            {item.description ? (
              <ThemedText variant="secondary" className="text-sm mt-1 ml-6">
                {item.description}
              </ThemedText>
            ) : null}
          </View>
        )}
      />
    </>
  );
}

export default function MyReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, segmentTrackStyle, segmentActiveStyle } = useThemedScreen();
  const calendarTz = useUserCalendarTimezone();

  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userName, setUserName] = useState("User");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [report, setReport] = useState<UserReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { name?: string };
      if (typeof data.name === "string" && data.name.trim()) setUserName(data.name.trim());
    });
    return () => unsub();
  }, [authUid]);

  const refreshReport = useCallback(async () => {
    if (!authUid) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await loadUserReport({
        uid: authUid,
        period,
        calendarTz,
        userName,
      });
      setReport(next);
    } catch (e: unknown) {
      setReport(null);
      Alert.alert("Report", e instanceof Error ? e.message : "Could not load your report.");
    } finally {
      setLoading(false);
    }
  }, [authUid, calendarTz, period, userName]);

  useEffect(() => {
    void refreshReport();
  }, [refreshReport]);

  const handleShare = async () => {
    if (!report) return;
    try {
      setSharing(true);
      await shareUserReportPdf(report);
    } catch (e: unknown) {
      Alert.alert("Share report", e instanceof Error ? e.message : "Could not share the PDF report.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <ThemedScreen>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12, flex: 1 }}>
        <ProfileScreenHeader
          title="My Report"
          onBack={() => router.back()}
          titleClassName="text-xl"
          rightSlot={
            <Pressable
              onPress={() => void handleShare()}
              disabled={!report || sharing || loading}
              hitSlop={8}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: theme.accentSoft, opacity: !report || sharing || loading ? 0.5 : 1 }}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={theme.accentText} />
              ) : (
                <Ionicons name="share-social-outline" size={22} color={theme.accentText} />
              )}
            </Pressable>
          }
        />

        <View className="rounded-full p-1 flex-row mb-4" style={segmentTrackStyle}>
          {(["daily", "weekly"] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setPeriod(key)}
              className="flex-1 rounded-full py-2.5 items-center"
              style={period === key ? segmentActiveStyle : undefined}
            >
              <Text
                className="text-sm font-extrabold"
                style={{ color: period === key ? theme.accentText : theme.textMuted }}
              >
                {key === "daily" ? "Daily report" : "Weekly report"}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={theme.accent} />
              <ThemedText variant="muted" className="text-sm mt-3">
                Building your report…
              </ThemedText>
            </View>
          ) : report ? (
            <ReportContent key={`${report.period}-${report.dayKeys[0]}`} report={report} />
          ) : (
            <ThemedText variant="muted" className="text-sm text-center py-12">
              Sign in to view your report.
            </ThemedText>
          )}
        </ScrollView>
      </View>
    </ThemedScreen>
  );
}
