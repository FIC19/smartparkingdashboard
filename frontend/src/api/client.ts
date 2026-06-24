/**
 * IUIU Smart Parking — Axios API Client
 * Centralises all REST calls with JWT auth, token refresh, and typed helpers.
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  AuthTokens, User, ParkingLot, Entrance, Exit,
  SlotType, ParkingSlot, Ticket, Transaction,
  AudioConfig, Alert, AuditLog, LotAnalytics, RevenueRow,
  TicketCreatePayload, TicketCheckoutPayload,
  GateCommandPayload, PaginatedResponse, AttendantAssignment,
  Device, DeviceCommand, SensorEvent,
  GateOpenPayload, LCDUpdatePayload, AudioPlayPayload,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT access token to every request
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('tokens');
  if (stored) {
    try {
      const tokens: AuthTokens = JSON.parse(stored);
      config.headers!['Authorization'] = `Bearer ${tokens.access}`;
    } catch {}
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const stored = localStorage.getItem('tokens');
      if (stored) {
        try {
          const tokens: AuthTokens = JSON.parse(stored);
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, {
            refresh: tokens.refresh,
          });
          const newTokens: AuthTokens = { ...tokens, access: data.access };
          localStorage.setItem('tokens', JSON.stringify(newTokens));
          original.headers = { ...original.headers, Authorization: `Bearer ${data.access}` };
          return api(original);
        } catch {
          localStorage.removeItem('tokens');
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (username: string, password: string) =>
    api.post<AuthTokens & { role: string; name: string }>('/auth/token/', { username, password }),
  refresh: (refresh: string) =>
    api.post<{ access: string }>('/auth/token/refresh/', { refresh }),
  me: () => api.get<User>('/users/me/'),
};

// ─────────────────────────────────────────────────────────────────────────────
// PARKING LOTS
// ─────────────────────────────────────────────────────────────────────────────

export const lotsAPI = {
  list:         ()          => api.get<PaginatedResponse<ParkingLot>>('/lots/'),
  get:          (id: string) => api.get<ParkingLot>(`/lots/${id}/`),
  create:       (data: Partial<ParkingLot>) => api.post<ParkingLot>('/lots/', data),
  update:       (id: string, data: Partial<ParkingLot>) => api.patch<ParkingLot>(`/lots/${id}/`, data),
  delete:       (id: string) => api.delete(`/lots/${id}/`),
  analytics:    (id: string) => api.get<LotAnalytics>(`/lots/${id}/analytics/`),
  slotsStatus:  (id: string) => api.get<ParkingSlot[]>(`/lots/${id}/slots_status/`),
  revenueReport:(id: string) => api.get<RevenueRow[]>(`/lots/${id}/revenue_report/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTRANCES / EXITS
// ─────────────────────────────────────────────────────────────────────────────

export const entrancesAPI = {
  list:      (lot?: string) => api.get<PaginatedResponse<Entrance>>('/entrances/', { params: { lot } }),
  get:       (id: string)   => api.get<Entrance>(`/entrances/${id}/`),
  create:    (data: Partial<Entrance>) => api.post<Entrance>('/entrances/', data),
  update:    (id: string, data: Partial<Entrance>) => api.patch<Entrance>(`/entrances/${id}/`, data),
  delete:    (id: string)   => api.delete(`/entrances/${id}/`),
  openGate:  (id: string)   => api.post(`/entrances/${id}/open_gate/`),
};

export const exitsAPI = {
  list:     (lot?: string) => api.get<PaginatedResponse<Exit>>('/exits/', { params: { lot } }),
  get:      (id: string)   => api.get<Exit>(`/exits/${id}/`),
  create:   (data: Partial<Exit>) => api.post<Exit>('/exits/', data),
  update:   (id: string, data: Partial<Exit>) => api.patch<Exit>(`/exits/${id}/`, data),
  delete:   (id: string)   => api.delete(`/exits/${id}/`),
  openGate: (id: string)   => api.post(`/exits/${id}/open_gate/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// SLOT TYPES & SLOTS
// ─────────────────────────────────────────────────────────────────────────────

export const slotTypesAPI = {
  list:   () => api.get<PaginatedResponse<SlotType>>('/slot-types/'),
  create: (data: Partial<SlotType>) => api.post<SlotType>('/slot-types/', data),
  update: (id: number, data: Partial<SlotType>) => api.patch<SlotType>(`/slot-types/${id}/`, data),
  delete: (id: number) => api.delete(`/slot-types/${id}/`),
};

export const slotsAPI = {
  list:      (params?: Record<string, string>) => api.get<PaginatedResponse<ParkingSlot>>('/slots/', { params }),
  create:    (data: Partial<ParkingSlot>) => api.post<ParkingSlot>('/slots/', data),
  update:    (id: string, data: Partial<ParkingSlot>) => api.patch<ParkingSlot>(`/slots/${id}/`, data),
  setStatus: (id: string, slotStatus: string) => api.patch(`/slots/${id}/set_status/`, { status: slotStatus }),
  delete:    (id: string) => api.delete(`/slots/${id}/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────────────────────────────────────

export const ticketsAPI = {
  list:     (params?: Record<string, string>) => api.get<PaginatedResponse<Ticket>>('/tickets/', { params }),
  active:   (lot: string) => api.get<Ticket[]>('/tickets/active/', { params: { lot } }),
  get:      (id: string)  => api.get<Ticket>(`/tickets/${id}/`),
  create:   (data: TicketCreatePayload) => api.post<Ticket>('/tickets/', data),
  checkout: (id: string, data: TicketCheckoutPayload) =>
              api.post<Ticket>(`/tickets/${id}/checkout/`, data),
  update:   (id: string, data: Partial<Ticket>) => api.patch<Ticket>(`/tickets/${id}/`, data),
  freePass: (id: string, gate_type: 'entrance' | 'exit', exempt_reason: string) =>
              api.post(`/tickets/${id}/free_pass/`, { gate_type, exempt_reason }),
  void:     (id: string) => api.post(`/tickets/${id}/void/`),
  search:   (query: string) => api.get<PaginatedResponse<Ticket>>('/tickets/', {
              params: { search: query, status: 'active' }
            }),
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const transactionsAPI = {
  list: (params?: Record<string, string>) =>
    api.get<PaginatedResponse<Transaction>>('/transactions/', { params }),
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const audioAPI = {
  list:    (lot: string) => api.get<PaginatedResponse<AudioConfig>>('/audio/', { params: { lot } }),
  create:  (data: Partial<AudioConfig>) => api.post<AudioConfig>('/audio/', data),
  update:  (id: number, data: Partial<AudioConfig>) => api.patch<AudioConfig>(`/audio/${id}/`, data),
  delete:  (id: number) => api.delete(`/audio/${id}/`),
  playNow: (id: number) => api.post(`/audio/${id}/play_now/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

export const alertsAPI = {
  list:    (params?: Record<string, string>) => api.get<PaginatedResponse<Alert>>('/alerts/', { params }),
  resolve: (id: string) => api.post<Alert>(`/alerts/${id}/resolve/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────

export const auditAPI = {
  list: (params?: Record<string, string>) =>
    api.get<PaginatedResponse<AuditLog>>('/audit-logs/', { params }),
};

// ─────────────────────────────────────────────────────────────────────────────
// GATE COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

export const gateAPI = {
  command: (data: GateCommandPayload) => api.post('/gates/command/', data),
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS (Admin only)
// ─────────────────────────────────────────────────────────────────────────────

export const usersAPI = {
  list:   (params?: Record<string, string>) =>
            api.get<PaginatedResponse<User>>('/users/', { params }),
  get:    (id: string) => api.get<User>(`/users/${id}/`),
  create: (data: Partial<User> & { password: string }) =>
            api.post<User>('/users/', data),
  update: (id: string, data: Partial<User>) =>
            api.patch<User>(`/users/${id}/`, data),
  delete: (id: string) => api.delete(`/users/${id}/`),
  me:     () => api.get<User>('/users/me/'),
};

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANT ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const assignmentsAPI = {
  list:   (params?: Record<string, string>) =>
            api.get<PaginatedResponse<AttendantAssignment>>('/assignments/', { params }),
  create: (data: Partial<AttendantAssignment>) =>
            api.post<AttendantAssignment>('/assignments/', data),
  update: (id: string, data: Partial<AttendantAssignment>) =>
            api.patch<AttendantAssignment>(`/assignments/${id}/`, data),
  delete: (id: string) => api.delete(`/assignments/${id}/`),
};

// ─────────────────────────────────────────────────────────────────────────────
// ESP32 DEVICE CONTROL
// ─────────────────────────────────────────────────────────────────────────────

export const devicesAPI = {
  list:   () => api.get<Device[]>('/devices/'),
  get:    (id: number) => api.get<Device>(`/devices/${id}/`),
  create: (data: Partial<Device>) => api.post<Device>('/devices/', data),
  update: (id: number, data: Partial<Device>) => api.patch<Device>(`/devices/${id}/`, data),
  delete: (id: number) => api.delete(`/devices/${id}/`),
  events: (params?: Record<string, string>) =>
    api.get<SensorEvent[]>('/devices/events/', { params }),
};

export const esp32API = {
  openGate:  (data: GateOpenPayload) =>
    api.post<{ status: string; command_id: number }>('/gate/open/', data),
  updateLCD: (data: LCDUpdatePayload) =>
    api.post<{ status: string; command_id: number }>('/lcd/update/', data),
  playAudio: (data: AudioPlayPayload) =>
    api.post<{ status: string; command_id: number }>('/audio/play/', data),
};

// ─────────────────────────────────────────────────────────────────────────────
// SLOT TYPES (pricing)
// ─────────────────────────────────────────────────────────────────────────────

export const pricingAPI = slotTypesAPI;

export default api;
