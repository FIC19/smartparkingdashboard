/**
 * IUIU Smart Parking — Real-time WebSocket Hook
 * Connects to the Django Channels lot-status consumer and
 * dispatches typed messages to registered handlers.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage, WSMessageType } from '../types';

type Handler<T = unknown> = (payload: T) => void;
type HandlerMap = Partial<Record<WSMessageType, Handler<any>>>;

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const RECONNECT_DELAY_MS = 3000;

export function useLotWebSocket(lotId: string, handlers: HandlerMap) {
  const wsRef          = useRef<WebSocket | null>(null);
  const handlersRef    = useRef<HandlerMap>(handlers);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted      = useRef(true);

  // Keep handlers ref up-to-date without re-connecting
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    const stored = localStorage.getItem('tokens');
    const token  = stored ? (JSON.parse(stored) as { access: string }).access : '';
    const url    = `${WS_BASE}/ws/lot/${lotId}/?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.info(`[WS] Connected to lot ${lotId}`);
      // Start keepalive ping every 30 s
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
      ws.addEventListener('close', () => clearInterval(pingInterval));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data as string);
        const handler = handlersRef.current[msg.type];
        if (handler) handler(msg.payload);
      } catch (e) {
        console.warn('[WS] Failed to parse message', e);
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      console.info(`[WS] Disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms`);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error', err);
      ws.close();
    };
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

  /** Send a message directly over the socket. */
  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
