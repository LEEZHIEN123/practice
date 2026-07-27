import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Keyboard,
    Platform,
    type ScrollView,
    type View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScrollFieldAboveKeyboardOptions = {
  gapAboveKeyboard?: number;
  /** Use when the screen already wraps content in KeyboardAvoidingView. */
  withKeyboardAvoidingView?: boolean;
};

export function useScrollFieldAboveKeyboard(
  extraBottomPad = 32,
  options: ScrollFieldAboveKeyboardOptions = {}
) {
  const { gapAboveKeyboard = 16, withKeyboardAvoidingView = false } = options;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const pendingScrollWrapRef = useRef<View | null>(null);
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const runScrollForPending = useCallback(() => {
    const wrap = pendingScrollWrapRef.current;
    const scroll = scrollRef.current;
    if (!wrap || !scroll) return;

    wrap.measureInWindow((_x, y, _w, h) => {
      const kb = keyboardHeightRef.current;
      const screenHeight = Dimensions.get("window").height;
      // Prefer live keyboard height; fall back so first focus still lifts the field.
      const reservedKb = kb > 0 ? kb : Platform.OS === "ios" ? 336 : 300;
      const fieldBottom = y + h;
      const visibleBottom = screenHeight - reservedKb - gapAboveKeyboard;
      const delta = fieldBottom - visibleBottom;
      if (delta > 2) {
        scroll.scrollTo({
          y: Math.max(0, scrollYRef.current + delta),
          animated: true,
        });
      }
    });
  }, [gapAboveKeyboard]);

  const scrollFieldIntoView = useCallback(
    (wrapRef: React.RefObject<View | null>) => {
      pendingScrollWrapRef.current = wrapRef.current;
      // Multiple passes: before keyboard, mid-animation, after settle.
      requestAnimationFrame(runScrollForPending);
      setTimeout(runScrollForPending, Platform.OS === "ios" ? 50 : 80);
      setTimeout(runScrollForPending, Platform.OS === "ios" ? 220 : 280);
      setTimeout(runScrollForPending, Platform.OS === "ios" ? 420 : 480);
    },
    [runScrollForPending]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      const next = event.endCoordinates.height;
      keyboardHeightRef.current = next;
      setKeyboardHeight(next);
      // Keyboard just appeared — keep the focused field above it.
      requestAnimationFrame(runScrollForPending);
      setTimeout(runScrollForPending, 80);
      setTimeout(runScrollForPending, 200);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      pendingScrollWrapRef.current = null;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [runScrollForPending]);

  const scrollBottomPad = withKeyboardAvoidingView
    ? insets.bottom + extraBottomPad
    : Math.max(keyboardHeight, insets.bottom) + extraBottomPad;

  return {
    scrollRef,
    scrollFieldIntoView,
    scrollBottomPad,
    keyboardHeight,
    onScroll: (y: number) => {
      scrollYRef.current = y;
    },
  };
}
