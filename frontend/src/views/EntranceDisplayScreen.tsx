/**
 * IUIU Smart Parking — Entrance Display Screen
 *
 * Designed to run on a large TV / monitor above the entrance gate.
 * Shows:
 *   • Live welcome branding + clock/date
 *   • Available slot count (huge, easy to read from a distance)
 *   • Colour-coded slot grid
 *   • Lot statistics bar (capacity, occupied, % full)
 *   • Animated announcement when a vehicle is assigned a slot
 *   • Fire-alert overlay (WebSocket)
 *
 * Usage:
 *   <EntranceDisplayScreen />                         — standalone (no close button)
 *   <EntranceDisplayScreen onClose={() => ...} />     — overlay (shows ✕)
 *
 * Data:
 *   Loads from lotsAPI + slotsAPI on mount, then keeps live via useLotWebSocket.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { lotsAPI, slotsAPI, ticketsAPI }                  from '../api/client';
import { useLotWebSocket }                                 from '../hooks/useWebSocket';
import type { ParkingLot, ParkingSlot, Ticket }           from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const D = {
  bg:       '#0b0f1a',
  panel:    '#111827',
  border:   '#1f2937',
  green:    '#22c55e',
  greenDim: '#14532d',
  red:      '#ef4444',
  orange:   '#f59e0b',
  blue:     '#3b82f6',
  muted:    '#6b7280',
  text:     '#f9fafb',
  sub:      '#9ca3af',
  accent:   '#16a34a',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ margin: 0, fontSize: 42, fontWeight: 900, color: D.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </p>
      <p style={{ margin: 0, fontSize: 15, color: D.sub, fontWeight: 500 }}>
        {now.toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>
  );
}

// ── Slot Cell ─────────────────────────────────────────────────────────────────
function SlotCell({ slot, highlight }: { slot: ParkingSlot; highlight: boolean }) {
  const c = slot.status === 'vacant'      ? D.green
          : slot.status === 'occupied'    ? D.red
          : slot.status === 'reserved'    ? D.orange
          :                                 D.muted;
  return (
    <div title={`${slot.slot_number} — ${slot.status}`} style={{
      height: 44,
      borderRadius: 6,
      background: highlight ? '#ffffff' : c,
      border: `2px solid ${highlight ? '#ffffff' : c}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: highlight ? `0 0 20px #fff, 0 0 40px ${D.green}` : slot.status === 'vacant' ? `0 0 8px ${D.green}50` : 'none',
      transition: 'all 0.4s ease',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
          animation: 'shimmer 1.5s infinite',
        }} />
      )}
      <span style={{
        fontSize: 11, fontWeight: 800, color: highlight ? D.bg : '#fff',
        textShadow: slot.status === 'vacant' && !highlight ? `0 0 6px ${D.green}` : 'none',
        zIndex: 1,
      }}>
        {slot.slot_number}
      </span>
    </div>
  );
}

// ── Announcement Overlay ──────────────────────────────────────────────────────
interface Announcement {
  type: 'welcome' | 'scanning' | 'full' | 'fire';
  slotNumber?: string;
  plate?: string;
  vehicleType?: string;
  message?: string;
  remaining?: number; // countdown seconds
}

function AnnouncementOverlay({ ann, onDismiss }: { ann: Announcement; onDismiss: () => void }) {
  const isFire = ann.type === 'fire';
  const bg     = isFire ? '#7f1d1d'
               : ann.type === 'full' ? '#1c1917'
               : 'rgba(11,15,26,0.97)';

  return (
    <div onClick={onDismiss} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.35s ease',
      cursor: 'pointer',
    }}>
      {isFire && (
        <>
          <p style={{ fontSize: 120, margin: '0 0 20px', animation: 'pulse 0.6s ease-in-out infinite alternate' }}>🔥</p>
          <p style={{ margin: 0, fontSize: 64, fontWeight: 900, color: '#f87171', textAlign: 'center', lineHeight: 1.1 }}>
            FIRE ALERT!
          </p>
          <p style={{ margin: '16px 0 0', fontSize: 28, color: '#fca5a5', fontWeight: 700, textAlign: 'center' }}>
            EVACUATE IMMEDIATELY · ALL VEHICLES PLEASE EXIT
          </p>
          <p style={{ margin: '24px 0 0', fontSize: 18, color: '#fecaca' }}>{ann.message}</p>
        </>
      )}

      {ann.type === 'scanning' && (
        <>
          <div style={{ width: 80, height: 80, borderRadius: '50%', border: `6px solid ${D.green}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', marginBottom: 32 }} />
          <p style={{ margin: 0, fontSize: 48, fontWeight: 900, color: D.sub }}>Scanning Vehicle…</p>
          <p style={{ margin: '16px 0 0', fontSize: 22, color: D.muted }}>Please wait at the gate</p>
        </>
      )}

      {ann.type === 'welcome' && (
        <div style={{ textAlign: 'center', animation: 'slideUp 0.4s ease' }}>
          <p style={{ margin: '0 0 8px', fontSize: 28, color: D.sub, letterSpacing: 4, textTransform: 'uppercase' }}>Welcome to IUIU Smart Parking</p>
          <div style={{
            margin: '0 auto 24px',
            background: `linear-gradient(135deg, ${D.greenDim}, #166534)`,
            border: `4px solid ${D.green}`,
            borderRadius: 24,
            padding: '32px 64px',
            boxShadow: `0 0 60px ${D.green}50`,
          }}>
            <p style={{ margin: 0, fontSize: 24, color: '#86efac', fontWeight: 700, letterSpacing: 2 }}>YOUR SLOT IS</p>
            <p style={{ margin: '8px 0', fontSize: 140, fontWeight: 900, color: D.green, lineHeight: 1, letterSpacing: -4, textShadow: `0 0 40px ${D.green}` }}>
              {ann.slotNumber}
            </p>
            {ann.plate && (
              <p style={{ margin: '8px 0 0', fontSize: 28, color: '#d1fae5', fontFamily: 'monospace', letterSpacing: 4, fontWeight: 700 }}>
                {ann.vehicleType && <span style={{ marginRight: 16 }}>{ann.vehicleType === 'car' ? '🚗' : ann.vehicleType === 'motorcycle' ? '🏍' : ann.vehicleType === 'truck' ? '🚛' : ann.vehicleType === 'van' ? '🚐' : '🚗'}</span>}
                {ann.plate}
              </p>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 28, color: D.sub }}>
            Please proceed to Slot <strong style={{ color: D.text }}>{ann.slotNumber}</strong>
          </p>
          {ann.remaining !== undefined && ann.remaining > 0 && (
            <p style={{ margin: '20px 0 0', fontSize: 16, color: D.muted }}>
              Returning to main view in {ann.remaining}s…
            </p>
          )}
        </div>
      )}

      {ann.type === 'full' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 24px', fontSize: 100 }}>🚫</p>
          <p style={{ margin: 0, fontSize: 72, fontWeight: 900, color: D.red, lineHeight: 1 }}>LOT FULL</p>
          <p style={{ margin: '20px 0 0', fontSize: 28, color: D.sub }}>No spaces available — please try another lot</p>
        </div>
      )}
    </div>
  );
}

// ── Seamless Ticker ───────────────────────────────────────────────────────────
// Text is doubled; animation moves it left by exactly 50% of its total width
// so the second copy seamlessly replaces the first — no gap, no jump.
function Ticker({ lotName, available, total }: { lotName: string; available: number; total: number }) {
  const msg = `  🅿  Welcome to IUIU Smart Parking  ·  ${lotName}  ·  ${available} of ${total} spaces available  ·  Please collect your ticket at the gate  ·  Drive safely  ·  Karibu IUIU Smart Parking  `;
  return (
    <div style={{ overflow: 'hidden', background: D.accent, height: 42, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <span style={{
        fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 0.8,
        whiteSpace: 'nowrap',
        display: 'inline-block',
        animation: 'tickerLoop 35s linear infinite',
      }}>
        {msg}{msg}
      </span>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      {[
        { color: D.green,  label: 'Available' },
        { color: D.red,    label: 'Occupied'  },
        { color: D.orange, label: 'Reserved'  },
        { color: D.muted,  label: 'Maintenance' },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 16, height: 16, borderRadius: 3, background: color }} />
          <span style={{ fontSize: 13, color: D.sub }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface Props {
  onClose?: () => void;
}

export default function EntranceDisplayScreen({ onClose }: Props) {
  const [lots,       setLots]       = useState<ParkingLot[]>([]);
  const [activeLot,  setActiveLot]  = useState<ParkingLot | null>(null);
  const [slots,      setSlots]      = useState<ParkingSlot[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [ann,        setAnn]        = useState<Announcement | null>(null);
  const [highlight,  setHighlight]  = useState<string | null>(null); // slot_number to flash
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load lots then slots ─────────────────────────────────────────────────
  const loadSlots = useCallback(async (lot: ParkingLot) => {
    try {
      const res = await slotsAPI.list({ lot: lot.id });
      // handle both paginated {results:[]} and plain array []
      const items: ParkingSlot[] = Array.isArray(res.data)
        ? (res.data as any)
        : (res.data as any).results ?? [];
      setSlots(items);
    } catch (e) {
      console.error('EntranceDisplay: slots load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await lotsAPI.list();
        if (cancelled) return;
        // handle both paginated and plain array responses
        const items: ParkingLot[] = Array.isArray(res.data)
          ? (res.data as any)
          : (res.data as any).results ?? [];
        setLots(items);
        if (items.length) {
          const first = items[0];
          setActiveLot(first);
          await loadSlots(first);
        } else {
          // no lots configured — still stop the spinner
          setLoading(false);
        }
      } catch (e) {
        console.error('EntranceDisplay: lots load failed', e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadSlots]);

  // Reload slots when the attendant switches lot (lot selector in header)
  useEffect(() => {
    if (!activeLot) return;
    loadSlots(activeLot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLot?.id]);

  // Helpers
  const clearAnn = useCallback(() => {
    setAnn(null);
    setHighlight(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const showWelcome = useCallback((ticket: Ticket) => {
    const DURATION = 12; // seconds on screen
    setHighlight(ticket.slot_number ?? null);
    setAnn({
      type: 'welcome',
      slotNumber:  ticket.slot_number ?? '—',
      plate:       ticket.license_plate,
      vehicleType: ticket.vehicle_type,
      remaining:   DURATION,
    });
    if (countdownRef.current) clearInterval(countdownRef.current);
    let left = DURATION;
    countdownRef.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearAnn();
      } else {
        setAnn(prev => prev ? { ...prev, remaining: left } : null);
      }
    }, 1000);
  }, [clearAnn]);

  // WebSocket
  useLotWebSocket(activeLot?.id ?? '', {
    slot_update: (payload: any) => {
      setSlots(prev => prev.map(s => s.id === payload.id ? { ...s, ...payload } : s));
      setActiveLot(prev => prev && prev.id === payload.lot ? { ...prev, ...payload } : prev);
    },

    ticket_created: (payload: any) => {
      // New ticket issued at entrance → show welcome + slot
      if (payload.slot_number || payload.license_plate) {
        showWelcome(payload as Ticket);
      }
      // Refresh lot occupancy
      if (activeLot) {
        lotsAPI.get(activeLot.id).then(r =>
          setActiveLot(r.data)
        ).catch(() => {});
      }
    },

    alert: (payload: any) => {
      if (payload.alert_type === 'fire') {
        clearAnn();
        setAnn({ type: 'fire', message: payload.message ?? 'Fire detected — evacuate now!' });
      }
    },

  });

  // Derived stats
  const vacant     = slots.filter(s => s.status === 'vacant').length;
  const occupied   = slots.filter(s => s.status === 'occupied').length;
  const reserved   = slots.filter(s => s.status === 'reserved').length;
  const total      = slots.length;
  const pctFull    = total > 0 ? Math.round((occupied + reserved) / total * 100) : 0;
  const isFull     = activeLot?.is_full ?? false;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', border: `5px solid #1f2937`, borderTopColor: D.green, animation: 'spin 0.8s linear infinite', margin: '0 auto 24px' }} />
          <p style={{ color: D.sub, fontSize: 20, margin: 0 }}>Loading display…</p>
        </div>
      </div>
    );
  }

  return (
    <>
    {/* ── ROOT: fixed, full viewport, NO overflow at any level ─────────── */}
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: D.bg,
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100vh',
    }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        background: D.panel,
        borderBottom: `1px solid ${D.border}`,
        padding: '12px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        height: 76,
      }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${D.accent}, #14532d)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 26 }}>🅿</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: D.text, lineHeight: 1.2 }}>IUIU Smart Parking</p>
            <p style={{ margin: 0, fontSize: 12, color: D.sub }}>
              Islamic University in Uganda &nbsp;·&nbsp; {activeLot?.name ?? 'Entrance Display'}
            </p>
          </div>
        </div>

        {/* Lot selector */}
        {lots.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {lots.map(l => (
              <button key={l.id} onClick={() => { setActiveLot(l); setSlots([]); }} style={{
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                border: `2px solid ${activeLot?.id === l.id ? D.green : D.border}`,
                background: activeLot?.id === l.id ? `${D.green}20` : D.panel,
                color: activeLot?.id === l.id ? D.green : D.sub,
              }}>
                {l.name}
              </button>
            ))}
          </div>
        )}

        {/* Clock + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <LiveClock />
          {onClose && (
            <button onClick={onClose} style={{
              width: 40, height: 40, borderRadius: '50%', background: '#1f2937',
              border: `2px solid ${D.border}`, color: D.sub, fontSize: 18,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          )}
        </div>
      </header>

      {/* ── MAIN (fills space between header and ticker, NO scroll) ─────── */}
      <main style={{
        flex: 1,
        minHeight: 0,          /* ← critical: lets flex child shrink below content height */
        display: 'grid',
        gridTemplateColumns: '340px 1fr',
        overflow: 'hidden',
        position: 'relative',
      }}>

        {/* ── LEFT PANEL — stats (no overflow) ────────────────────────── */}
        <div style={{
          background: '#0d1320',
          borderRight: `1px solid ${D.border}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 20px',
          gap: 12,
          overflow: 'hidden',  /* never scrolls */
          minHeight: 0,
        }}>

          {/* Big available number */}
          <div style={{
            flexShrink: 0,
            textAlign: 'center',
            padding: '14px 0',
            borderRadius: 16,
            background: isFull ? '#1c0a0a' : `${D.green}12`,
            border: `2px solid ${isFull ? D.red : D.green}30`,
          }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: D.sub, letterSpacing: 3, textTransform: 'uppercase' }}>
              {isFull ? '⛔ LOT FULL' : '✅ SPACES AVAILABLE'}
            </p>
            <p style={{
              margin: '4px 0 0',
              fontSize: 96, fontWeight: 900, lineHeight: 1,
              color: isFull ? D.red : D.green,
              textShadow: `0 0 40px ${isFull ? D.red : D.green}90`,
            }}>
              {vacant}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: D.sub }}>of {total} total slots</p>
          </div>

          {/* Stat rows */}
          {[
            { label: 'Occupied',  value: occupied, color: D.red,    icon: '🚗' },
            { label: 'Reserved',  value: reserved, color: D.orange, icon: '◆'  },
            { label: 'Available', value: vacant,   color: D.green,  icon: '✅'  },
          ].map(({ label, value, color, icon }) => (
            <div key={label} style={{
              flexShrink: 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px',
              background: `${color}0d`, borderRadius: 10, border: `1px solid ${color}25`,
            }}>
              <span style={{ fontSize: 14, color: D.sub, fontWeight: 600 }}>{icon} {label}</span>
              <span style={{ fontSize: 26, fontWeight: 900, color }}>{value}</span>
            </div>
          ))}

          {/* Capacity bar */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: D.sub }}>Capacity used</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pctFull > 90 ? D.red : pctFull > 70 ? D.orange : D.green }}>
                {pctFull}%
              </span>
            </div>
            <div style={{ height: 10, background: D.border, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pctFull}%`,
                background: pctFull > 90 ? D.red : pctFull > 70 ? D.orange : D.green,
                borderRadius: 5,
                transition: 'width 0.6s ease, background 0.3s',
                boxShadow: `0 0 8px ${pctFull > 90 ? D.red : D.green}60`,
              }} />
            </div>
          </div>

          {/* Legend — pushed to bottom */}
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${D.border}`, flexShrink: 0 }}>
            <Legend />
          </div>
        </div>

        {/* ── RIGHT PANEL — slot grid (no overflow) ───────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '14px 20px',
          overflow: 'hidden',
          minHeight: 0,
          gap: 10,
        }}>
          {/* Grid header */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: D.text }}>🅿 Parking Slot Map</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: D.sub }}>
                Live — updates automatically when vehicles enter or exit
              </p>
            </div>
            <div style={{ padding: '4px 14px', borderRadius: 20, background: `${D.green}20`, border: `1px solid ${D.green}40` }}>
              <span style={{ color: D.green, fontWeight: 700, fontSize: 12 }}>● LIVE</span>
            </div>
          </div>

          {/* Slot grid — flex: 1 + minHeight: 0 fills remaining space */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {slots.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: D.muted }}>
                <p style={{ fontSize: 48, margin: 0 }}>🅿</p>
                <p style={{ marginTop: 12, fontSize: 16 }}>No slots configured for this lot</p>
              </div>
            ) : (
              /* grid-auto-rows: 1fr makes ALL rows equal height and fills the container */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))',
                gridAutoRows: '1fr',
                gap: 6,
                height: '100%',
                overflow: 'hidden',
                alignContent: 'start',
              }}>
                {slots.map(slot => (
                  <SlotCell
                    key={slot.id}
                    slot={slot}
                    highlight={highlight === slot.slot_number}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Announcement covers the whole main area */}
        {ann && (
          <AnnouncementOverlay ann={ann} onDismiss={clearAnn} />
        )}
      </main>

      {/* ── TICKER — fixed height, seamless loop, never scrolls ─────────── */}
      <Ticker
        lotName={activeLot?.name ?? 'IUIU Parking'}
        available={vacant}
        total={total}
      />

      {/* ── CSS ─────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes fadeIn     { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp    { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse      { from { transform: scale(1); } to { transform: scale(1.08); } }
        @keyframes shimmer    { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
        /* tickerLoop: move left by exactly 50% (one copy of the doubled text) = seamless */
        @keyframes tickerLoop { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
    </>
  );
}
