import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { FlatList, Keyboard, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

type ChatKeyboardOptions = {
  nearBottomRef?: MutableRefObject<boolean>;
  nearBottomThreshold?: number;
};

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return visible;
}

export function useChatKeyboard<T>(
  listRef: RefObject<FlatList<T> | null>,
  options: ChatKeyboardOptions = {}
) {
  const internalNearBottomRef = useRef(true);
  const nearBottomRef = options.nearBottomRef ?? internalNearBottomRef;
  const threshold = options.nearBottomThreshold ?? 96;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const frameRef = useRef<number | null>(null);

  const cancelScheduledScroll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const scrollToLatest = useCallback((animated = false) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      listRef.current?.scrollToEnd({ animated });
    });
  }, [listRef]);

  const scheduleScrollToLatest = useCallback((animated = false) => {
    cancelScheduledScroll();
    [0, 80, 220, 360].forEach((delayMs) => {
      const timer = setTimeout(() => scrollToLatest(animated && delayMs === 360), delayMs);
      timersRef.current.push(timer);
    });
  }, [cancelScheduledScroll, scrollToLatest]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    nearBottomRef.current = distanceFromEnd < threshold;
  }, [nearBottomRef, threshold]);

  const handleComposerFocus = useCallback(() => {
    nearBottomRef.current = true;
    scheduleScrollToLatest(false);
  }, [nearBottomRef, scheduleScrollToLatest]);

  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(eventName, () => {
      if (nearBottomRef.current) scheduleScrollToLatest(false);
    });
    return () => subscription.remove();
  }, [nearBottomRef, scheduleScrollToLatest]);

  useEffect(() => cancelScheduledScroll, [cancelScheduledScroll]);

  return {
    nearBottomRef,
    cancelScheduledScroll,
    handleComposerFocus,
    handleScroll,
    scheduleScrollToLatest,
    scrollToLatest,
  };
}
