/**
 * IUIU Smart Parking — Exit Customer LCD Display
 * Shows computed parking fee and prompts cash / MoMo payment selection.
 * Triggered when an attendant starts a checkout — receives the ticket via
 * WebSocket and displays the fee to the driver on this screen.
 */
import React, { useState, useEffect } from 'react';
import { useLotWebSocket } from '../hooks/useWebSocket';
import { lotsAPI } from '../api/client';
import type { Ticket } from '../types';

const G = {
  primary: '#16a34a', dark: '#14532d', white: '#ffffff',
  red: '#dc2626', orange: '#d97706', muted: '#6b7280',
};

// ─────────────────────────────────────────────────────────────────────────────
// FEE DISPLAY SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function FeeScreen({ ticket }: { ticket: Ticket }) {
  const hours = Math.floor(ticket.duration_hours);
  const mins  = Math.floor((ticket.duration_hours % 1) * 60);

  const vehicleIcon: Record<string, string> = {
    car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛',
  };

  return (
    <div style={s.feeRoot}>
      {/* Ticket header */}
      <div style={s.ticketBadge}>
        <span style={s.ticketLabel}>TICKET</span>
        <span style={s.ticketNumber}>#{ticket.ticket_number}</span>
      </div>

      {/* Vehicle info */}
      <div style={s.vehicleRow}>
        <span style={{ fontSize: 56 }}>{vehicleIcon[ticket.vehicle_type] ?? '🚗'}</span>
        <div>
          <p style={s.vehicleType}>{ticket.vehicle_type.toUpperCase()}</p>
          <p style={s.licensePlate}>{ticket.license_plate || '— No Plate —'}</p>
        </div>
      </div>

      {/* Duration */}
      <div style={s.durationBox}>
        <p style={s.durationLabel}>PARKING DURATION</p>
        <p style={s.durationValue}>{hours}h {mins}m</p>
        <p style={s.durationSub}>
          {new Date(ticket.entry_time).toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })} → Now
        </p>
      </div>

      {/* Fee */}
      {ticket.is_service_exempt ? (
        <div style={{ ...s.feeBox, borderColor: G.orange, background: '#fff7ed' }}>
          <p style={s.feeLabel}>EXEMPT VEHICLE</p>
          <p style={{ ...s.feeAmount, color: G.orange }}>FREE</p>
          <p style={s.feeSub}>{ticket.exempt_reason}</p>
        </div>
      ) : (
        <div style={s.feeBox}>
          <p style={s.feeLabel}>AMOUNT DUE</p>
          <p style={s.feeAmount}>UGX {ticket.calculated_fee.toLocaleString()}</p>
          <p style={s.feeSub}>Slot {ticket.slot_number}</p>
        </div>
      )}

      {/* Payment options */}
      {!ticket.is_service_exempt && (
        <div style={s.paymentSection}>
          <p style={s.payPrompt}>CHOOSE PAYMENT METHOD</p>
          <div style={s.payButtons}>
            <div style={{ ...s.payOption, borderColor: G.dark }}>
              <span style={{ fontSize: 40 }}>💵</span>
              <p style={s.payOptionLabel}>CASH</p>
              <p style={s.payOptionSub}>Pay at the attendant</p>
            </div>
            <div style={{ ...s.payOption, borderColor: G.primary }}>
              <span style={{ fontSize: 40 }}>📱</span>
              <p style={s.payOptionLabel}>MOBILE MONEY</p>
              <p style={s.payOptionSub}>MTN MoMo / Airtel Money</p>
            </div>
          </div>
          <p style={s.payNote}>
            The attendant will process your payment and open the gate.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IDLE SCREEN (when no active checkout)
// ─────────────────────────────────────────────────────────────────────────────

function IdleScreen({ lotName }: { lotName: string }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={s.idleRoot}>
      <div style={s.idleLogo}>
        <span style={{ fontSize: 64 }}>🅿</span>
      </div>
      <h1 style={s.idleTitle}>{lotName}</h1>
      <p style={s.idleSub}>Exit Lane — Payment Terminal</p>
      <div style={s.idleClock}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <p style={s.idlePrompt}>
        Please present your ticket to the attendant to begin checkout.
      </p>
      <div style={s.idleFooter}>
        <span style={s.idleFooterItem}>💵 Cash Accepted</span>
        <span style={s.idleFooterItem}>📱 MTN MoMo</span>
        <span style={s.idleFooterItem}>📱 Airtel Money</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE OPENING SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function GateOpeningScreen({ ticket }: { ticket: Ticket }) {
  return (
    <div style={s.gateRoot}>
      <span style={{ fontSize: 80 }}>🔓</span>
      <h1 style={s.gateTitle}>GATE OPENING</h1>
      <p style={s.gateSub}>Thank you! Drive safely.</p>
      <div style={s.receiptBox}>
        <p style={{ margin: 0, fontSize: 14, color: G.muted }}>Receipt</p>
        <p style={{ margin: '4px 0', fontWeight: 700 }}>#{ticket.ticket_number}</p>
        <p style={{ margin: 0, color: G.primary, fontWeight: 800, fontSize: 22 }}>
          UGX {ticket.amount_charged.toLocaleString()} — {ticket.payment_method?.replace('_', ' ').toUpperCase()}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT EXIT DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

export default function ExitDisplay() {
  const [lotName, setLotName]         = useState('IUIU Smart Parking');
  const [lotId,   setLotId]           = useState('');
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [gateOpening, setGateOpening] = useState(false);

  useEffect(() => {
    lotsAPI.list().then(res => {
      const first = res.data.results[0];
      if (first) { setLotName(first.name); setLotId(first.id); }
    });
  }, []);

  // WebSocket: receive checkout events from the attendant console
  useLotWebSocket(lotId, {
    ticket_closed: (payload: any) => {
      // Attendant confirmed payment — show gate opening screen briefly
      setActiveTicket(payload as Ticket);
      setGateOpening(true);
      setTimeout(() => {
        setGateOpening(false);
        setActiveTicket(null);
      }, 6000);
    },
    new_ticket: (payload: any) => {
      // Attendant started checkout — show fee display
      setActiveTicket(payload as Ticket);
      setGateOpening(false);
    },
  });

  if (gateOpening && activeTicket) {
    return (
      <div style={s.root}>
        <GateOpeningScreen ticket={activeTicket} />
      </div>
    );
  }

  if (activeTicket) {
    return (
      <div style={s.root}>
        <FeeScreen ticket={activeTicket} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      <IdleScreen lotName={lotName} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh', background: G.white,
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  // Fee screen
  feeRoot: {
    width: '100%', maxWidth: 500,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  },
  ticketBadge: {
    background: G.dark, color: G.white, borderRadius: 30, padding: '8px 24px',
    display: 'flex', gap: 12, alignItems: 'center',
  },
  ticketLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#86efac' },
  ticketNumber: { fontSize: 16, fontWeight: 800 },
  vehicleRow: {
    display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
  },
  vehicleType: { margin: 0, fontSize: 22, fontWeight: 800, color: G.dark },
  licensePlate: { margin: '4px 0 0', fontSize: 16, color: G.muted, letterSpacing: 2 },
  durationBox: {
    background: '#f0fdf4', border: `2px solid #bbf7d0`,
    borderRadius: 16, padding: '20px 32px', textAlign: 'center', width: '100%',
  },
  durationLabel: { margin: 0, fontSize: 11, color: G.muted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  durationValue: { margin: '4px 0', fontSize: 44, fontWeight: 900, color: G.dark },
  durationSub:   { margin: 0, fontSize: 13, color: G.muted },
  feeBox: {
    background: '#f0fdf4', border: `3px solid ${G.primary}`,
    borderRadius: 16, padding: '20px 32px', textAlign: 'center', width: '100%',
  },
  feeLabel:  { margin: 0, fontSize: 12, color: G.muted, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  feeAmount: { margin: '6px 0', fontSize: 52, fontWeight: 900, color: G.primary },
  feeSub:    { margin: 0, fontSize: 14, color: G.muted },
  paymentSection: { width: '100%', textAlign: 'center' },
  payPrompt: {
    fontSize: 13, fontWeight: 700, color: G.muted, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 12,
  },
  payButtons: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  payOption: {
    border: '3px solid', borderRadius: 16, padding: '20px 12px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  payOptionLabel: { margin: 0, fontWeight: 800, fontSize: 16, color: G.dark },
  payOptionSub:   { margin: 0, fontSize: 12, color: G.muted },
  payNote: { fontSize: 13, color: G.muted, margin: 0 },
  // Idle screen
  idleRoot: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, textAlign: 'center', padding: '40px 20px',
  },
  idleLogo: {
    width: 100, height: 100, borderRadius: '50%',
    background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  idleTitle: { margin: 0, fontSize: 28, fontWeight: 900, color: G.dark },
  idleSub:   { margin: 0, fontSize: 14, color: G.muted },
  idleClock: {
    fontSize: 64, fontWeight: 900, color: G.dark, fontVariantNumeric: 'tabular-nums',
  },
  idlePrompt: {
    maxWidth: 340, color: G.muted, fontSize: 16, lineHeight: 1.5,
  },
  idleFooter: { display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  idleFooterItem: {
    padding: '8px 16px', background: '#f0fdf4', border: `1.5px solid #bbf7d0`,
    borderRadius: 20, color: G.dark, fontSize: 14, fontWeight: 600,
  },
  // Gate opening screen
  gateRoot: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, textAlign: 'center',
  },
  gateTitle: {
    margin: 0, fontSize: 60, fontWeight: 900, color: G.primary, letterSpacing: 4,
  },
  gateSub: { fontSize: 22, color: G.muted, margin: 0 },
  receiptBox: {
    background: '#f0fdf4', border: `2px solid #bbf7d0`,
    borderRadius: 16, padding: '16px 32px', textAlign: 'center',
  },
};
