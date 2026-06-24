/**
 * IUIU Smart Parking — Device Event WebSocket Hook
 * Connects to ws://host/ws/devices/ and dispatches typed hardware events
 * (device_status, gate_opened, fire_alert) to registered handlers.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { WSMessageType } from '../types';

type Handler<T = unknown> = (payload: T) => void;
type HandlerMap = Partial<Record<WSMessageType, Handler<any>>>;

const WS_BASE           = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const RECONNECT_DELAY   = 3000;

export function useDeviceWebSocket(handlers: HandlerMap) {
  const wsRef          = useRef<WebSocket | null>(null);
  const handlersRef    = useRef<HandlerMap>(handlers);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted      = useRef(true);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    const stored = localStorage.getItem('tokens');
    const token  = stored ? (JSON.parse(stored) as { access: string }).access : '';
    const url    = `${WS_BASE}/ws/devices/?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.info('[DeviceWS] Connected');
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 30_000);
      ws.addEventListener('close', () => clearInterval(ping));
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const handler = handlersRef.current[msg.type as WSMessageType];
        if (handler) handler(msg.payload);
      } catch {}
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => ws.close();
  }, []);

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
