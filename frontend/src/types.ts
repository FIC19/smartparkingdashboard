// ─────────────────────────────────────────────────────────────────────────────
// IUIU Smart Parking — Global TypeScript Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'admin'
  | 'attendant'
  | 'entrance_attendant'
  | 'exit_attendant'
  | 'entrance_display'
  | 'exit_display';

export interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string;
  is_active: boolean;
  date_joined: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARKING LOT
// ─────────────────────────────────────────────────────────────────────────────

export interface ParkingLot {
  id: string;
  name: string;
  location: string;
  is_active: boolean;
  firebase_node: string;
  lost_receipt_fee: number;
  no_plate_fee: number;
  lost_ticket_fee: number;
  total_capacity: number;
  available_slots: number;
  occupied_slots: number;
  is_full: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entrance {
  id: string;
  lot: string;
  name: string;
  sensor_id: string;
  camera_ip: string;
  servo_channel: number;
  is_active: boolean;
}

export interface Exit {
  id: string;
  lot: string;
  name: string;
  sensor_id: string;
  servo_channel: number;
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT TYPES & SLOTS
// ─────────────────────────────────────────────────────────────────────────────

export type VehicleClass = 'car' | 'truck' | 'cycle';

export interface SlotType {
  id: number;
  name: string;
  vehicle_class: VehicleClass;
  hourly_rate: number;
  flat_rate: number;
  daily_max_rate: number | null;
  grace_period_minutes: number;
  color_hex: string;
  description: string;
}

export type SlotStatus = 'vacant' | 'occupied' | 'reserved' | 'maintenance';

export interface ParkingSlot {
  id: string;
  lot: string;
  slot_type: number | null;
  slot_type_detail: SlotType | null;
  slot_number: string;
  status: SlotStatus;
  sensor_id: string;
  last_updated: string;
  // enriched by serializer
  vehicle_type?: string | null;
  license_plate?: string | null;
  entry_time?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────────────────────────────────────

export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'van' | 'truck' | 'bus';
export type PaymentMethod = 'cash' | 'mobile_money' | 'exempt';
export type TicketStatus = 'active' | 'paid' | 'exempt' | 'void';

export interface Ticket {
  id: string;
  ticket_number: string;
  lot: string;
  entrance: string | null;
  exit_gate: string | null;
  assigned_slot: string | null;
  slot_number: string | null;
  vehicle_type: VehicleType;
  license_plate: string;
  entry_time: string;
  exit_time: string | null;
  payment_method: PaymentMethod | '';
  amount_charged: number;
  is_service_exempt: boolean;
  exempt_reason: string;
  status: TicketStatus;
  attendant: string | null;
  attendant_name: string | null;
  barcode_data: string;
  ai_classification_raw: Record<string, unknown>;
  duration_hours: number;
  calculated_fee: number;
  created_at: string;
  updated_at: string;
}

export interface TicketCreatePayload {
  lot: string;
  entrance: string;
  vehicle_type: VehicleType;
  license_plate: string;
  is_service_exempt?: boolean;
  exempt_reason?: string;
}

export interface TicketCheckoutPayload {
  exit_gate?: string;
  payment_method: PaymentMethod;
  amount_charged: number;
  mobile_money_ref?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  ticket: string;
  ticket_number: string | null;
  amount: number;
  payment_method: PaymentMethod;
  mobile_money_ref: string;
  processed_by: string | null;
  processed_by_name: string | null;
  processed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export type AudioTriggerEvent =
  | 'system_start' | 'vehicle_scan' | 'access_granted' | 'access_denied'
  | 'vehicle_exit' | 'fire_alarm' | 'lot_full' | 'welcome'
  | 'slot_assignment' | 'payment_prompt' | 'payment_confirmed' | 'goodbye';

export interface AudioConfig {
  id: number;
  lot: string;
  trigger_event: AudioTriggerEvent;
  trigger_label: string;
  track_number: number;
  track_filename: string;
  volume: number;
  is_enabled: boolean;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────

export type AlertType = 'fire' | 'lot_full' | 'section_full' | 'sensor_error' | 'gate_error';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: string;
  lot: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  sensor_data: Record<string, unknown>;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user: string | null;
  username: string;
  action: string;
  action_label: string;
  target_type: string;
  target_id: string;
  detail: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotTypeBreakdown {
  occupied: number;
  total: number;
}

export interface DailyRevenue {
  day: string;
  revenue: number;
  count: number;
}

export interface LotAnalytics {
  lot_id: string;
  lot_name: string;
  total_capacity: number;
  occupied: number;
  vacant: number;
  occupancy_rate: number;
  active_tickets: number;
  tickets_today: number;
  revenue_today: number;
  revenue_week: number;
  revenue_month: number;
  by_vehicle_type: Record<string, number>;
  by_slot_type: Record<VehicleClass, SlotTypeBreakdown>;
  peak_hours: number[];       // 24-element array indexed by hour
  daily_revenue: DailyRevenue[];
}

export interface RevenueRow {
  day: string;
  revenue: number;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

export type WSMessageType =
  | 'slots_snapshot'
  | 'slot_update'
  | 'alert'
  | 'ticket_created'
  | 'ticket_closed'
  | 'new_ticket'
  | 'pong'
  | 'entrance_detected'
  | 'exit_detected'
  | 'gate_opened'
  | 'plate_scanned'
  | 'fire_alert'
  | 'device_status'
  | 'device_online'
  | 'device_offline';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESP32 DEVICE CONTROL
// ─────────────────────────────────────────────────────────────────────────────

export type DeviceType = 'entrance_unit' | 'exit_unit' | 'slot_sensor' | 'smoke_sensor';

export interface Device {
  id: number;
  device_id: string;
  name: string;
  device_type: DeviceType;
  lot: string | null;
  lot_name: string | null;
  online_status: boolean;
  last_seen: string | null;
  seconds_since_seen: number | null;
  ip_address: string | null;
  firmware_version: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type CommandType = 'open_gate' | 'close_gate' | 'lcd_update' | 'play_audio' | 'reboot' | 'set_servo';

export interface DeviceCommand {
  id: number;
  device: number;
  command_type: CommandType;
  payload: Record<string, unknown>;
  executed: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export type SensorEventType =
  | 'heartbeat'
  | 'entrance_detected'
  | 'exit_detected'
  | 'slot_occupied'
  | 'slot_vacant'
  | 'smoke_detected'
  | 'plate_scanned'
  | 'gate_opened'
  | 'gate_closed';

export interface SensorEvent {
  id: number;
  device: number;
  device_name: string;
  event_type: SensorEventType;
  payload: Record<string, unknown>;
  timestamp: string;
  processed: boolean;
}

export interface GateOpenPayload {
  device_id: string;
  gate_type: 'entrance' | 'exit';
  duration_ms?: number;
}

export interface LCDUpdatePayload {
  device_id: string;
  line1: string;
  line2?: string;
  line3?: string;
  line4?: string;
  duration_ms?: number;
}

export interface AudioPlayPayload {
  device_id: string;
  track_number: number;
  volume?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE COMMAND
// ─────────────────────────────────────────────────────────────────────────────

export interface GateCommandPayload {
  gate_type: 'entrance' | 'exit';
  gate_id: string;
  command: 'open' | 'close';
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANT ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendantAssignment {
  id: string;
  attendant: string;
  attendant_name: string;
  lot: string;
  lot_name: string;
  entrance: string | null;
  exit_gate: string | null;
  shift_start: string;
  shift_end: string | null;
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// API PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
