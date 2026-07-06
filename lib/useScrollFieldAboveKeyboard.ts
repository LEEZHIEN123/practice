import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type ScrollView,
  type View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useScrollFieldAboveKeyboard(extraBottomPad = 32) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const pendingScrollWrapRef = useRef<View | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollFieldIntoView = useCallback(
    (wrapRef: React.RefObject<View | null>) => {
      pendingScrollWrapRef.current = wrapRef.current;
      const run = () => {
        const wrap = pendingScrollWrapRef.current;
        if (!wrap) return;
        wrap.measureInWindow((_x, y, _w, h) => {
          const kb = keyboardHeight > 0 ? keyboardHeight : 280;
          const screenHeight = Dimensions.get("window").height;
          const fieldBottom = y + h;
          const visibleBottom = screenHeight - kb - 16;
          if (fieldBottom > visibleBottom) {
            scrollRef.current?.scrollTo({
              y: scrollYRef.current + (fieldBottom - visibleBottom),
              animated: true,
            });
          }
        });
      };
      setTimeout(run, Platform.OS === "ios" ? 80 : 180);
    },
    [keyboardHeight]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      pendingScrollWrapRef.current = null;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight > 0 && pendingScrollWrapRef.current) {
      scrollFieldIntoView({ current: pendingScrollWrapRef.current });
    }
  }, [keyboardHeight, scrollFieldIntoView]);

  const scrollBottomPad = Math.max(keyboardHeight, insets.bottom) + extraBottomPad;

  return {
    scrollRef,
    scrollFieldIntoView,
    scrollBottomPad,
    onScroll: (y: number) => {
      scrollYRef.current = y;
    },
  };
}
