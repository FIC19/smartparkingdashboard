/**
 * IUIU Smart Parking — Attendant POS Console
 * Optimised for Sunmi V2 Pro Android POS, mobile phones, and web browsers.
 * Handles ticket creation, fee calculation, payment processing, gate control,
 * and manual override / free pass for exempt vehicles.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  lotsAPI, ticketsAPI, entrancesAPI, exitsAPI,
} from '../api/client';
import { useLotWebSocket } from '../hooks/useWebSocket';
import type {
  ParkingLot, Ticket, Entrance, Exit,
  VehicleType, PaymentMethod,
} from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d', light: '#dcfce7', lighter: '#f0fdf4',
  white: '#ffffff',   border: '#bbf7d0', text: '#111827', muted: '#6b7280',
  red: '#dc2626', orange: '#d97706', blue: '#2563eb', purple: '#7c3aed',
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET CARD
// ─────────────────────────────────────────────────────────────────────────────

function TicketCard({
  ticket, onCheckout, onFreePass,
}: {
  ticket: Ticket;
  onCheckout: (ticket: Ticket) => void;
  onFreePass: (ticket: Ticket) => void;
}) {
  const elapsed = Math.max(0, ticket.duration_hours);
  const hours   = Math.floor(elapsed);
  const mins    = Math.floor((elapsed - hours) * 60);

  const typeIcon: Record<VehicleType, string> = {
    car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛', bus: '🚌',
  };

  return (
    <div style={cardStyles.wrap}>
      <div style={cardStyles.header}>
        <span style={cardStyles.ticketNum}>#{ticket.ticket_number}</span>
        <span style={{
          ...cardStyles.badge,
          background: ticket.status === 'active' ? G.primary : G.muted,
        }}>
          {ticket.status.toUpperCase()}
        </span>
      </div>
      <div style={cardStyles.body}>
        <div style={cardStyles.vehicleRow}>
          <span style={{ fontSize: 28 }}>{typeIcon[ticket.vehicle_type] ?? '🚗'}</span>
          <div>
            <p style={cardStyles.vehicleType}>{ticket.vehicle_type.toUpperCase()}</p>
            <p style={cardStyles.plate}>{ticket.license_plate || '— no plate —'}</p>
          </div>
        </div>
        <div style={cardStyles.meta}>
          <MetaItem label="Slot" value={ticket.slot_number ?? '—'} />
          <MetaItem label="Entry"
            value={new Date(ticket.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          <MetaItem label="Duration" value={`${hours}h ${mins}m`} />
          <MetaItem label="Fee" value={`UGX ${ticket.calculated_fee.toLocaleString()}`} accent />
        </div>
      </div>
      {ticket.status === 'active' && (
        <div style={cardStyles.actions}>
          <button onClick={() => onCheckout(ticket)} style={cardStyles.checkoutBtn}>
            💳 Process Checkout
          </button>
          <button onClick={() => onFreePass(ticket)} style={cardStyles.freePassBtn}>
            🆓 Free Pass
          </button>
        </div>
      )}
    </div>
  );
}

function MetaItem({
  label, value, accent = false,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 11, color: G.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: accent ? G.primary : G.text }}>{value}</p>
    </div>
  );
}

const cardStyles: Record<string, React.CSSProperties> = {
  wrap: {
    background: G.white, border: `1.5px solid ${G.border}`,
    borderRadius: 16, overflow: 'hidden', marginBottom: 12,
  },
  header: {
    background: G.lighter, padding: '10px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  ticketNum: { fontWeight: 800, fontSize: 14, color: G.dark, letterSpacing: 0.5 },
  badge: {
    padding: '3px 10px', borderRadius: 20, color: G.white,
    fontSize: 11, fontWeight: 700,
  },
  body: { padding: '14px 16px' },
  vehicleRow: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
  },
  vehicleType: { margin: 0, fontWeight: 700, fontSize: 15, color: G.text },
  plate: { margin: '2px 0 0', fontSize: 13, color: G.muted, letterSpacing: 1 },
  meta: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8, background: G.lighter, borderRadius: 10, padding: '10px 12px',
  },
  actions: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 8, padding: '12px 16px', borderTop: `1px solid ${G.border}`,
  },
  checkoutBtn: {
    padding: '12px 8px', background: G.primary, color: G.white,
    border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14,
  },
  freePassBtn: {
    padding: '12px 8px', background: G.orange, color: G.white,
    border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function CheckoutModal({
  ticket, exits, onConfirm, onClose,
}: {
  ticket: Ticket;
  exits: Exit[];
  onConfirm: (method: PaymentMethod, mRef: string, exitId: string) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [momoRef, setMomoRef] = useState('');
  const [exitId, setExitId] = useState(exits[0]?.id ?? '');

  return (
    <div style={modal.overlay}>
      <div style={modal.card}>
        <h2 style={modal.title}>Checkout — #{ticket.ticket_number}</h2>

        <div style={modal.feeBlock}>
          <p style={modal.feeLabel}>AMOUNT DUE</p>
          <p style={modal.feeValue}>UGX {ticket.calculated_fee.toLocaleString()}</p>
          <p style={{ margin: 0, fontSize: 13, color: G.muted }}>
            {Math.floor(ticket.duration_hours)}h {Math.floor((ticket.duration_hours % 1) * 60)}m parking
          </p>
        </div>

        {/* Payment method */}
        <p style={modal.fieldLabel}>Payment Method</p>
        <div style={modal.paymentRow}>
          {(['cash', 'mobile_money'] as PaymentMethod[]).map(m => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{
                ...modal.payBtn,
                background: method === m ? G.primary : G.lighter,
                color: method === m ? G.white : G.text,
                borderColor: method === m ? G.primary : G.border,
              }}
            >
              {m === 'cash' ? '💵 Cash' : '📱 Mobile Money'}
            </button>
          ))}
        </div>

        {method === 'mobile_money' && (
          <>
            <p style={modal.fieldLabel}>MoMo Reference Number</p>
            <input
              style={modal.input}
              placeholder="Enter MTN / Airtel reference"
              value={momoRef}
              onChange={e => setMomoRef(e.target.value)}
            />
          </>
        )}

        <p style={modal.fieldLabel}>Exit Gate</p>
        <select style={modal.input} value={exitId} onChange={e => setExitId(e.target.value)}>
          {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>

        <div style={modal.modalActions}>
          <button onClick={onClose} style={modal.cancelBtn}>Cancel</button>
          <button
            onClick={() => onConfirm(method, momoRef, exitId)}
            style={modal.confirmBtn}
            disabled={method === 'mobile_money' && !momoRef}
          >
            ✅ Confirm Payment & Open Gate
          </button>
        </div>
      </div>
    </div>
  );
}

const modal: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  card: {
    background: G.white, borderRadius: 20, padding: '28px 24px',
    width: '100%', maxWidth: 440,
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  },
  title: { margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: G.dark },
  feeBlock: {
    background: G.lighter, border: `2px solid ${G.primary}`,
    borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 20,
  },
  feeLabel: { margin: 0, fontSize: 11, fontWeight: 700, color: G.muted, textTransform: 'uppercase', letterSpacing: 1 },
  feeValue: { margin: '4px 0 4px', fontSize: 36, fontWeight: 900, color: G.primary },
  fieldLabel: { margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: G.text },
  paymentRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 },
  payBtn: {
    padding: '14px 8px', border: '2px solid', borderRadius: 10,
    cursor: 'pointer', fontWeight: 700, fontSize: 14, transition: 'all 0.15s',
  },
  input: {
    width: '100%', padding: '10px 14px', border: `1.5px solid ${G.border}`,
    borderRadius: 10, fontSize: 14, color: G.text,
    marginBottom: 16, boxSizing: 'border-box',
  },
  modalActions: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 4 },
  cancelBtn: {
    padding: '12px', background: '#f3f4f6', color: G.text,
    border: `1.5px solid ${G.border}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600,
  },
  confirmBtn: {
    padding: '12px', background: G.primary, color: G.white,
    border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FREE PASS MODAL
// ─────────────────────────────────────────────────────────────────────────────

function FreePassModal({
  ticket, onConfirm, onClose,
}: {
  ticket: Ticket;
  onConfirm: (gateType: 'entrance' | 'exit', reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [gateType, setGateType] = useState<'entrance' | 'exit'>('entrance');

  const presets = ['KCCA Vehicle', 'Campus Staff', 'University Carrier', 'Official Visitor', 'Emergency Vehicle'];

  return (
    <div style={modal.overlay}>
      <div style={{ ...modal.card, borderTop: `5px solid ${G.orange}` }}>
        <h2 style={{ ...modal.title, color: G.orange }}>⚠ Manual Override / Free Pass</h2>
        <p style={{ color: G.muted, fontSize: 14, marginTop: -10, marginBottom: 20 }}>
          Ticket #{ticket.ticket_number} — this will bypass payment and open the gate immediately.
        </p>

        <p style={modal.fieldLabel}>Exempt Reason</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {presets.map(p => (
            <button key={p} onClick={() => setReason(p)} style={{
              padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${G.border}`,
              background: reason === p ? G.orange : G.lighter, color: reason === p ? G.white : G.text,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>{p}</button>
          ))}
        </div>
        <input
          style={modal.input}
          placeholder="Or type a custom reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        <p style={modal.fieldLabel}>Gate to Open</p>
        <div style={{ ...modal.paymentRow, marginBottom: 20 }}>
          {(['entrance', 'exit'] as const).map(g => (
            <button key={g} onClick={() => setGateType(g)} style={{
              ...modal.payBtn,
              background: gateType === g ? G.orange : G.lighter,
              color: gateType === g ? G.white : G.text,
              borderColor: gateType === g ? G.orange : G.border,
            }}>
              {g === 'entrance' ? '🚪 Entrance' : '🚧 Exit'}
            </button>
          ))}
        </div>

        <div style={modal.modalActions}>
          <button onClick={onClose} style={modal.cancelBtn}>Cancel</button>
          <button
            onClick={() => onConfirm(gateType, reason || 'Manual Override')}
            style={{ ...modal.confirmBtn, background: G.orange }}
            disabled={!reason}
          >
            🆓 Grant Free Pass
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ATTENDANT CONSOLE
// ─────────────────────────────────────────────────────────────────────────────

interface AttendantConsoleProps {
  onLogout: () => void;
}

export default function AttendantConsole({ onLogout }: AttendantConsoleProps) {
  const [lots,        setLots]        = useState<ParkingLot[]>([]);
  const [activeLot,   setActiveLot]   = useState<ParkingLot | null>(null);
  const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
  const [entrances,   setEntrances]   = useState<Entrance[]>([]);
  const [exits,       setExits]       = useState<Exit[]>([]);
  const [search,      setSearch]      = useState('');
  const [checkoutTicket, setCheckoutTicket] = useState<Ticket | null>(null);
  const [freePassTicket, setFreePassTicket] = useState<Ticket | null>(null);
  const [toast,       setToast]       = useState('');
  const [newTicketForm, setNewTicketForm] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const refreshTickets = useCallback(async (lotId: string) => {
    const res = await ticketsAPI.active(lotId);
    setActiveTickets(res.data);
  }, []);

  useEffect(() => {
    lotsAPI.list().then(res => {
      setLots(res.data.results);
      if (res.data.results.length) setActiveLot(res.data.results[0]);
    });
  }, []);

  useEffect(() => {
    if (!activeLot) return;
    Promise.all([
      ticketsAPI.active(activeLot.id),
      entrancesAPI.list(activeLot.id),
      exitsAPI.list(activeLot.id),
    ]).then(([tRes, eRes, exRes]) => {
      setActiveTickets(tRes.data);
      setEntrances(eRes.data.results);
      setExits(exRes.data.results);
    });
  }, [activeLot]);

  // WebSocket for live ticket queue
  useLotWebSocket(activeLot?.id ?? '', {
    ticket_created: (payload: any) => {
      setActiveTickets(prev => [payload, ...prev]);
      showToast(`🚗 New vehicle arrived — Ticket #${payload.ticket_number}`);
    },
    ticket_closed: (payload: any) => {
      setActiveTickets(prev => prev.filter(t => t.id !== payload.id));
    },
    alert: (payload: any) => {
      if (payload.alert_type === 'fire') {
        showToast(`🔥 FIRE ALERT: ${payload.message}`);
      }
    },
  });

  const handleCheckout = async (method: PaymentMethod, mRef: string, exitId: string) => {
    if (!checkoutTicket) return;
    try {
      await ticketsAPI.checkout(checkoutTicket.id, {
        exit_gate: exitId,
        payment_method: method,
        amount_charged: checkoutTicket.calculated_fee,
        mobile_money_ref: mRef,
      });
      setActiveTickets(prev => prev.filter(t => t.id !== checkoutTicket.id));
      showToast(`✅ Payment confirmed. Exit gate opened.`);
    } catch {
      showToast(`❌ Checkout failed. Please try again.`);
    } finally {
      setCheckoutTicket(null);
    }
  };

  const handleFreePass = async (gateType: 'entrance' | 'exit', reason: string) => {
    if (!freePassTicket) return;
    try {
      await ticketsAPI.freePass(freePassTicket.id, gateType, reason);
      setActiveTickets(prev => prev.filter(t => t.id !== freePassTicket.id));
      showToast(`🆓 Free pass granted. Gate opened.`);
    } catch {
      showToast(`❌ Override failed.`);
    } finally {
      setFreePassTicket(null);
    }
  };

  // Quick entrance gate override (no ticket needed)
  const handleQuickGate = async (type: 'entrance' | 'exit', id: string) => {
    try {
      if (type === 'entrance') await entrancesAPI.openGate(id);
      else await exitsAPI.openGate(id);
      showToast(`🔓 ${type === 'entrance' ? 'Entrance' : 'Exit'} gate opened.`);
    } catch {
      showToast(`❌ Gate command failed.`);
    }
  };

  const filtered = activeTickets.filter(t =>
    t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
    t.license_plate.toLowerCase().includes(search.toLowerCase()) ||
    t.vehicle_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={s.root}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={s.header}>
        <div>
          <h1 style={s.headerTitle}>🅿 Attendant Console</h1>
          <p style={s.headerSub}>
            {activeLot?.name ?? 'Loading…'} —&nbsp;
            <span style={{ color: activeLot?.is_full ? G.red : G.primary, fontWeight: 700 }}>
              {activeLot?.available_slots ?? 0} spaces free
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {lots.length > 1 && (
            <select
              style={s.lotSelector}
              value={activeLot?.id ?? ''}
              onChange={e => setActiveLot(lots.find(l => l.id === e.target.value) ?? null)}
            >
              {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button onClick={onLogout} style={s.logoutBtn}>Sign Out</button>
        </div>
      </header>

      {/* ── Quick gate control bar ─────────────────────────────── */}
      <div style={s.quickBar}>
        {entrances.map(e => (
          <button key={e.id} onClick={() => handleQuickGate('entrance', e.id)} style={s.quickBtn}>
            🚪 Open {e.name}
          </button>
        ))}
        {exits.map(ex => (
          <button key={ex.id} onClick={() => handleQuickGate('exit', ex.id)}
            style={{ ...s.quickBtn, background: G.orange }}>
            🚧 Open {ex.name}
          </button>
        ))}
        <button onClick={() => setNewTicketForm(true)} style={{ ...s.quickBtn, background: G.blue }}>
          + Issue Ticket
        </button>
      </div>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div style={s.searchWrap}>
        <input
          style={s.searchInput}
          placeholder="🔍 Search by ticket number, plate, or vehicle type…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span style={s.countBadge}>{filtered.length} active</span>
      </div>

      {/* ── Active tickets ─────────────────────────────────────── */}
      <div style={s.ticketList}>
        {filtered.length === 0 ? (
          <div style={s.empty}>
            <p style={{ fontSize: 48 }}>🏁</p>
            <p style={{ color: G.muted, fontWeight: 600 }}>
              {activeTickets.length === 0 ? 'No active vehicles in the lot.' : 'No tickets match your search.'}
            </p>
          </div>
        ) : (
          filtered.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onCheckout={t => setCheckoutTicket(t)}
              onFreePass={t => setFreePassTicket(t)}
            />
          ))
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {checkoutTicket && (
        <CheckoutModal
          ticket={checkoutTicket}
          exits={exits}
          onConfirm={handleCheckout}
          onClose={() => setCheckoutTicket(null)}
        />
      )}
      {freePassTicket && (
        <FreePassModal
          ticket={freePassTicket}
          onConfirm={handleFreePass}
          onClose={() => setFreePassTicket(null)}
        />
      )}
      {newTicketForm && activeLot && (
        <IssueTicketModal
          lot={activeLot}
          entrances={entrances}
          onIssued={ticket => {
            setActiveTickets(prev => [ticket, ...prev]);
            setNewTicketForm(false);
            showToast(`🎫 Ticket #${ticket.ticket_number} issued.`);
          }}
          onClose={() => setNewTicketForm(false)}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div style={s.toast}>{toast}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE TICKET MODAL
// ─────────────────────────────────────────────────────────────────────────────

function IssueTicketModal({
  lot, entrances, onIssued, onClose,
}: {
  lot: ParkingLot;
  entrances: Entrance[];
  onIssued: (ticket: Ticket) => void;
  onClose: () => void;
}) {
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [licensePlate, setLicensePlate] = useState('');
  const [entranceId, setEntranceId] = useState(entrances[0]?.id ?? '');
  const [isExempt, setIsExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState('');
  const [loading, setLoading] = useState(false);

  const vehicleTypes: VehicleType[] = ['car', 'motorcycle', 'bicycle', 'van', 'truck'];
  const icons: Record<VehicleType, string> = {
    car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛', bus: '🚌',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await ticketsAPI.create({
        lot: lot.id, entrance: entranceId,
        vehicle_type: vehicleType, license_plate: licensePlate,
        is_service_exempt: isExempt,
        exempt_reason: isExempt ? exemptReason : '',
      });
      onIssued(res.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={modal.overlay}>
      <div style={modal.card}>
        <h2 style={modal.title}>🎫 Issue New Ticket</h2>
        <form onSubmit={handleSubmit}>
          <p style={modal.fieldLabel}>Vehicle Type</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
            {vehicleTypes.map(vt => (
              <button key={vt} type="button" onClick={() => setVehicleType(vt)} style={{
                padding: '10px 4px', borderRadius: 10,
                border: `2px solid ${vehicleType === vt ? G.primary : G.border}`,
                background: vehicleType === vt ? G.light : G.white,
                cursor: 'pointer', fontWeight: 700, fontSize: 11, color: G.text,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 20 }}>{icons[vt]}</span>
                {vt.slice(0, 5)}
              </button>
            ))}
          </div>

          <p style={modal.fieldLabel}>Entrance Gate</p>
          <select style={modal.input} value={entranceId} onChange={e => setEntranceId(e.target.value)}>
            {entrances.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>

          <p style={modal.fieldLabel}>License Plate (optional)</p>
          <input
            style={modal.input} placeholder="e.g. UAA 123B"
            value={licensePlate} onChange={e => setLicensePlate(e.target.value.toUpperCase())}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontWeight: 600, color: G.orange }}>Service / Exempt Vehicle</span>
          </label>
          {isExempt && (
            <input
              style={modal.input} placeholder="Reason (e.g. KCCA, Campus Staff)"
              value={exemptReason} onChange={e => setExemptReason(e.target.value)} required
            />
          )}

          <div style={modal.modalActions}>
            <button type="button" onClick={onClose} style={modal.cancelBtn}>Cancel</button>
            <button type="submit" style={modal.confirmBtn} disabled={loading}>
              {loading ? 'Issuing…' : '🎫 Issue Ticket & Open Gate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', background: G.lighter,
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex', flexDirection: 'column',
  },
  header: {
    background: G.dark, color: G.white, padding: '16px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 10,
  },
  headerTitle: { margin: 0, fontSize: 20, fontWeight: 800 },
  headerSub:   { margin: '3px 0 0', fontSize: 13, color: '#86efac' },
  quickBar: {
    background: G.white, padding: '12px 16px',
    display: 'flex', gap: 10, flexWrap: 'wrap',
    borderBottom: `1.5px solid ${G.border}`,
  },
  quickBtn: {
    padding: '10px 16px', background: G.primary, color: G.white,
    border: 'none', borderRadius: 10, cursor: 'pointer',
    fontWeight: 700, fontSize: 13,
  },
  searchWrap: {
    padding: '12px 16px', background: G.white,
    display: 'flex', alignItems: 'center', gap: 12,
    borderBottom: `1.5px solid ${G.border}`,
  },
  searchInput: {
    flex: 1, padding: '10px 14px', border: `1.5px solid ${G.border}`,
    borderRadius: 10, fontSize: 14, color: G.text, outline: 'none',
  },
  countBadge: {
    padding: '4px 12px', background: G.light, color: G.dark,
    borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
  },
  ticketList: { padding: '14px 16px', flex: 1, overflowY: 'auto' },
  empty: {
    textAlign: 'center', padding: '60px 0',
  },
  lotSelector: {
    padding: '8px 12px', border: `1.5px solid #4ade80`,
    borderRadius: 8, background: 'transparent', color: G.white,
    fontSize: 13, cursor: 'pointer',
  },
  logoutBtn: {
    padding: '8px 14px', border: `1.5px solid #4ade80`,
    borderRadius: 8, background: 'transparent', color: '#4ade80',
    cursor: 'pointer', fontWeight: 600, fontSize: 13,
  },
  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: G.dark, color: G.white, padding: '12px 24px',
    borderRadius: 30, fontWeight: 700, fontSize: 14, zIndex: 2000,
    boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
    maxWidth: '90vw', textAlign: 'center',
  },
};
