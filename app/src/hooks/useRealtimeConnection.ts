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
  onSessionInvalid?: () => void;
};

export function useRealtimeConnection({
  enabled,
  url,
  onEvent,
  onConnected,
  onUnstable,
  onSessionInvalid,
}: UseRealtimeConnectionOptions): RealtimeState {
  const [state, setState] = useState<RealtimeState>('idle');
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);
  const connectedOnceRef = useRef(false);
  const callbacksRef = useRef({ onEvent, onConnected, onUnstable, onSessionInvalid });

  useEffect(() => {
    callbacksRef.current = { onEvent, onConnected, onUnstable, onSessionInvalid };
  }, [onConnected, onEvent, onUnstable, onSessionInvalid]);

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
    const acknowledged = new Set<string>();
    socket.onopen = () => {
      if (disposed) return;
    };
    socket.onmessage = (event) => {
      if (disposed) return;
      try {
        const payload = JSON.parse(
          typeof event.data === 'string' ? event.data : String(event.data || '')
        ) as RealtimeEvent;
        if (payload.event === 'ws.connected') {
          const reconnected = connectedOnceRef.current;
          connectedOnceRef.current = true;
          attemptRef.current = 0;
          setState('connected');
          callbacksRef.current.onConnected?.(reconnected);
        }
        callbacksRef.current.onEvent(payload);
        if (payload.event === 'message.new') {
          const message = payload.data?.message as { id?: string; senderId?: string } | undefined;
          const roomId = payload.data?.roomId;
          if (message?.id && roomId && !acknowledged.has(message.id) && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ event: 'message.ack', data: { roomId, messageId: message.id } }));
            acknowledged.add(message.id);
            if (acknowledged.size > 256) acknowledged.delete(acknowledged.values().next().value!);
          }
        }
      } catch {
        // A later authoritative sync recovers malformed frames.
      }
    };
    socket.onerror = () => {
      // The close event controls backoff and user-visible state.
    };
    socket.onclose = (event) => {
      if (disposed) return;
      if (event.code === 1008) callbacksRef.current.onSessionInvalid?.();
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
