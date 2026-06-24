import { useCallback, useEffect, useRef } from 'react';
import type { WSMessage, WSMessageType } from '../types';

type Handler<T = unknown> = (payload: T) => void;
type HandlerMap = Partial<Record<WSMessageType, Handler<any>>>;

const RECONNECT_DELAY = 3000;

function websocketBase() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function useLotWebSocket(lotId: string, handlers: HandlerMap) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<HandlerMap>(handlers);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  const connect = useCallback(() => {
    if (!isMounted.current || !lotId) return;

    const ws = new WebSocket(`${websocketBase()}/ws/lot/${lotId}/`);
    wsRef.current = ws;

    ws.onopen = () => {
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
      ws.addEventListener('close', () => clearInterval(ping));
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSMessage;
        const handler = handlersRef.current[msg.type];
        if (handler) handler(msg.payload);
      } catch {
        // Ignore malformed websocket messages.
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => ws.close();
  }, [lotId]);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
