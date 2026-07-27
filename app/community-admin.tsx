import { BlockReasonModal } from "@/components/community/BlockReasonModal";
import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import type { CommunityReport } from "@/lib/communityTypes";
import { ADMIN_BLOCK_POST_REASONS } from "@/lib/communityTypes";
import {
  blockReportedPost,
  checkIsAdmin,
  dismissReport,
  subscribePendingReports,
} from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CommunityAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useThemedScreen();
  const { rowBorderStyle } = useProfileCardStyles();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [blockReport, setBlockReport] = useState<CommunityReport | null>(null);

  useEffect(() => {
    void checkIsAdmin().then(setIsAdmin);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribePendingReports(setReports);
    return unsub;
  }, [isAdmin]);

  const handleBlock = (report: CommunityReport) => {
    Alert.alert(
      "Block post",
      "This post will be hidden from all users. The reporter and post author will be notified via Support Admin chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockReport(report),
        },
      ]
    );
  };

  const handleConfirmReportBlock = async (reason: string) => {
    if (!blockReport) return;
    try {
      setActionId(blockReport.id);
      await blockReportedPost(blockReport, reason);
      Alert.alert("Post blocked", "The reporter and author have been notified.");
      setBlockReport(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not block post.");
      throw e;
    } finally {
      setActionId(null);
    }
  };

  const handleDismiss = (report: CommunityReport) => {
    Alert.alert(
      "Dismiss report",
      "Dismiss this report? The reporter will be notified via Support Admin chat that no action was taken.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dismiss",
          onPress: () => {
            void (async () => {
              try {
                setActionId(report.id);
                await dismissReport(report);
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not dismiss report.");
              } finally {
                setActionId(null);
              }
            })();
          },
        },
      ]
    );
  };

  if (isAdmin === null) {
    return (
      <ThemedScreen className="items-center justify-center">
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedScreen>
    );
  }

  if (!isAdmin) {
    return (
      <ThemedScreen className="items-center justify-center px-8">
        <ThemedText className="text-lg font-extrabold text-center">Admin only</ThemedText>
        <ThemedText variant="muted" className="text-sm text-center mt-2">
          You do not have permission to view moderation reports.
        </ThemedText>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-full px-8 py-3"
          style={{ backgroundColor: theme.accent }}
        >
          <ThemedText className="text-sm font-extrabold text-white">Go Back</ThemedText>
        </Pressable>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <ProfileScreenHeader title="Moderation" onBack={() => router.back()} />

        <ThemedCard className="p-5 gap-3">
          <ThemedText variant="muted" className="text-sm mb-1">
            Review reported posts and comments. Block posts that violate community rules.
          </ThemedText>

          {reports.length === 0 ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No pending reports.
            </ThemedText>
          ) : null}

          {reports.map((report) => {
            const busy = actionId === report.id;
            return (
              <View key={report.id} className="rounded-2xl px-4 py-4" style={rowBorderStyle}>
                <View className="flex-row items-center justify-between">
                  <ThemedText variant="accent" className="text-xs font-extrabold uppercase">
                    {report.targetType}
                  </ThemedText>
                  <ThemedText variant="muted" className="text-xs">
                    {new Date(report.createdAt).toLocaleString()}
                  </ThemedText>
                </View>

                <ThemedText className="text-sm font-extrabold mt-2">
                  Reported by {report.reporterName}
                </ThemedText>
                <ThemedText variant="secondary" className="text-sm mt-1">
                  Reason: {report.reason}
                </ThemedText>
                <ThemedText variant="secondary" className="text-sm mt-1">
                  Author: {report.targetAuthorName}
                </ThemedText>
                <View
                  className="mt-3 rounded-xl px-3 py-3 border"
                  style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                >
                  <ThemedText variant="secondary" className="text-sm leading-6">
                    {report.targetContent}
                  </ThemedText>
                </View>

                {report.targetType === "post" ? (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => void handleBlock(report)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center bg-[#ef4444]"
                    >
                      {busy ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <ThemedText className="text-xs font-extrabold text-white">Block post</ThemedText>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => handleDismiss(report)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center border"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                    >
                      <ThemedText variant="secondary" className="text-xs font-extrabold">
                        Dismiss
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleDismiss(report)}
                    disabled={busy}
                    className="mt-3 rounded-full py-2.5 items-center border"
                    style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                  >
                    <ThemedText variant="secondary" className="text-xs font-extrabold">
                      Dismiss report
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ThemedCard>
      </ScrollView>

      <BlockReasonModal
        visible={blockReport !== null}
        title="Block Post"
        description="Choose a reason for blocking this reported post. The reporter and author will be notified via Support Admin chat."
        presetReasons={ADMIN_BLOCK_POST_REASONS}
        onClose={() => setBlockReport(null)}
        onConfirm={handleConfirmReportBlock}
      />
    </ThemedScreen>
  );
}
