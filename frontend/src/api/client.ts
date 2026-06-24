import axios from 'axios';
import type {
  Alert, AttendantAssignment, AudioConfig, AudioPlayPayload, AuditLog,
  Device, GateCommandPayload, GateOpenPayload, LCDUpdatePayload,
  LotAnalytics, ParkingLot, ParkingSlot, RevenueRow, SensorEvent, SlotType,
  Ticket, TicketCheckoutPayload, TicketCreatePayload, Transaction, User,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

api.interceptors.request.use(config => {
  const raw = localStorage.getItem('tokens');
  if (raw) {
    try {
      const { access } = JSON.parse(raw) as { access?: string };
      if (access) config.headers.Authorization = `Bearer ${access}`;
    } catch {
      localStorage.removeItem('tokens');
    }
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    const detail = error.response?.data?.detail;
    const message = error.response?.data?.error;
    if (detail || message) error.message = detail ?? message;
    return Promise.reject(error);
  },
);

const cleanParams = (params?: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/token/', { username, password }),
  refresh: (refresh: string) =>
    api.post('/auth/token/refresh/', { refresh }),
  me: () => api.get<User>('/users/me/'),
};

export const lotsAPI = {
  list:   () => api.get('/lots/'),
  get:    (id: string) => api.get<ParkingLot>(`/lots/${id}/`),
  create: (data: Partial<ParkingLot>) => api.post<ParkingLot>('/lots/', data),
  update: (id: string, data: Partial<ParkingLot>) => api.patch<ParkingLot>(`/lots/${id}/`, data),
  delete: (id: string) => api.delete(`/lots/${id}/`),
  analytics: (id: string) => api.get<LotAnalytics>(`/lots/${id}/analytics/`),
  slotsStatus: (id: string) => api.get<ParkingSlot[]>(`/lots/${id}/slots_status/`),
  revenueReport: (id: string) => api.get<RevenueRow[]>(`/lots/${id}/revenue_report/`),
};

export const entrancesAPI = {
  list:   (lot?: string) => api.get('/entrances/', { params: cleanParams({ lot }) }),
  get:    (id: string) => api.get(`/entrances/${id}/`),
  create: (data: object) => api.post('/entrances/', data),
  update: (id: string, data: object) => api.patch(`/entrances/${id}/`, data),
  delete: (id: string) => api.delete(`/entrances/${id}/`),
  openGate: (id: string) => api.post(`/entrances/${id}/open_gate/`),
};

export const exitsAPI = {
  list:   (lot?: string) => api.get('/exits/', { params: cleanParams({ lot }) }),
  get:    (id: string) => api.get(`/exits/${id}/`),
  create: (data: object) => api.post('/exits/', data),
  update: (id: string, data: object) => api.patch(`/exits/${id}/`, data),
  delete: (id: string) => api.delete(`/exits/${id}/`),
  openGate: (id: string) => api.post(`/exits/${id}/open_gate/`),
};

export const slotTypesAPI = {
  list:   () => api.get('/slot-types/'),
  create: (data: Partial<SlotType>) => api.post<SlotType>('/slot-types/', data),
  update: (id: number, data: Partial<SlotType>) => api.patch<SlotType>(`/slot-types/${id}/`, data),
  delete: (id: number) => api.delete(`/slot-types/${id}/`),
};

export const slotsAPI = {
  list:      (params?: Record<string, string>) => api.get('/slots/', { params: cleanParams(params) }),
  create:    (data: Partial<ParkingSlot>) => api.post<ParkingSlot>('/slots/', data),
  update:    (id: string, data: Partial<ParkingSlot>) => api.patch<ParkingSlot>(`/slots/${id}/`, data),
  setStatus: (id: string, status: string) => api.patch<ParkingSlot>(`/slots/${id}/set_status/`, { status }),
  delete:    (id: string) => api.delete(`/slots/${id}/`),
};

export const ticketsAPI = {
  list: (params?: Record<string, string>) => api.get('/tickets/', { params: cleanParams(params) }),
  active: (lot: string) => api.get<Ticket[]>('/tickets/active/', { params: cleanParams({ lot }) }),
  get: (id: string) => api.get<Ticket>(`/tickets/${id}/`),
  create: (data: TicketCreatePayload) => api.post<Ticket>('/tickets/', data),
  checkout: (id: string, data: TicketCheckoutPayload) => api.post<Ticket>(`/tickets/${id}/checkout/`, data),
  update: (id: string, data: Partial<Ticket>) => api.patch<Ticket>(`/tickets/${id}/`, data),
  freePass: (id: string, gate_type: 'entrance' | 'exit', exempt_reason: string) =>
    api.post(`/tickets/${id}/free_pass/`, { gate_type, exempt_reason }),
  void: (id: string) => api.post<Ticket>(`/tickets/${id}/void/`),
  search: (search: string) => api.get('/tickets/', { params: cleanParams({ search }) }),
};

export const transactionsAPI = {
  list: (params?: Record<string, string>) => api.get('/transactions/', { params: cleanParams(params) }),
};

export const audioAPI = {
  list:    (lot: string) => api.get('/audio/', { params: cleanParams({ lot }) }),
  create:  (data: Partial<AudioConfig>) => api.post<AudioConfig>('/audio/', data),
  update:  (id: number, data: Partial<AudioConfig>) => api.patch<AudioConfig>(`/audio/${id}/`, data),
  delete:  (id: number) => api.delete(`/audio/${id}/`),
  playNow: (id: number) => api.post(`/audio/${id}/play_now/`),
};

export const alertsAPI = {
  list: (params?: Record<string, string>) => api.get('/alerts/', { params: cleanParams(params) }),
  resolve: (id: string) => api.post<Alert>(`/alerts/${id}/resolve/`),
};

export const auditAPI = {
  list: (params?: Record<string, string>) => api.get('/audit-logs/', { params: cleanParams(params) }),
};

export const gateAPI = {
  command: (data: GateCommandPayload) => api.post('/gates/command/', data),
};

export const usersAPI = {
  list:   (params?: Record<string, string>) => api.get('/users/', { params: cleanParams(params) }),
  get:    (id: string) => api.get<User>(`/users/${id}/`),
  create: (data: Partial<User> & { password: string }) => api.post<User>('/users/', data),
  update: (id: string, data: Partial<User>) => api.patch<User>(`/users/${id}/`, data),
  delete: (id: string) => api.delete(`/users/${id}/`),
  me:     () => authAPI.me(),
};

export const assignmentsAPI = {
  list:   (params?: Record<string, string>) => api.get('/assignments/', { params: cleanParams(params) }),
  create: (data: Partial<AttendantAssignment>) => api.post<AttendantAssignment>('/assignments/', data),
  update: (id: string, data: Partial<AttendantAssignment>) => api.patch<AttendantAssignment>(`/assignments/${id}/`, data),
  delete: (id: string) => api.delete(`/assignments/${id}/`),
};

export const devicesAPI = {
  list:   () => api.get('/devices/'),
  get:    (id: number) => api.get<Device>(`/devices/${id}/`),
  create: (data: Partial<Device>) => api.post<Device>('/devices/', data),
  update: (id: number, data: Partial<Device>) => api.patch<Device>(`/devices/${id}/`, data),
  delete: (id: number) => api.delete(`/devices/${id}/`),
  events: (params?: Record<string, string>) => api.get<SensorEvent[]>('/devices/events/', { params: cleanParams(params) }),
};

export const esp32API = {
  openGate:  (data: GateOpenPayload) => api.post('/gate/open/', data),
  updateLCD: (data: LCDUpdatePayload) => api.post('/lcd/update/', data),
  playAudio: (data: AudioPlayPayload) => api.post('/audio/play/', data),
};

export const pricingAPI = slotTypesAPI;
export default api;
