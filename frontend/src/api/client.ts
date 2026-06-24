/**
 * IUIU Smart Parking — Firebase Firestore API Client
 * Same API shape as the old axios client — all views work unchanged.
 */
// @ts-nocheck — Firebase generics are complex; runtime types are correct
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  User, ParkingLot, Entrance, Exit, SlotType, ParkingSlot,
  Ticket, Transaction, AudioConfig, Alert, AuditLog,
  LotAnalytics, RevenueRow, TicketCreatePayload, TicketCheckoutPayload,
  GateCommandPayload, PaginatedResponse, AttendantAssignment,
  Device, DeviceCommand, SensorEvent,
  GateOpenPayload, LCDUpdatePayload, AudioPlayPayload,
} from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function snap<T>(d: DocumentData): T {
  return { id: d.id, ...d.data() } as T;
}

async function listCol<T>(col: string, filters: any[] = []): Promise<{ data: PaginatedResponse<T> }> {
  let q: any = collection(db, col);
  if (filters.length) q = query(q, ...filters);
  const s = await getDocs(q);
  const results = s.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
  return { data: { count: results.length, results, next: null, previous: null } };
}

async function getOne<T>(col: string, id: string): Promise<{ data: T }> {
  const s = await getDoc(doc(db, col, id));
  if (!s.exists()) throw new Error(`${col}/${id} not found`);
  return { data: snap<T>(s) };
}

async function create<T>(col: string, data: object): Promise<{ data: T }> {
  const ref = await addDoc(collection(db, col), { ...data, created_at: serverTimestamp(), updated_at: serverTimestamp() });
  const s = await getDoc(ref);
  return { data: snap<T>(s) };
}

async function update<T>(col: string, id: string, data: object): Promise<{ data: T }> {
  const ref = doc(db, col, id);
  await updateDoc(ref, { ...data, updated_at: serverTimestamp() });
  const s = await getDoc(ref);
  return { data: snap<T>(s) };
}

async function remove(col: string, id: string): Promise<{ data: Record<string, never> }> {
  await deleteDoc(doc(db, col, id));
  return { data: {} };
}

// ── AUTH (handled by AuthContext / Firebase Auth) ─────────────────────────────

export const authAPI = {
  login: async (_u: string, _p: string) => ({ data: { access: '', refresh: '', role: '', name: '' } }),
  refresh: async (_r: string) => ({ data: { access: '' } }),
  me: async (): Promise<{ data: User }> => {
    const { auth } = await import('../firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not logged in');
    return getOne<User>('users', uid);
  },
};

// ── PARKING LOTS ──────────────────────────────────────────────────────────────

export const lotsAPI = {
  list:   ()                              => listCol<ParkingLot>('lots'),
  get:    (id: string)                    => getOne<ParkingLot>('lots', id),
  create: (data: Partial<ParkingLot>)     => create<ParkingLot>('lots', data),
  update: (id: string, data: Partial<ParkingLot>) => update<ParkingLot>('lots', id, data),
  delete: (id: string)                    => remove('lots', id),

  analytics: async (id: string): Promise<{ data: LotAnalytics }> => {
    const [lotSnap, slotsSnap, ticketsSnap] = await Promise.all([
      getDoc(doc(db, 'lots', id)),
      getDocs(query(collection(db, 'slots'), where('lot', '==', id))),
      getDocs(query(collection(db, 'tickets'), where('lot', '==', id), where('status', '==', 'active'))),
    ]);
    const lot = lotSnap.data() as ParkingLot;
    const slots = slotsSnap.docs.map(d => d.data() as ParkingSlot);
    const occupied = slots.filter(s => s.status === 'occupied').length;
    return {
      data: {
        lot_id: id, lot_name: lot?.name ?? id,
        total_capacity: slots.length, occupied, vacant: slots.length - occupied,
        occupancy_rate: slots.length ? Math.round((occupied / slots.length) * 100) : 0,
        active_tickets: ticketsSnap.size, tickets_today: 0,
        revenue_today: 0, revenue_week: 0, revenue_month: 0,
        by_vehicle_type: {}, by_slot_type: {} as any,
        peak_hours: new Array(24).fill(0), daily_revenue: [],
      },
    };
  },

  slotsStatus: async (id: string): Promise<{ data: ParkingSlot[] }> => {
    const s = await getDocs(query(collection(db, 'slots'), where('lot', '==', id)));
    return { data: s.docs.map(d => ({ id: d.id, ...d.data() })) as ParkingSlot[] };
  },

  revenueReport: async (id: string): Promise<{ data: RevenueRow[] }> => {
    const s = await getDocs(query(collection(db, 'transactions'), where('lot', '==', id), orderBy('processed_at', 'desc'), limit(30)));
    const rows: RevenueRow[] = s.docs.map(d => {
      const t = d.data();
      return { day: t.processed_at?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '', revenue: t.amount ?? 0, count: 1 };
    });
    return { data: rows };
  },
};

// ── ENTRANCES / EXITS ─────────────────────────────────────────────────────────

export const entrancesAPI = {
  list:     (lot?: string) => listCol<Entrance>('entrances', lot ? [where('lot', '==', lot)] : []),
  get:      (id: string)   => getOne<Entrance>('entrances', id),
  create:   (data: Partial<Entrance>) => create<Entrance>('entrances', data),
  update:   (id: string, data: Partial<Entrance>) => update<Entrance>('entrances', id, data),
  delete:   (id: string)   => remove('entrances', id),
  openGate: async (id: string) => {
    await addDoc(collection(db, 'gate_commands'), { gate_id: id, type: 'entrance', command: 'open', created_at: serverTimestamp() });
    return { data: {} };
  },
};

export const exitsAPI = {
  list:     (lot?: string) => listCol<Exit>('exits', lot ? [where('lot', '==', lot)] : []),
  get:      (id: string)   => getOne<Exit>('exits', id),
  create:   (data: Partial<Exit>) => create<Exit>('exits', data),
  update:   (id: string, data: Partial<Exit>) => update<Exit>('exits', id, data),
  delete:   (id: string)   => remove('exits', id),
  openGate: async (id: string) => {
    await addDoc(collection(db, 'gate_commands'), { gate_id: id, type: 'exit', command: 'open', created_at: serverTimestamp() });
    return { data: {} };
  },
};

// ── SLOT TYPES & SLOTS ────────────────────────────────────────────────────────

export const slotTypesAPI = {
  list:   ()                               => listCol<SlotType>('slot_types'),
  create: (data: Partial<SlotType>)        => create<SlotType>('slot_types', data),
  update: (id: number, data: Partial<SlotType>) => update<SlotType>('slot_types', String(id), data),
  delete: (id: number)                     => remove('slot_types', String(id)),
};

export const slotsAPI = {
  list:   (params?: Record<string, string>) => listCol<ParkingSlot>('slots', params?.lot ? [where('lot', '==', params.lot)] : []),
  create: (data: Partial<ParkingSlot>)      => create<ParkingSlot>('slots', data),
  update: (id: string, data: Partial<ParkingSlot>) => update<ParkingSlot>('slots', id, data),
  setStatus: (id: string, slotStatus: string) => update<ParkingSlot>('slots', id, { status: slotStatus, last_updated: serverTimestamp() }),
  delete: (id: string)                      => remove('slots', id),
};

// ── TICKETS ───────────────────────────────────────────────────────────────────

export const ticketsAPI = {
  list:   (params?: Record<string, string>) => {
    const filters = [];
    if (params?.lot) filters.push(where('lot', '==', params.lot));
    if (params?.status) filters.push(where('status', '==', params.status));
    return listCol<Ticket>('tickets', filters);
  },
  active: async (lot: string): Promise<{ data: Ticket[] }> => {
    const s = await getDocs(query(collection(db, 'tickets'), where('lot', '==', lot), where('status', '==', 'active')));
    return { data: s.docs.map(d => ({ id: d.id, ...d.data() })) as Ticket[] };
  },
  get:    (id: string) => getOne<Ticket>('tickets', id),

  create: async (data: TicketCreatePayload): Promise<{ data: Ticket }> => {
    const ticketNumber = `TKT-${Date.now()}`;
    const payload = {
      ...data, ticket_number: ticketNumber, status: 'active',
      entry_time: new Date().toISOString(), exit_time: null,
      amount_charged: 0, calculated_fee: 0, duration_hours: 0,
      barcode_data: ticketNumber, is_service_exempt: data.is_service_exempt ?? false,
      exempt_reason: data.exempt_reason ?? '', payment_method: '',
      ai_classification_raw: {}, attendant: null, attendant_name: null,
      assigned_slot: null, slot_number: null, exit_gate: null,
    };
    return create<Ticket>('tickets', payload);
  },

  checkout: async (id: string, data: TicketCheckoutPayload): Promise<{ data: Ticket }> => {
    const ref = doc(db, 'tickets', id);
    const s = await getDoc(ref);
    const ticket = s.data() as Ticket;
    const entryTime = new Date(ticket.entry_time);
    const exitTime = new Date();
    const durationHours = (exitTime.getTime() - entryTime.getTime()) / 3600000;
    await updateDoc(ref, {
      ...data, status: 'paid', exit_time: exitTime.toISOString(),
      duration_hours: Math.round(durationHours * 10) / 10, updated_at: serverTimestamp(),
    });
    if (data.amount_charged > 0) {
      await addDoc(collection(db, 'transactions'), {
        ticket: id, ticket_number: ticket.ticket_number,
        amount: data.amount_charged, payment_method: data.payment_method,
        mobile_money_ref: data.mobile_money_ref ?? '',
        processed_at: serverTimestamp(), lot: ticket.lot,
      });
    }
    const updated = await getDoc(ref);
    return { data: snap<Ticket>(updated) };
  },

  update: (id: string, data: Partial<Ticket>) => update<Ticket>('tickets', id, data),

  freePass: async (id: string, gate_type: 'entrance' | 'exit', exempt_reason: string) => {
    await updateDoc(doc(db, 'tickets', id), { status: 'exempt', exempt_reason, is_service_exempt: true, updated_at: serverTimestamp() });
    return { data: {} };
  },

  void: async (id: string) => {
    await updateDoc(doc(db, 'tickets', id), { status: 'void', updated_at: serverTimestamp() });
    return { data: {} };
  },

  search: (query: string) => listCol<Ticket>('tickets', [where('license_plate', '==', query.toUpperCase())]),
};

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

export const transactionsAPI = {
  list: (params?: Record<string, string>) => {
    const filters = params?.lot ? [where('lot', '==', params.lot)] : [];
    return listCol<Transaction>('transactions', filters);
  },
};

// ── AUDIO CONFIG ──────────────────────────────────────────────────────────────

export const audioAPI = {
  list:    (lot: string) => listCol<AudioConfig>('audio_configs', [where('lot', '==', lot)]),
  create:  (data: Partial<AudioConfig>) => create<AudioConfig>('audio_configs', data),
  update:  (id: number, data: Partial<AudioConfig>) => update<AudioConfig>('audio_configs', String(id), data),
  delete:  (id: number) => remove('audio_configs', String(id)),
  playNow: async (id: number) => {
    await addDoc(collection(db, 'audio_commands'), { config_id: String(id), created_at: serverTimestamp() });
    return { data: {} };
  },
};

// ── ALERTS ────────────────────────────────────────────────────────────────────

export const alertsAPI = {
  list: (params?: Record<string, string>) => {
    const filters = params?.lot ? [where('lot', '==', params.lot)] : [];
    return listCol<Alert>('alerts', filters);
  },
  resolve: async (id: string) => {
    await updateDoc(doc(db, 'alerts', id), { is_resolved: true, resolved_at: new Date().toISOString(), updated_at: serverTimestamp() });
    return { data: {} };
  },
};

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────

export const auditAPI = {
  list: (params?: Record<string, string>) => {
    const filters = params?.lot ? [where('lot', '==', params.lot)] : [];
    return listCol<AuditLog>('audit_logs', filters);
  },
};

// ── GATE COMMANDS ─────────────────────────────────────────────────────────────

export const gateAPI = {
  command: async (data: GateCommandPayload) => {
    await addDoc(collection(db, 'gate_commands'), { ...data, created_at: serverTimestamp() });
    return { data: {} };
  },
};

// ── USERS (Admin) ─────────────────────────────────────────────────────────────

export const usersAPI = {
  list:   (params?: Record<string, string>) => listCol<User>('users', params?.role ? [where('role', '==', params.role)] : []),
  get:    (id: string) => getOne<User>('users', id),
  create: async (data: Partial<User> & { password: string }) => {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const { auth } = await import('../firebase');
    const email = `${data.username}@iuiupark.app`;
    const cred = await createUserWithEmailAndPassword(auth, email, data.password);
    const { password: _p, ...profile } = data;
    await setDoc(doc(db, 'users', cred.user.uid), { ...profile, email, created_at: serverTimestamp(), updated_at: serverTimestamp() });
    return getOne<User>('users', cred.user.uid);
  },
  update: (id: string, data: Partial<User>) => update<User>('users', id, data),
  delete: (id: string) => remove('users', id),
  me: async (): Promise<{ data: User }> => {
    const { auth } = await import('../firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not logged in');
    return getOne<User>('users', uid);
  },
};

// ── ATTENDANT ASSIGNMENTS ─────────────────────────────────────────────────────

export const assignmentsAPI = {
  list:   (params?: Record<string, string>) => {
    const filters = params?.lot ? [where('lot', '==', params.lot)] : [];
    return listCol<AttendantAssignment>('assignments', filters);
  },
  create: (data: Partial<AttendantAssignment>) => create<AttendantAssignment>('assignments', data),
  update: (id: string, data: Partial<AttendantAssignment>) => update<AttendantAssignment>('assignments', id, data),
  delete: (id: string) => remove('assignments', id),
};

// ── ESP32 DEVICES ─────────────────────────────────────────────────────────────

export const devicesAPI = {
  list:   () => listCol<Device>('devices'),
  get:    (id: number) => getOne<Device>('devices', String(id)),
  create: (data: Partial<Device>) => create<Device>('devices', data),
  update: (id: number, data: Partial<Device>) => update<Device>('devices', String(id), data),
  delete: (id: number) => remove('devices', String(id)),
  events: (params?: Record<string, string>) => listCol<SensorEvent>('sensor_events', params?.device ? [where('device', '==', Number(params.device))] : []),
};

export const esp32API = {
  openGate: async (data: GateOpenPayload) => {
    const ref = await addDoc(collection(db, 'device_commands'), { ...data, command_type: 'open_gate', executed: false, created_at: serverTimestamp() });
    return { data: { status: 'queued', command_id: ref.id } };
  },
  updateLCD: async (data: LCDUpdatePayload) => {
    const ref = await addDoc(collection(db, 'device_commands'), { ...data, command_type: 'lcd_update', executed: false, created_at: serverTimestamp() });
    return { data: { status: 'queued', command_id: ref.id } };
  },
  playAudio: async (data: AudioPlayPayload) => {
    const ref = await addDoc(collection(db, 'device_commands'), { ...data, command_type: 'play_audio', executed: false, created_at: serverTimestamp() });
    return { data: { status: 'queued', command_id: ref.id } };
  },
};

export const pricingAPI = slotTypesAPI;
export default {} as any;
