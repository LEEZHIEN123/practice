import { Pressable } from "@/components/Pressable";
import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { View } from "react-native";

type BarcodeCameraScannerProps = {
  onScanned: (data: string) => void;
  disabled?: boolean;
};

export function BarcodeCameraScanner({ onScanned, disabled }: BarcodeCameraScannerProps) {
  const { theme } = useThemedScreen();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const scannedRef = useRef(false);

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setCameraOpen(true);
  };

  if (!cameraOpen) {
    return (
      <Pressable onPress={() => void openCamera()} className="mb-4">
        <ThemedCard className="p-5 flex-row items-center">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mr-4"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="barcode-outline" size={28} color={theme.accentText} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-base font-extrabold">Scan with camera</ThemedText>
            <ThemedText variant="muted" className="text-sm mt-0.5">
              Tap to open camera and scan a product barcode
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
        </ThemedCard>
      </Pressable>
    );
  }

  if (!permission?.granted) {
    return (
      <ThemedCard className="p-4 mb-4 items-center">
        <Ionicons name="camera-outline" size={40} color={theme.iconMuted} />
        <ThemedText variant="muted" className="text-sm text-center mt-2 leading-5">
          Camera access is needed to scan barcodes.
        </ThemedText>
        <Pressable
          onPress={() => void openCamera()}
          className="rounded-full px-5 py-2.5 mt-3"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <ThemedText className="text-sm font-extrabold" style={{ color: theme.accentText }}>
            Allow Camera
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => setCameraOpen(false)} className="mt-3 py-2">
          <ThemedText variant="muted" className="text-sm font-bold">
            Cancel
          </ThemedText>
        </Pressable>
      </ThemedCard>
    );
  }

  return (
    <View className="rounded-3xl overflow-hidden mb-4 border" style={{ borderColor: theme.cardBorder }}>
      <View className="relative">
        <CameraView
          style={{ height: 220 }}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
          }}
          onBarcodeScanned={({ data }) => {
            if (disabled || scannedRef.current) return;
            scannedRef.current = true;
            onScanned(data);
            setCameraOpen(false);
            setTimeout(() => {
              scannedRef.current = false;
            }, 2500);
          }}
        />
        <Pressable
          onPress={() => setCameraOpen(false)}
          className="absolute top-2 right-2 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color="#ffffff" />
        </Pressable>
      </View>
      <View className="py-2 items-center" style={{ backgroundColor: theme.rowBg }}>
        <ThemedText variant="muted" className="text-xs">
          Point camera at barcode
        </ThemedText>
      </View>
    </View>
  );
}
