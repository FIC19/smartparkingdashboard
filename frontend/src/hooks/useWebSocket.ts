import { useEffect, useRef, useCallback } from 'react';
import { ref, onValue, set } from 'firebase/database';
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

    // onValue returns the unsubscribe function directly in modular Firebase v9+
    const unsubscribe = onValue(lotRef, (snapshot) => {
      if (!isMounted.current) return;
      const data = snapshot.val() as WSMessage | null;
      if (!data?.type) return;
      const handler = handlersRef.current[data.type];
      if (handler) handler(data.payload);
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [lotId]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const cmdRef = ref(rtdb, `lots/${lotId}/commands`);
    set(cmdRef, { ...msg, timestamp: Date.now() });
  }, [lotId]);

  return { send };
}
