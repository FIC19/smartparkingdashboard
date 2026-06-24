/**
 * IUIU Smart Parking — Parking Attendant Dashboard
 *
 * Role: 'attendant' (general / parking attendant)
 *
 * Responsibilities:
 *   • Assist clients in parking their vehicles
 *   • Record parked vehicle details (type, plate, slot)
 *   • Scan / look up a ticket when an owner is searching for their vehicle
 *   • Record license plates for all vehicles in the lot (bulk or individual)
 *
 * Menu sections:
 *   1. Dashboard      — slot overview, today's stats
 *   2. Scan Ticket    — lookup any ticket by #, barcode, or plate to find a vehicle
 *   3. Park Vehicle   — record a vehicle the attendant is parking (creates ticket)
 *   4. License Plates — view / update plates for every active vehicle in the lot
 */
import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  lotsAPI, slotsAPI, entrancesAPI, ticketsAPI,
} from '../api/client';
import EntranceDisplayScreen from './EntranceDisplayScreen';
import { useLotWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';
import type {
  ParkingLot, ParkingSlot, Entrance, Ticket, VehicleType,
} from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d', light: '#dcfce7', lighter: '#f0fdf4',
  white: '#ffffff', border: '#bbf7d0', text: '#111827', muted: '#6b7280',
  red: '#dc2626', orange: '#d97706', blue: '#2563eb', purple: '#7c3aed',
  sidebar: '#1e1b4b',  // indigo-dark for parking attendant
  accent: '#4f46e5',   // indigo
};

const VTYPE_ICONS: Record<string, string> = {
  car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛', bus: '🚌',
};
const VEHICLE_TYPES: VehicleType[] = ['car', 'motorcycle', 'bicycle', 'van', 'truck', 'bus'];

const ugx = (n: number) => `UGX ${Number(n).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════════════════
// SLOT MINI GRID
// ═══════════════════════════════════════════════════════════════════════════
function SlotMiniGrid({ slots, onSelectSlot, selectedSlot }: {
  slots: ParkingSlot[];
  onSelectSlot?: (slot: ParkingSlot) => void;
  selectedSlot?: string;
}) {
  const color: Record<string, string> = {
    vacant: G.primary, occupied: G.red, reserved: G.orange, maintenance: G.muted,
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {[
          { s: 'vacant', label: 'Available', icon: '🟢' },
          { s: 'occupied', label: 'Occupied', icon: '🔴' },
          { s: 'reserved', label: 'Booked', icon: '🟠' },
          { s: 'maintenance', label: 'Maintenance', icon: '⚫' },
        ].map(({ s, label, icon }) => (
          <span key={s} style={{ fontSize: 12, color: G.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color[s], display: 'inline-block' }} />
            {icon} {label} ({slots.filter(sl => sl.status === s).length})
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 5 }}>
        {slots.map(slot => (
          <div key={slot.id}
            title={`${slot.slot_number} — ${slot.status}`}
            onClick={() => slot.status === 'vacant' && onSelectSlot?.(slot)}
            style={{
              height: 46, borderRadius: 8,
              background: selectedSlot === slot.slot_number
                ? G.blue
                : color[slot.status] ?? G.muted,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: slot.status === 'vacant' ? 'pointer' : 'default',
              boxShadow: selectedSlot === slot.slot_number ? `0 0 0 3px ${G.blue}40` : '0 1px 4px rgba(0,0,0,0.12)',
              transform: selectedSlot === slot.slot_number ? 'scale(1.08)' : 'scale(1)',
              transition: 'all 0.1s',
            }}>
            <span style={{ color: G.white, fontSize: 10, fontWeight: 700 }}>{slot.slot_number}</span>
            {slot.status !== 'vacant' && (
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>
                {slot.status === 'occupied' ? '🚗' : slot.status === 'reserved' ? '◆' : '✕'}
              </span>
            )}
          </div>
        ))}
      </div>
      {onSelectSlot && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: G.muted }}>
          Tap a <span style={{ color: G.primary, fontWeight: 700 }}>green</span> slot to select it
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCAN TICKET PANEL — find any vehicle by ticket # / plate / barcode
// ═══════════════════════════════════════════════════════════════════════════
function ScanTicketPanel({ lots, showToast }: {
  lots: ParkingLot[];
  showToast: (m: string) => void;
}) {
  const [query, setQuery]         = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults]     = useState<Ticket[]>([]);
  const [searched, setSearched]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setResults([]);
    setSearched(false);
    try {
      const res = await ticketsAPI.list({ search: q.trim() });
      setResults(res.data.results);
      setSearched(true);
      if (!res.data.results.length) showToast(`❓ Nothing found for "${q.trim()}"`);
    } catch { showToast('❌ Search failed — check connection.'); }
    finally  { setSearching(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') doSearch(query);
  };

  const lotName = (id: string) => lots.find(l => l.id === id)?.name ?? '—';

  return (
    <div>
      {/* Search bar */}
      <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: G.dark }}>
          🔍 Find a Vehicle
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: G.muted }}>
          Use to locate a parked vehicle for its owner. Search by ticket number, license plate, or scan barcode.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>🔎</span>
            <input
              ref={inputRef}
              style={{ width: '100%', padding: '13px 12px 13px 42px', border: `2px solid ${G.accent}`, borderRadius: 10, fontSize: 16, color: G.text, fontFamily: 'monospace', boxSizing: 'border-box' }}
              placeholder="Ticket # or plate (e.g. UAA 123B)…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
            />
          </div>
          <button
            onClick={() => doSearch(query)}
            style={{ padding: '13px 22px', background: G.accent, color: G.white, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: G.muted }}>
          🔔 Built-in / handheld barcode scanner — scan the ticket barcode directly into the field above
        </p>
      </div>

      {/* Results */}
      {searched && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: G.muted }}>
          <p style={{ fontSize: 36, margin: '0 0 10px' }}>🔍</p>
          <p style={{ fontWeight: 600 }}>No vehicles found. Try a different ticket number or plate.</p>
        </div>
      )}

      {results.map(t => {
        const hrs  = Math.floor(t.duration_hours);
        const mins = Math.floor((t.duration_hours - hrs) * 60);
        const isActive = t.status === 'active';
        return (
          <div key={t.id} style={{
            background: G.white,
            border: `2px solid ${isActive ? G.accent : G.border}`,
            borderLeft: `6px solid ${isActive ? G.accent : G.muted}`,
            borderRadius: 14, padding: '20px 22px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 32 }}>{VTYPE_ICONS[t.vehicle_type] ?? '🚗'}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2, color: G.dark }}>
                      {t.license_plate || '— No Plate —'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: G.muted }}>
                      {t.vehicle_type.toUpperCase()} · Ticket #{t.ticket_number}
                    </p>
                  </div>
                </div>
              </div>
              <span style={{
                padding: '5px 14px', borderRadius: 20, fontWeight: 800, fontSize: 12,
                background: isActive ? G.accent : t.status === 'paid' ? G.primary : G.muted,
                color: G.white,
              }}>
                {isActive ? '🚗 PARKED' : t.status === 'paid' ? '✅ EXITED' : t.status.toUpperCase()}
              </span>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Lot',       value: lotName(t.lot) },
                { label: 'Slot',      value: t.slot_number ?? '—' },
                { label: 'Entry Time', value: new Date(t.entry_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                { label: 'Duration',  value: `${hrs}h ${mins}m` },
                { label: 'Parked by', value: t.attendant_name ?? 'Entrance' },
                { label: 'Fee so far', value: ugx(t.calculated_fee) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: G.lighter, borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ margin: 0, fontSize: 10, color: G.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: G.dark }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Direction helper for the attendant */}
            {isActive && t.slot_number && (
              <div style={{ background: `${G.accent}12`, border: `1.5px solid ${G.accent}30`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📍</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: G.accent }}>
                    Vehicle is at Slot {t.slot_number}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: G.muted }}>
                    Guide the owner to slot {t.slot_number} in {lotName(t.lot)}.
                  </p>
                </div>
              </div>
            )}

            {t.is_service_exempt && (
              <div style={{ marginTop: 10, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                🆓 Service / Exempt Vehicle — No charge applies
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARK VEHICLE PANEL — record a vehicle the attendant is parking
// ═══════════════════════════════════════════════════════════════════════════
function ParkVehiclePanel({
  lot, slots, entrances, onParked, showToast,
}: {
  lot: ParkingLot | null;
  slots: ParkingSlot[];
  entrances: Entrance[];
  onParked: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [plate,       setPlate]       = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slotInput,   setSlotInput]   = useState('');  // manual slot # override
  const [entranceId,  setEntranceId]  = useState(entrances[0]?.id ?? '');
  const [notes,       setNotes]       = useState('');
  const [isExempt,    setIsExempt]    = useState(false);
  const [exemptReason, setExemptReason] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [lastParked,  setLastParked]  = useState<Ticket | null>(null);

  const vacantSlots = slots.filter(s => s.status === 'vacant');

  useEffect(() => {
    if (entrances.length && !entranceId) setEntranceId(entrances[0].id);
  }, [entrances]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot) { showToast('⚠ No active lot.'); return; }
    if (!entranceId) { showToast('⚠ Select entrance gate.'); return; }
    setSaving(true);
    try {
      const res = await ticketsAPI.create({
        lot:              lot.id,
        entrance:         entranceId,
        vehicle_type:     vehicleType,
        license_plate:    plate.toUpperCase(),
        is_service_exempt: isExempt,
        exempt_reason:    isExempt ? exemptReason : '',
      });

      // Assign slot if selected (update the ticket)
      const finalSlot = selectedSlot || slotInput.trim();
      if (finalSlot) {
        try {
          await ticketsAPI.update(res.data.id, { assigned_slot: finalSlot } as any);
        } catch { /* slot assignment optional */ }
      }

      setLastParked(res.data);
      onParked(res.data);
      showToast(`✅ Vehicle parked! Ticket #${res.data.ticket_number}`);
      setPlate(''); setSelectedSlot(''); setSlotInput(''); setNotes('');
      setIsExempt(false); setExemptReason('');
    } catch (err: any) {
      showToast(`❌ ${err?.response?.data?.detail ?? 'Failed to record parking.'}`);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

      {/* LEFT: Form */}
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 800, color: G.dark }}>
            🚗 Record Parked Vehicle
          </h3>

          <form onSubmit={handleSubmit}>
            {/* Vehicle type */}
            <label style={fS.label}>Vehicle Type *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
              {VEHICLE_TYPES.map(vt => (
                <button key={vt} type="button" onClick={() => setVehicleType(vt)} style={{
                  padding: '10px 4px', borderRadius: 10,
                  border: `2px solid ${vehicleType === vt ? G.accent : G.border}`,
                  background: vehicleType === vt ? `${G.accent}15` : G.white,
                  cursor: 'pointer', fontSize: 10, color: G.text,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 22 }}>{VTYPE_ICONS[vt]}</span>
                  {vt.slice(0, 5)}
                </button>
              ))}
            </div>

            {/* License plate */}
            <label style={fS.label}>License Plate</label>
            <input
              style={{ ...fS.input, marginBottom: 14, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 3, fontSize: 17, fontWeight: 700 }}
              placeholder="UAA 123B"
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase())}
            />

            {/* Entrance gate */}
            <label style={fS.label}>Entrance Gate *</label>
            <select style={{ ...fS.input, marginBottom: 14 }} value={entranceId}
              onChange={e => setEntranceId(e.target.value)} required>
              {entrances.length === 0
                ? <option value="">No entrance gates — contact admin</option>
                : entrances.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>

            {/* Slot — manual input */}
            <label style={fS.label}>Slot Number (type or pick from map →)</label>
            <input
              style={{ ...fS.input, marginBottom: 6, fontFamily: 'monospace', letterSpacing: 1, fontWeight: 700 }}
              placeholder="e.g. A-12  (optional)"
              value={selectedSlot || slotInput}
              onChange={e => { setSelectedSlot(''); setSlotInput(e.target.value.toUpperCase()); }}
            />
            {selectedSlot && (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: G.accent, fontWeight: 600 }}>
                ✓ Selected from map: Slot {selectedSlot}
                <button type="button" onClick={() => setSelectedSlot('')} style={{ marginLeft: 8, background: 'none', border: 'none', color: G.red, cursor: 'pointer', fontSize: 12 }}>✕ Clear</button>
              </p>
            )}

            {/* Notes */}
            <label style={{ ...fS.label, marginTop: 8 }}>Notes (optional)</label>
            <textarea
              style={{ ...fS.input, height: 64, resize: 'vertical', marginBottom: 14 }}
              placeholder="e.g. dark blue car, near pillar B, owner will call…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            {/* Exempt toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isExempt ? 10 : 18, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 600, color: G.orange }}>🆓 Service / Exempt (no charge)</span>
            </label>
            {isExempt && (
              <input style={{ ...fS.input, marginBottom: 14 }}
                placeholder="Reason (e.g. KCCA, Staff, Official)"
                value={exemptReason} onChange={e => setExemptReason(e.target.value)} required={isExempt} />
            )}

            {lot?.is_full && !isExempt && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: G.red, fontWeight: 600 }}>
                ⚠ Lot is FULL — no vacant slots available.
              </div>
            )}

            <button type="submit" disabled={saving || (!isExempt && !!lot?.is_full)} style={{
              width: '100%', padding: '15px',
              background: saving ? G.muted : G.accent,
              color: G.white, border: 'none', borderRadius: 10,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 900, fontSize: 17, letterSpacing: 0.3,
            }}>
              {saving ? '⏳ Recording…' : '🚗 Park Vehicle & Record'}
            </button>
          </form>
        </div>

        {/* Last parked card */}
        {lastParked && (
          <div style={{ marginTop: 14, background: G.light, border: `2px solid ${G.primary}`, borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 800, color: G.dark }}>
              ✅ Last Parked: #{lastParked.ticket_number}
            </p>
            <p style={{ margin: 0, color: G.muted, fontSize: 13 }}>
              {VTYPE_ICONS[lastParked.vehicle_type]} {lastParked.vehicle_type}
              &nbsp;·&nbsp;
              <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>
                {lastParked.license_plate || 'No plate'}
              </span>
              &nbsp;·&nbsp;
              {new Date(lastParked.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>

      {/* RIGHT: Slot map */}
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>🅿 Slot Map</h3>
            <span style={{ fontSize: 12, color: G.muted }}>
              {vacantSlots.length} available
            </span>
          </div>
          <SlotMiniGrid
            slots={slots}
            selectedSlot={selectedSlot || slotInput}
            onSelectSlot={slot => { setSelectedSlot(slot.slot_number); setSlotInput(''); }}
          />
        </div>

        {/* Vacant slots quick-pick list */}
        {vacantSlots.length > 0 && (
          <div style={{ marginTop: 14, background: G.lighter, border: `1.5px solid ${G.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: G.muted }}>
              NEAREST AVAILABLE SLOTS
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {vacantSlots.slice(0, 12).map(sl => (
                <button key={sl.id} type="button"
                  onClick={() => { setSelectedSlot(sl.slot_number); setSlotInput(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 20,
                    border: `2px solid ${selectedSlot === sl.slot_number ? G.accent : G.primary}`,
                    background: selectedSlot === sl.slot_number ? G.accent : G.light,
                    color: selectedSlot === sl.slot_number ? G.white : G.dark,
                    cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  }}>
                  {sl.slot_number}
                </button>
              ))}
              {vacantSlots.length > 12 && (
                <span style={{ fontSize: 12, color: G.muted, alignSelf: 'center' }}>
                  +{vacantSlots.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LICENSE PLATES PANEL — view & update plates for all active vehicles
// ═══════════════════════════════════════════════════════════════════════════
function LicensePlatesPanel({
  tickets, lots, onUpdated, showToast,
}: {
  tickets: Ticket[];
  lots: ParkingLot[];
  onUpdated: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<'all' | 'no_plate' | 'active'>('all');
  const [editing,  setEditing]  = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  // Bulk add mode
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<{ plate: string; slot: string }[]>(
    Array.from({ length: 5 }, () => ({ plate: '', slot: '' }))
  );
  const [bulkSaving, setBulkSaving] = useState(false);

  const lotName = (id: string) => lots.find(l => l.id === id)?.name ?? '—';

  let filtered = tickets.filter(t => {
    if (filter === 'no_plate') return !t.license_plate;
    if (filter === 'active')   return t.status === 'active';
    return true;
  }).filter(t =>
    !search ||
    t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
    (t.license_plate ?? '').toLowerCase().includes(search.toLowerCase()) ||
    t.vehicle_type.toLowerCase().includes(search.toLowerCase()) ||
    (t.slot_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (id: string, current: string) => {
    setEditing(prev => ({ ...prev, [id]: current }));
  };

  const savePlate = async (ticket: Ticket) => {
    const newPlate = (editing[ticket.id] ?? '').toUpperCase().trim();
    if (!newPlate) { showToast('⚠ Enter a plate number.'); return; }
    setSaving(prev => ({ ...prev, [ticket.id]: true }));
    try {
      const res = await ticketsAPI.update(ticket.id, { license_plate: newPlate });
      onUpdated(res.data);
      setEditing(prev => { const n = { ...prev }; delete n[ticket.id]; return n; });
      showToast(`✅ Plate updated: ${newPlate}`);
    } catch { showToast('❌ Update failed.'); }
    finally { setSaving(prev => ({ ...prev, [ticket.id]: false })); }
  };

  const handleBulkSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rows = bulkRows.filter(r => r.plate.trim());
    if (!rows.length) { showToast('⚠ No plates entered.'); return; }
    setBulkSaving(true);
    let saved = 0;
    for (const row of rows) {
      // Find matching ticket by slot number
      const match = tickets.find(t => t.slot_number?.toUpperCase() === row.slot.toUpperCase().trim() && t.status === 'active');
      if (match) {
        try {
          const res = await ticketsAPI.update(match.id, { license_plate: row.plate.toUpperCase().trim() });
          onUpdated(res.data);
          saved++;
        } catch {}
      }
    }
    showToast(`✅ ${saved} plates recorded.`);
    setBulkRows(Array.from({ length: 5 }, () => ({ plate: '', slot: '' })));
    setBulkSaving(false);
  };

  const addBulkRow = () => setBulkRows(prev => [...prev, { plate: '', slot: '' }]);

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Vehicles',  count: tickets.length,                           color: G.accent,   icon: '🚗' },
          { label: 'Active / Inside', count: tickets.filter(t => t.status === 'active').length, color: G.primary, icon: '✅' },
          { label: 'Missing Plates',  count: tickets.filter(t => !t.license_plate).length, color: G.orange, icon: '⚠' },
        ].map(({ label, count, color, icon }) => (
          <div key={label} style={{ background: G.white, border: `1.5px solid ${color}30`, borderLeft: `5px solid ${color}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color }}>{count}</p>
              <p style={{ margin: 0, fontSize: 12, color: G.muted, fontWeight: 600 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setBulkMode(false)} style={{ padding: '8px 18px', borderRadius: 8, border: `2px solid ${!bulkMode ? G.accent : G.border}`, background: !bulkMode ? `${G.accent}15` : G.white, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark }}>
          📋 View &amp; Edit Plates
        </button>
        <button onClick={() => setBulkMode(true)} style={{ padding: '8px 18px', borderRadius: 8, border: `2px solid ${bulkMode ? G.accent : G.border}`, background: bulkMode ? `${G.accent}15` : G.white, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark }}>
          📝 Bulk Record Plates
        </button>
      </div>

      {/* ── BULK MODE ── */}
      {bulkMode && (
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: G.dark }}>📝 Bulk Plate Recording</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: G.muted }}>
            Walk the lot, note each vehicle's plate and slot number, then enter them here. The system will match each entry to the active ticket in that slot.
          </p>
          <form onSubmit={handleBulkSave}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 8, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: G.muted, paddingLeft: 4 }}>LICENSE PLATE</p>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: G.muted, paddingLeft: 4 }}>SLOT NUMBER</p>
              <span />
            </div>

            {bulkRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 8, marginBottom: 8 }}>
                <input
                  style={{ ...fS.input, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}
                  placeholder="UAA 123B"
                  value={row.plate}
                  onChange={e => setBulkRows(prev => prev.map((r, j) => j === i ? { ...r, plate: e.target.value.toUpperCase() } : r))}
                />
                <input
                  style={{ ...fS.input, fontFamily: 'monospace', fontWeight: 700 }}
                  placeholder="A-01"
                  value={row.slot}
                  onChange={e => setBulkRows(prev => prev.map((r, j) => j === i ? { ...r, slot: e.target.value.toUpperCase() } : r))}
                />
                <button type="button" onClick={() => setBulkRows(prev => prev.filter((_, j) => j !== i))} style={{ background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 8, cursor: 'pointer', color: G.red, fontWeight: 700, fontSize: 14 }}>✕</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="button" onClick={addBulkRow} style={{ flex: 1, padding: '10px', background: G.lighter, border: `1.5px solid ${G.border}`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark }}>
                + Add Row
              </button>
              <button type="submit" disabled={bulkSaving} style={{ flex: 2, padding: '10px', background: bulkSaving ? G.muted : G.accent, color: G.white, border: 'none', borderRadius: 8, cursor: bulkSaving ? 'wait' : 'pointer', fontWeight: 800, fontSize: 14 }}>
                {bulkSaving ? 'Saving…' : '💾 Save All Plates'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TABLE MODE ── */}
      {!bulkMode && (
        <>
          {/* Search + filter */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>🔍</span>
              <input style={{ ...fS.input, paddingLeft: 36 }}
                placeholder="Search plate, ticket #, slot…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {[
              { value: 'all',      label: 'All' },
              { value: 'active',   label: '🟢 Active' },
              { value: 'no_plate', label: '⚠ No Plate' },
            ].map(f => (
              <button key={f.value} onClick={() => setFilter(f.value as any)} style={{
                padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                border: `2px solid ${filter === f.value ? G.accent : G.border}`,
                background: filter === f.value ? `${G.accent}15` : G.white, color: G.dark,
              }}>{f.label}</button>
            ))}
          </div>

          <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: G.dark, fontSize: 14 }}>Vehicle Plate Registry</span>
              <span style={{ fontSize: 12, color: G.muted }}>{filtered.length} records</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: G.muted }}>
                <p style={{ fontSize: 36, margin: 0 }}>🏁</p>
                <p style={{ fontWeight: 600 }}>No vehicles match this filter.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: G.lighter }}>
                      {['Ticket #', 'Type', 'License Plate', 'Slot', 'Entry', 'Status', 'Action'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: G.dark, fontSize: 12, borderBottom: `1px solid ${G.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t, i) => {
                      const isEditing = editing[t.id] !== undefined;
                      return (
                        <tr key={t.id} style={{ borderBottom: `1px solid ${G.border}`, background: i % 2 === 0 ? G.white : G.lighter }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: G.dark }}>#{t.ticket_number}</td>
                          <td style={{ padding: '10px 12px' }}>{VTYPE_ICONS[t.vehicle_type]} {t.vehicle_type}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {isEditing ? (
                              <input
                                style={{ ...fS.input, width: 140, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}
                                value={editing[t.id]}
                                onChange={e => setEditing(prev => ({ ...prev, [t.id]: e.target.value.toUpperCase() }))}
                                onKeyDown={e => e.key === 'Enter' && savePlate(t)}
                                autoFocus
                              />
                            ) : (
                              <span
                                style={{ fontFamily: 'monospace', fontWeight: 800, letterSpacing: 2, fontSize: 14, cursor: 'pointer', color: t.license_plate ? G.dark : G.muted }}
                                title="Click to edit"
                                onClick={() => startEdit(t.id, t.license_plate)}>
                                {t.license_plate || '— tap to add —'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{t.slot_number ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: G.muted, fontSize: 12 }}>
                            {new Date(t.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: t.status === 'active' ? G.accent : G.muted, color: G.white }}>
                              {t.status === 'active' ? 'Inside' : t.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => savePlate(t)} disabled={saving[t.id]} style={{ padding: '5px 10px', background: G.accent, color: G.white, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                                  {saving[t.id] ? '…' : '💾'}
                                </button>
                                <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[t.id]; return n; })} style={{ padding: '5px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: G.red }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(t.id, t.license_plate)} style={{ padding: '5px 10px', background: G.lighter, border: `1px solid ${G.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: G.dark }}>
                                ✏ Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p style={{ margin: 0, color: '#a5b4fc', fontSize: 10 }}>{time.toLocaleDateString()}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PARKING ATTENDANT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

type MenuPage = 'dashboard' | 'scan_ticket' | 'park_vehicle' | 'license_plates';

interface Props { onLogout: () => void; }

export default function ParkingAttendantDashboard({ onLogout }: Props) {
  const { user } = useAuth();
  const [page,        setPage]        = useState<MenuPage>('dashboard');
  const [showDisplay, setShowDisplay] = useState(false);
  const [lots,       setLots]      = useState<ParkingLot[]>([]);
  const [activeLot,  setActiveLot] = useState<ParkingLot | null>(null);
  const [slots,      setSlots]     = useState<ParkingSlot[]>([]);
  const [entrances,  setEntrances] = useState<Entrance[]>([]);
  const [tickets,    setTickets]   = useState<Ticket[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [toast,      setToast]     = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // Load lots
  useEffect(() => {
    lotsAPI.list()
      .then(res => {
        setLots(res.data.results);
        if (res.data.results.length) setActiveLot(res.data.results[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Load lot-specific data
  useEffect(() => {
    if (!activeLot) return;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      slotsAPI.list({ lot: activeLot.id }),
      entrancesAPI.list(activeLot.id),
      ticketsAPI.list({ lot: activeLot.id, entry_time__date: today }),
    ]).then(([slotsRes, entRes, ticketsRes]) => {
      setSlots(slotsRes.data.results);
      setEntrances(entRes.data.results);
      setTickets(ticketsRes.data.results);
    });
  }, [activeLot]);

  // Real-time WebSocket
  useLotWebSocket(activeLot?.id ?? '', {
    slot_update: (payload: any) =>
      setSlots(prev => prev.map(s => s.id === payload.id ? { ...s, ...payload } : s)),
    ticket_created: (payload: any) =>
      setTickets(prev => prev.some(t => t.id === payload.id) ? prev : [payload, ...prev]),
    alert: (payload: any) => {
      if (payload.alert_type === 'fire')
        showToast(`🔥 FIRE ALERT: ${payload.message} — Evacuate immediately!`);
    },
  });

  const menuItems: { key: MenuPage; icon: string; label: string }[] = [
    { key: 'dashboard',      icon: '🏠', label: 'Dashboard' },
    { key: 'scan_ticket',    icon: '🔍', label: 'Scan Ticket' },
    { key: 'park_vehicle',   icon: '🚗', label: 'Park Vehicle' },
    { key: 'license_plates', icon: '🪪', label: 'License Plates' },
  ];

  const activeNow   = tickets.filter(t => t.status === 'active').length;
  const parkedToday = tickets.length;
  const missingPlate = tickets.filter(t => !t.license_plate).length;
  const vacant      = slots.filter(s => s.status === 'vacant').length;
  const occupied    = slots.filter(s => s.status === 'occupied').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#eef2ff', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #c7d2fe', borderTopColor: G.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: G.accent, fontWeight: 600 }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: '#eef2ff' }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 220 : 60, background: G.sidebar,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
        transition: 'width 0.2s', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${G.accent}, #3730a3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>🅿</span>
          </div>
          {sidebarOpen && (
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 12 }}>Parking Panel</p>
              <p style={{ margin: 0, color: '#a5b4fc', fontSize: 10 }}>IUIU Smart Parking</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Attendant info */}
        {sidebarOpen && user && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${G.accent}, #3730a3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                {user.first_name?.[0]?.toUpperCase() ?? 'P'}
              </div>
              <div>
                <p style={{ margin: 0, color: '#fff', fontWeight: 600, fontSize: 12 }}>{user.first_name} {user.last_name}</p>
                <p style={{ margin: 0, color: '#a5b4fc', fontSize: 10 }}>Parking Attendant</p>
              </div>
            </div>
          </div>
        )}

        {/* Slot mini counters */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ margin: 0, color: '#86efac', fontWeight: 900, fontSize: 18 }}>{vacant}</p>
                <p style={{ margin: 0, color: '#a5b4fc', fontSize: 9 }}>Free</p>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ margin: 0, color: '#fca5a5', fontWeight: 900, fontSize: 18 }}>{occupied}</p>
                <p style={{ margin: 0, color: '#a5b4fc', fontSize: 9 }}>Taken</p>
              </div>
              {missingPlate > 0 && (
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ margin: 0, color: '#fde68a', fontWeight: 900, fontSize: 18 }}>{missingPlate}</p>
                  <p style={{ margin: 0, color: '#a5b4fc', fontSize: 9 }}>No plate</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lot selector */}
        {sidebarOpen && lots.length > 1 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {lots.map(lot => (
              <button key={lot.id} onClick={() => setActiveLot(lot)} style={{
                display: 'flex', alignItems: 'center', width: '100%', padding: '7px 8px',
                border: 'none', borderRadius: 6, fontSize: 11, fontWeight: activeLot?.id === lot.id ? 700 : 400,
                background: activeLot?.id === lot.id ? 'rgba(79,70,229,0.35)' : 'transparent',
                color: activeLot?.id === lot.id ? '#a5b4fc' : '#c7d2fe',
                cursor: 'pointer', marginBottom: 2, textAlign: 'left',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: lot.is_full ? G.red : G.primary, display: 'inline-block', marginRight: 6 }} />
                {lot.name}
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {menuItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: sidebarOpen ? '12px 12px' : '12px 0',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              border: 'none', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
              background: page === item.key ? 'rgba(79,70,229,0.35)' : 'transparent',
              color: page === item.key ? '#a5b4fc' : '#c7d2fe',
              fontWeight: page === item.key ? 700 : 400,
              fontSize: 13, transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && item.label}
              {/* Badge: missing plates warning */}
              {item.key === 'license_plates' && missingPlate > 0 && sidebarOpen && (
                <span style={{ marginLeft: 'auto', background: G.orange, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>
                  {missingPlate}
                </span>
              )}
            </button>
          ))}
        </nav>

        {sidebarOpen && <LiveClock />}

        {/* Entrance Display button */}
        <div style={{ padding: '6px 10px 0' }}>
          <button onClick={() => setShowDisplay(true)} style={{
            width: '100%', padding: '10px',
            border: '1.5px solid #facc15', borderRadius: 8,
            background: 'rgba(250,204,21,0.08)', color: '#facc15',
            cursor: 'pointer', fontWeight: 700, fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-start' : 'center', gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>📺</span>
            {sidebarOpen && 'View Entrance Screen'}
          </button>
        </div>

        <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={onLogout} style={{ width: '100%', padding: '10px', border: '1.5px solid #818cf8', borderRadius: 8, background: 'transparent', color: '#818cf8', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            {sidebarOpen ? '⬅ Sign Out' : '⬅'}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '22px 24px', overflowY: 'auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: G.dark }}>
              {menuItems.find(m => m.key === page)?.icon} {menuItems.find(m => m.key === page)?.label}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: G.muted }}>
              {activeLot?.name ?? 'No lot'} · {new Date().toLocaleDateString()}
            </p>
          </div>
          {activeLot?.is_full && (
            <span style={{ padding: '6px 14px', borderRadius: 20, background: '#fef2f2', color: G.red, fontWeight: 800, fontSize: 13 }}>
              🔴 LOT FULL
            </span>
          )}
        </div>

        {/* ── DASHBOARD ─────────────────────────────────────────────── */}
        {page === 'dashboard' && (
          <div>
            {/* Welcome card */}
            <div style={{ background: `linear-gradient(135deg, #3730a3, ${G.accent})`, borderRadius: 16, padding: '22px 26px', marginBottom: 24, color: '#fff' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                Welcome, {user?.first_name ?? 'Attendant'} 👋
              </h2>
              <p style={{ margin: '6px 0 0', color: '#c7d2fe', fontSize: 13 }}>
                Parking Attendant · {activeLot?.name ?? 'IUIU Parking'} · {new Date().toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Vehicles today',  value: parkedToday },
                  { label: 'Currently inside',value: activeNow },
                  { label: 'Free slots',       value: vacant },
                  { label: 'Missing plates',   value: missingPlate },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{value}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#c7d2fe' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Slot grid */}
            <div style={{ background: '#fff', border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>🅿 Slot Map</h3>
                <span style={{ fontSize: 12, color: G.muted }}>{slots.length} total</span>
              </div>
              <SlotMiniGrid slots={slots} />
            </div>

            {/* Missing plates alert */}
            {missingPlate > 0 && (
              <div style={{ background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>⚠</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800, color: '#92400e', fontSize: 14 }}>
                      {missingPlate} vehicle{missingPlate > 1 ? 's' : ''} without a recorded plate
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: G.muted }}>Walk the lot and record plates from the License Plates section.</p>
                  </div>
                </div>
                <button onClick={() => setPage('license_plates')} style={{ padding: '8px 18px', background: G.orange, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  Record Now →
                </button>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { key: 'scan_ticket',    bg: G.accent,   label: 'Scan Ticket',      icon: '🔍' },
                { key: 'park_vehicle',   bg: G.primary,  label: 'Park Vehicle',     icon: '🚗' },
                { key: 'license_plates', bg: G.orange,   label: 'License Plates',   icon: '🪪' },
              ].map(({ key, bg, label, icon }) => (
                <button key={key} onClick={() => setPage(key as MenuPage)} style={{
                  padding: '20px 12px', background: bg, color: '#fff', border: 'none',
                  borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  boxShadow: `0 4px 16px ${bg}40`,
                }}>
                  <span style={{ fontSize: 30 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── SCAN TICKET ──────────────────────────────────────────── */}
        {page === 'scan_ticket' && (
          <ScanTicketPanel lots={lots} showToast={showToast} />
        )}

        {/* ── PARK VEHICLE ─────────────────────────────────────────── */}
        {page === 'park_vehicle' && (
          <ParkVehiclePanel
            lot={activeLot}
            slots={slots}
            entrances={entrances}
            onParked={t => setTickets(prev => prev.some(x => x.id === t.id) ? prev : [t, ...prev])}
            showToast={showToast}
          />
        )}

        {/* ── LICENSE PLATES ───────────────────────────────────────── */}
        {page === 'license_plates' && (
          <LicensePlatesPanel
            tickets={tickets}
            lots={lots}
            onUpdated={t => setTickets(prev => prev.map(x => x.id === t.id ? t : x))}
            showToast={showToast}
          />
        )}
      </main>

      {/* ── TOAST ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: G.dark, color: '#fff', padding: '12px 28px',
          borderRadius: 30, fontWeight: 700, fontSize: 14, zIndex: 9999,
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)', maxWidth: '90vw', textAlign: 'center',
        }}>{toast}</div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        select, input, button, textarea { font-family: inherit; }
      `}</style>

      {/* ── ENTRANCE DISPLAY OVERLAY ─────────────────────────────────────── */}
      {showDisplay && <EntranceDisplayScreen onClose={() => setShowDisplay(false)} />}
    </div>
  );
}

// ── Shared form styles ────────────────────────────────────────────────────────
const fS: Record<string, React.CSSProperties> = {
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 },
  input: {
    width: '100%', padding: '11px 12px', border: '1.5px solid #bbf7d0',
    borderRadius: 8, fontSize: 13, color: '#111827', background: '#ffffff',
    boxSizing: 'border-box' as const,
  },
};
