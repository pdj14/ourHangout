import { useEffect, useRef, useState } from 'react';

import { reconnectDelayMs } from '../services/backend';

export type RealtimeEvent = {
  event?: string;
  data?: Record<string, unknown>;
};

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type UseRealtimeConnectionOptions = {
  enabled: boolean;
  url: string;
  onEvent: (payload: RealtimeEvent) => void;
  onConnected?: (reconnected: boolean) => void;
  onUnstable?: () => void;
};

export function useRealtimeConnection({
  enabled,
  url,
  onEvent,
  onConnected,
  onUnstable,
}: UseRealtimeConnectionOptions): RealtimeState {
  const [state, setState] = useState<RealtimeState>('idle');
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);
  const callbacksRef = useRef({ onEvent, onConnected, onUnstable });

  useEffect(() => {
    callbacksRef.current = { onEvent, onConnected, onUnstable };
  }, [onConnected, onEvent, onUnstable]);

  useEffect(() => {
    attemptRef.current = 0;
  }, [url]);

  useEffect(() => {
    if (!enabled || !url) {
      setState('idle');
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const attempt = attemptRef.current;
    setState(attempt > 0 ? 'reconnecting' : 'connecting');

    const socket = new WebSocket(url);
    socket.onopen = () => {
      if (disposed) return;
      const reconnected = attemptRef.current > 0;
      attemptRef.current = 0;
      setState('connected');
      callbacksRef.current.onConnected?.(reconnected);
    };
    socket.onmessage = (event) => {
      if (disposed) return;
      try {
        const payload = JSON.parse(
          typeof event.data === 'string' ? event.data : String(event.data || '')
        ) as RealtimeEvent;
        callbacksRef.current.onEvent(payload);
      } catch {
        // A later authoritative sync recovers malformed frames.
      }
    };
    socket.onerror = () => {
      // The close event controls backoff and user-visible state.
    };
    socket.onclose = () => {
      if (disposed) return;
      const nextAttempt = attemptRef.current + 1;
      attemptRef.current = nextAttempt;
      setState('reconnecting');
      if (nextAttempt > 1) callbacksRef.current.onUnstable?.();
      reconnectTimer = setTimeout(
        () => setGeneration((current) => current + 1),
        reconnectDelayMs(nextAttempt - 1)
      );
    };

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket.close();
    };
  }, [enabled, generation, url]);

  return state;
}
