import { BlockReasonModal } from "@/components/community/BlockReasonModal";
import { Pressable } from "@/components/Pressable";
import type { CommunityReport } from "@/lib/communityTypes";
import { ADMIN_BLOCK_POST_REASONS } from "@/lib/communityTypes";
import {
  blockReportedPost,
  checkIsAdmin,
  dismissReport,
  subscribePendingReports,
} from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CommunityAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      <View className="flex-1 bg-[#f3f4f3] items-center justify-center">
        <ActivityIndicator size="large" color="#52B69A" />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-[#f3f4f3] items-center justify-center px-8">
        <Text className="text-lg font-extrabold text-gray-900 text-center">Admin only</Text>
        <Text className="text-sm text-gray-500 text-center mt-2">
          You do not have permission to view moderation reports.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-full bg-[#52B69A] px-8 py-3"
        >
          <Text className="text-sm font-extrabold text-white">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">Moderation</Text>
        </View>

        <View className="bg-white rounded-[28px] p-5 border border-gray-200 gap-3">
          <Text className="text-sm text-gray-500 mb-1">
            Review reported posts and comments. Block posts that violate community rules.
          </Text>

          {reports.length === 0 ? (
            <Text className="text-sm text-gray-500 text-center py-8">No pending reports.</Text>
          ) : null}

          {reports.map((report) => {
            const busy = actionId === report.id;
            return (
              <View
                key={report.id}
                className="bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-extrabold text-[#52B69A] uppercase">
                    {report.targetType}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {new Date(report.createdAt).toLocaleString()}
                  </Text>
                </View>

                <Text className="text-sm font-extrabold text-gray-900 mt-2">
                  Reported by {report.reporterName}
                </Text>
                <Text className="text-sm text-gray-600 mt-1">
                  Reason: {report.reason}
                </Text>
                <Text className="text-sm text-gray-600 mt-1">
                  Author: {report.targetAuthorName}
                </Text>
                <Text className="text-sm text-gray-700 mt-3 leading-6 bg-white rounded-xl px-3 py-3 border border-gray-200">
                  {report.targetContent}
                </Text>

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
                        <Text className="text-xs font-extrabold text-white">Block post</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => handleDismiss(report)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center bg-white border border-gray-200"
                    >
                      <Text className="text-xs font-extrabold text-gray-600">Dismiss</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleDismiss(report)}
                    disabled={busy}
                    className="mt-3 rounded-full py-2.5 items-center bg-white border border-gray-200"
                  >
                    <Text className="text-xs font-extrabold text-gray-600">Dismiss report</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <BlockReasonModal
        visible={blockReport !== null}
        title="Block Post"
        description="Choose a reason for blocking this reported post. The reporter and author will be notified via Support Admin chat."
        presetReasons={ADMIN_BLOCK_POST_REASONS}
        onClose={() => setBlockReport(null)}
        onConfirm={handleConfirmReportBlock}
      />
    </View>
  );
}
