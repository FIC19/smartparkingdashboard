/**
 * IUIU Smart Parking — Firebase Realtime Database hook
 * Replaces the WebSocket hook with the same interface.
 * Listens to /lots/{lotId}/realtime in Firebase RTDB.
 */
import { useEffect, useRef, useCallback } from 'react';
import { ref, onValue, set, off } from 'firebase/database';
import { rtdb } from '../firebase';
import type { WSMessage, WSMessageType } from '../types';

type Handler<T = unknown> = (payload: T) => void;
type HandlerMap = Partial<Record<WSMessageType, Handler<any>>>;

export function useLotWebSocket(lotId: string, handlers: HandlerMap) {
  const handlersRef = useRef<HandlerMap>(handlers);
  const isMounted   = useRef(true);

  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  useEffect(() => {
    isMounted.current = true;
    const lotRef = ref(rtdb, `lots/${lotId}/realtime`);

    const unsub = onValue(lotRef, (snapshot) => {
      if (!isMounted.current) return;
      const data = snapshot.val();
      if (!data) return;

      const msg: WSMessage = data;
      const handler = handlersRef.current[msg.type];
      if (handler) handler(msg.payload);
    });

    return () => {
      isMounted.current = false;
      off(lotRef, 'value', unsub);
    };
  }, [lotId]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const lotRef = ref(rtdb, `lots/${lotId}/commands`);
    set(lotRef, { ...msg, timestamp: Date.now() });
  }, [lotId]);

  return { send };
}
