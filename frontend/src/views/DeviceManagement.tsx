/**
 * IUIU Smart Parking — Device Management Page
 * ============================================
 * Admin page showing all registered ESP32 devices with live online/offline
 * status, heartbeat timestamps, firmware version, and event log.
 * Updates in real-time via the /ws/devices/ WebSocket.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { devicesAPI, esp32API } from '../api/client';
import { useDeviceWebSocket } from '../hooks/useDeviceWebSocket';
import type { Device, ParkingLot, SensorEvent } from '../types';

// ── Palette ────────────────────────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d',
  bg: '#f0fdf4', card: '#ffffff',
  border: '#d1fae5', text: '#111827',
  muted: '#6b7280', danger: '#dc2626',
  amber: '#d97706', blue: '#2563eb',
};

// ── Types ──────────────────────────────────────────────────────────────────
const DEVICE_TYPE_LABELS: Record<string, string> = {
  entrance_unit: 'Entrance Unit',
  exit_unit:     'Exit Unit',
  slot_sensor:   'Slot Sensor',
  smoke_sensor:  'Smoke Sensor',
};
const DEVICE_TYPE_ICONS: Record<string, string> = {
  entrance_unit: '🚪',
  exit_unit:     '🔚',
  slot_sensor:   '🅿️',
  smoke_sensor:  '🔥',
};

interface Props {
  lots:      ParkingLot[];
  showToast: (msg: string) => void;
}

// ── Helper ─────────────────────────────────────────────────────────────────
function formatAge(seconds: number | null): string {
  if (seconds === null) return 'Never';
  if (seconds < 5)   return 'Just now';
  if (seconds < 60)  return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DeviceManagement({ lots, showToast }: Props) {
  const [devices,   setDevices]   = useState<Device[]>([]);
  const [events,    setEvents]    = useState<SensorEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'events'>('devices');
  const [ticker,    setTicker]    = useState<number>(0); // force re-render for age

  // Refresh ages every 5 s
  useEffect(() => {
    const t = setInterval(() => setTicker(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const res = await devicesAPI.list();
      const arr = Array.isArray(res.data) ? res.data :
                  (res.data as any)?.results ?? [];
      setDevices(arr);
    } catch (e) {
      console.error('Device load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await devicesAPI.events({ limit: '100' });
      const arr = Array.isArray(res.data) ? res.data :
                  (res.data as any)?.results ?? [];
      setEvents(arr);
    } catch {}
  }, []);

  useEffect(() => { loadDevices(); loadEvents(); }, [loadDevices, loadEvents]);

  // Live device status via WebSocket
  useDeviceWebSocket({
    device_status: (payload: any) => {
      setDevices(prev => prev.map(d =>
        d.device_id === payload.device_id
          ? { ...d, online_status: true, last_seen: payload.last_seen, seconds_since_seen: 0 }
          : d
      ));
    },
  });

  // ── Send LCD update ──────────────────────────────────────────────────────
  const handleSendLCD = useCallback(async (deviceId: string) => {
    const msg = prompt('Enter LCD message (max 20 chars per line):\nLine 1:');
    if (!msg) return;
    try {
      await esp32API.updateLCD({ device_id: deviceId, line1: msg.slice(0, 20) });
      showToast('LCD command sent');
    } catch { showToast('Failed to send LCD command'); }
  }, [showToast]);

  // ── Send gate open ───────────────────────────────────────────────────────
  const handleOpenGate = useCallback(async (device: Device) => {
    const gateType = device.device_type === 'exit_unit' ? 'exit' : 'entrance';
    try {
      await esp32API.openGate({ device_id: device.device_id, gate_type: gateType });
      showToast(`🚪 Gate open command sent to ${device.name}`);
    } catch { showToast('Failed to send gate command'); }
  }, [showToast]);

  // ── Assign lot ───────────────────────────────────────────────────────────
  const handleAssignLot = useCallback(async (device: Device, lotId: string) => {
    try {
      const res = await devicesAPI.update(device.id, { lot: lotId || null });
      setDevices(prev => prev.map(d => d.id === device.id ? res.data : d));
      showToast('Device updated');
    } catch { showToast('Failed to update device'); }
  }, [showToast]);

  // ── Delete device ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (device: Device) => {
    if (!confirm(`Delete device "${device.name}" (${device.device_id})?`)) return;
    try {
      await devicesAPI.delete(device.id);
      setDevices(prev => prev.filter(d => d.id !== device.id));
      showToast('Device deleted');
    } catch { showToast('Failed to delete device'); }
  }, [showToast]);

  const online  = devices.filter(d => d.online_status).length;
  const offline = devices.filter(d => !d.online_status).length;

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <h2 style={S.pageTitle}>📡 Device Management</h2>
          <p style={S.pageSub}>ESP32 hardware controllers connected to this system</p>
        </div>
        <button style={S.addBtn} onClick={() => { setEditDevice(null); setShowForm(true); }}>
          + Register Device
        </button>
      </div>

      {/* Stats row */}
      <div style={S.statsRow}>
        {[
          { label: 'Total Devices', value: devices.length, icon: '📡', color: G.blue },
          { label: 'Online',        value: online,          icon: '🟢', color: G.primary },
          { label: 'Offline',       value: offline,         icon: '🔴', color: G.danger },
          { label: 'Events Today',  value: events.length,   icon: '📋', color: G.amber },
        ].map(stat => (
          <div key={stat.label} style={S.statCard}>
            <div style={{ fontSize: 24 }}>{stat.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: G.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={S.tabs}>
        {(['devices', 'events'] as const).map(tab => (
          <button
            key={tab}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'devices' ? '📡 Devices' : '📋 Event Log'}
          </button>
        ))}
        <button style={S.refreshBtn} onClick={() => { loadDevices(); loadEvents(); }}>
          ↻ Refresh
        </button>
      </div>

      {/* Devices tab */}
      {activeTab === 'devices' && (
        loading ? (
          <div style={S.loading}>Loading devices…</div>
        ) : devices.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 16, color: G.muted }}>No devices registered yet.</div>
            <div style={{ fontSize: 13, color: G.muted, marginTop: 4 }}>
              Devices auto-register when they first connect and send a heartbeat.
            </div>
          </div>
        ) : (
          <div style={S.deviceGrid}>
            {devices.map(device => (
              <DeviceCard
                key={device.id}
                device={device}
                lots={lots}
                onAssignLot={handleAssignLot}
                onOpenGate={handleOpenGate}
                onSendLCD={handleSendLCD}
                onDelete={handleDelete}
                ticker={ticker}
              />
            ))}
          </div>
        )
      )}

      {/* Event log tab */}
      {activeTab === 'events' && (
        <div style={S.eventTable}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                {['Time', 'Device', 'Event Type', 'Payload', 'Processed'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: G.muted }}>No events yet</td></tr>
              ) : events.map(ev => (
                <tr key={ev.id} style={{ borderBottom: `1px solid #f3f4f6` }}>
                  <td style={S.td}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                  <td style={S.td}>{ev.device_name}</td>
                  <td style={S.td}>
                    <span style={{ ...S.badge, background: eventBadgeColor(ev.event_type) }}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {JSON.stringify(ev.payload)}
                  </td>
                  <td style={S.td}>{ev.processed ? '✅' : '⏳'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register / Edit device form */}
      {showForm && (
        <DeviceForm
          device={editDevice}
          lots={lots}
          onSave={async (data) => {
            try {
              if (editDevice) {
                const res = await devicesAPI.update(editDevice.id, data);
                setDevices(prev => prev.map(d => d.id === editDevice.id ? res.data : d));
                showToast('Device updated');
              } else {
                const res = await devicesAPI.create(data);
                setDevices(prev => [...prev, res.data]);
                showToast('Device registered');
              }
              setShowForm(false);
            } catch { showToast('Failed to save device'); }
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Device Card ────────────────────────────────────────────────────────────
function DeviceCard({
  device, lots, ticker,
  onAssignLot, onOpenGate, onSendLCD, onDelete,
}: {
  device:       Device;
  lots:         ParkingLot[];
  ticker:       number;
  onAssignLot:  (d: Device, lotId: string) => void;
  onOpenGate:   (d: Device) => void;
  onSendLCD:    (deviceId: string) => void;
  onDelete:     (d: Device) => void;
}) {
  const isGate = device.device_type === 'entrance_unit' || device.device_type === 'exit_unit';

  return (
    <div style={{
      ...S.card,
      borderLeft: `4px solid ${device.online_status ? G.primary : '#e5e7eb'}`,
    }}>
      {/* Card header */}
      <div style={S.cardHeader}>
        <div style={S.cardIcon}>{DEVICE_TYPE_ICONS[device.device_type] ?? '📡'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.cardName}>{device.name}</div>
          <div style={S.cardId}>{device.device_id}</div>
        </div>
        <span style={{
          ...S.statusPill,
          background: device.online_status ? '#dcfce7' : '#fee2e2',
          color: device.online_status ? '#166534' : '#991b1b',
        }}>
          {device.online_status ? '● ONLINE' : '● OFFLINE'}
        </span>
      </div>

      {/* Info grid */}
      <div style={S.infoGrid}>
        <Info label="Type"     value={DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type} />
        <Info label="IP"       value={device.ip_address ?? '—'} mono />
        <Info label="Firmware" value={device.firmware_version || '—'} mono />
        <Info label="Last Seen" value={formatAge(device.seconds_since_seen)} />
        <Info label="Lot" value={device.lot_name ?? 'Unassigned'} />
      </div>

      {/* Assign lot */}
      <div style={{ marginBottom: 10 }}>
        <label style={S.miniLabel}>Assign to Lot</label>
        <select
          style={S.select}
          value={device.lot ?? ''}
          onChange={e => onAssignLot(device, e.target.value)}
        >
          <option value="">— Unassigned —</option>
          {lots.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div style={S.cardActions}>
        {isGate && (
          <button
            style={{ ...S.actionBtn, background: '#dcfce7', color: '#166534' }}
            onClick={() => onOpenGate(device)}
          >
            🚪 Open Gate
          </button>
        )}
        <button
          style={{ ...S.actionBtn, background: '#eff6ff', color: '#1d4ed8' }}
          onClick={() => onSendLCD(device.device_id)}
        >
          💬 LCD
        </button>
        <button
          style={{ ...S.actionBtn, background: '#fef2f2', color: G.danger }}
          onClick={() => onDelete(device)}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: G.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: G.text, fontFamily: mono ? 'monospace' : 'inherit', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Device Form ────────────────────────────────────────────────────────────
function DeviceForm({
  device, lots, onSave, onCancel,
}: {
  device:   Device | null;
  lots:     ParkingLot[];
  onSave:   (data: Partial<Device>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Device>>({
    device_id:   device?.device_id   ?? '',
    name:        device?.name        ?? '',
    device_type: device?.device_type ?? 'entrance_unit',
    lot:         device?.lot         ?? null,
    notes:       device?.notes       ?? '',
  });
  const [saving, setSaving] = useState(false);

  return (
    <div style={S.modalOverlay}>
      <div style={S.formModal}>
        <h3 style={{ margin: '0 0 16px', color: G.dark }}>
          {device ? 'Edit Device' : 'Register New Device'}
        </h3>

        {[
          { key: 'device_id', label: 'Device ID (must match DEVICE_ID in firmware)', type: 'text', disabled: !!device },
          { key: 'name',      label: 'Friendly Name', type: 'text' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={S.miniLabel}>{f.label}</label>
            <input
              style={{ ...S.select, fontFamily: f.key === 'device_id' ? 'monospace' : 'inherit' }}
              type={f.type}
              value={(form as any)[f.key] ?? ''}
              disabled={f.disabled}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        <div style={{ marginBottom: 12 }}>
          <label style={S.miniLabel}>Device Type</label>
          <select
            style={S.select}
            value={form.device_type}
            onChange={e => setForm(p => ({ ...p, device_type: e.target.value as any }))}
          >
            {Object.entries(DEVICE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={S.miniLabel}>Assign to Lot (optional)</label>
          <select
            style={S.select}
            value={form.lot ?? ''}
            onChange={e => setForm(p => ({ ...p, lot: e.target.value || null }))}
          >
            <option value="">— None —</option>
            {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={S.miniLabel}>Notes</label>
          <textarea
            style={{ ...S.select, minHeight: 60, resize: 'vertical' }}
            value={form.notes ?? ''}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ ...S.actionBtn, background: G.primary, color: '#fff', flex: 1, padding: '10px' }}
            disabled={saving}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button style={{ ...S.actionBtn, background: '#f3f4f6', flex: 1, padding: '10px' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function eventBadgeColor(type: string): string {
  if (type.includes('fire') || type.includes('smoke')) return '#fee2e2';
  if (type.includes('gate'))   return '#dcfce7';
  if (type.includes('detect')) return '#dbeafe';
  if (type.includes('slot'))   return '#fef9c3';
  return '#f3f4f6';
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 16, padding: 24, minHeight: 0, overflow: 'auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  pageTitle:  { margin: 0, fontSize: 20, fontWeight: 800, color: G.dark },
  pageSub:    { margin: '4px 0 0', fontSize: 13, color: G.muted },
  addBtn: {
    padding: '10px 18px', background: G.primary, color: '#fff',
    border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13,
  },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 },
  statCard: {
    background: G.card, borderRadius: 12,
    border: `1px solid ${G.border}`,
    padding: '16px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    textAlign: 'center',
  },
  tabs: { display: 'flex', gap: 6, alignItems: 'center' },
  tab: {
    padding: '8px 18px', borderRadius: 8, border: `1px solid ${G.border}`,
    background: G.card, color: G.muted, fontWeight: 600, cursor: 'pointer', fontSize: 13,
  },
  tabActive: { background: G.primary, color: '#fff', borderColor: G.primary },
  refreshBtn: {
    marginLeft: 'auto', padding: '7px 14px', background: '#f3f4f6',
    border: `1px solid ${G.border}`, borderRadius: 8,
    color: G.muted, cursor: 'pointer', fontSize: 13,
  },
  loading: { textAlign: 'center', padding: 40, color: G.muted },
  empty:   { textAlign: 'center', padding: 60, color: G.muted },
  deviceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: {
    background: G.card, borderRadius: 14,
    border: `1px solid ${G.border}`,
    padding: 18,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardIcon:   { fontSize: 28, flexShrink: 0 },
  cardName:   { fontWeight: 700, fontSize: 15, color: G.text },
  cardId:     { fontSize: 11, color: G.muted, fontFamily: 'monospace', marginTop: 2 },
  statusPill: {
    fontSize: 10, fontWeight: 700, padding: '3px 8px',
    borderRadius: 20, flexShrink: 0, letterSpacing: 0.4,
  },
  infoGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px',
    marginBottom: 12,
    padding: '10px 0',
    borderTop: `1px solid ${G.border}`, borderBottom: `1px solid ${G.border}`,
  },
  miniLabel: {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: G.muted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 4,
  },
  select: {
    display: 'block', width: '100%', padding: '8px 10px',
    border: `1.5px solid ${G.border}`, borderRadius: 8,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
    background: '#f9fafb', color: G.text,
  },
  cardActions: { display: 'flex', gap: 6, marginTop: 12 },
  actionBtn: {
    flex: 1, padding: '7px 6px', borderRadius: 8,
    border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
  },
  badge: {
    padding: '2px 8px', borderRadius: 12,
    fontSize: 11, fontWeight: 600,
    textTransform: 'capitalize',
  },
  eventTable: {
    background: G.card, borderRadius: 12,
    border: `1px solid ${G.border}`,
    overflow: 'auto',
  },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: G.muted, fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', fontSize: 13, color: G.text, verticalAlign: 'top' },
  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  formModal: {
    background: G.card, borderRadius: 14,
    padding: 28, width: 460, maxWidth: '95vw',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  },
};
