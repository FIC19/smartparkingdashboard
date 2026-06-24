/**
 * IUIU Smart Parking — Entrance iPad Mini 4 Display
 * Full-screen public information panel showing live available spaces.
 * Flashes "FULL" / "SECTION FULL" warnings when capacity is hit.
 * Auto-polls the lot status every 5 seconds via WebSocket + REST fallback.
 */
import React, { useState, useEffect, useRef } from 'react';
import { lotsAPI } from '../api/client';
import { useLotWebSocket } from '../hooks/useWebSocket';
import type { ParkingLot, ParkingSlot, Alert, VehicleClass } from '../types';

// ── IUIU palette (green / white) ─────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d', white: '#ffffff',
  red: '#dc2626', orange: '#d97706',
};

// ─────────────────────────────────────────────────────────────────────────────
// SLOT AVAILABILITY GRID
// ─────────────────────────────────────────────────────────────────────────────

function SlotDot({ status }: { status: string }) {
  const bg = status === 'vacant' ? G.primary : status === 'occupied' ? G.red : '#9ca3af';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6,
      background: bg, transition: 'background 0.4s',
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRANCE PANEL
// ─────────────────────────────────────────────────────────────────────────────

export default function EntrancePanel() {
  const [lot,       setLot]       = useState<ParkingLot | null>(null);
  const [slots,     setSlots]     = useState<ParkingSlot[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [flash,     setFlash]     = useState(false);
  const [fireMode,  setFireMode]  = useState(false);
  const flashRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load first lot on mount
  useEffect(() => {
    lotsAPI.list().then(res => {
      const first = res.data.results[0];
      if (!first) return;
      setLot(first);
      lotsAPI.slotsStatus(first.id).then(r => setSlots(r.data));
    });
  }, []);

  // Flash animation when full or fire
  useEffect(() => {
    const shouldFlash = lot?.is_full || fireMode;
    if (shouldFlash) {
      flashRef.current = setInterval(() => setFlash(f => !f), 600);
    } else {
      if (flashRef.current) clearInterval(flashRef.current);
      setFlash(false);
    }
    return () => { if (flashRef.current) clearInterval(flashRef.current); };
  }, [lot?.is_full, fireMode]);

  // Real-time WebSocket updates
  useLotWebSocket(lot?.id ?? '', {
    slot_update: (payload: any) => {
      setSlots(prev => prev.map(s => s.id === payload.id ? { ...s, ...payload } : s));
      // Re-fetch lot for updated counts
      if (lot) lotsAPI.get(lot.id).then(r => setLot(r.data));
    },
    slots_snapshot: (payload: any) => {
      setSlots(payload);
    },
    alert: (payload: any) => {
      setAlerts(prev => [payload, ...prev]);
      if (payload.alert_type === 'fire') setFireMode(true);
      if (payload.alert_type === 'lot_full' && lot) {
        lotsAPI.get(lot.id).then(r => setLot(r.data));
      }
    },
  });

  // REST poll fallback every 10 seconds
  useEffect(() => {
    if (!lot) return;
    const interval = setInterval(() => {
      Promise.all([lotsAPI.get(lot.id), lotsAPI.slotsStatus(lot.id)]).then(([lotRes, slotRes]) => {
        setLot(lotRes.data);
        setSlots(slotRes.data);
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [lot]);

  // Group slots by vehicle class
  const slotsByClass: Record<VehicleClass, ParkingSlot[]> = {
    car: slots.filter(s => s.slot_type_detail?.vehicle_class === 'car'),
    truck: slots.filter(s => s.slot_type_detail?.vehicle_class === 'truck'),
    cycle: slots.filter(s => s.slot_type_detail?.vehicle_class === 'cycle'),
  };
  const classLabel: Record<VehicleClass, string> = {
    car: '🚗 Cars', truck: '🚛 Trucks / Vans', cycle: '🏍 Cycles',
  };

  // ── FIRE ALERT SCREEN ─────────────────────────────────────────────────────
  if (fireMode) {
    return (
      <div style={{
        ...s.root,
        background: flash ? G.red : '#7f1d1d',
        transition: 'background 0.3s',
      }}>
        <div style={s.fireScreen}>
          <p style={{ fontSize: 80, margin: 0 }}>🔥</p>
          <h1 style={{ ...s.fireTitle, color: G.white }}>!! FIRE ALERT !!</h1>
          <h2 style={{ color: '#fecaca', fontWeight: 600 }}>EVACUATE THE AREA IMMEDIATELY</h2>
          <p style={{ color: '#fca5a5', fontSize: 20 }}>
            All gates are now open. Please exit calmly.
          </p>
        </div>
      </div>
    );
  }

  // ── PARKING FULL SCREEN ───────────────────────────────────────────────────
  if (lot?.is_full) {
    return (
      <div style={{
        ...s.root,
        background: flash ? G.red : '#7f1d1d',
        transition: 'background 0.4s',
      }}>
        <div style={s.centreContent}>
          <div style={s.logoArea}>
            <span style={{ fontSize: 56 }}>🅿</span>
            <p style={s.logoText}>{lot?.name}</p>
          </div>
          <h1 style={{ ...s.fullTitle, color: G.white }}>
            PARKING FULL
          </h1>
          <p style={{ color: '#fca5a5', fontSize: 22, fontWeight: 600 }}>
            No spaces available at this time
          </p>
          <p style={{ color: '#fecaca', fontSize: 16 }}>
            Please try another campus parking area
          </p>
        </div>
      </div>
    );
  }

  // ── NORMAL WELCOME SCREEN ─────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* Unresolved fire alert strip */}
      {alerts.some(a => a.alert_type !== 'lot_full' && !a.is_resolved) && (
        <div style={s.alertStrip}>
          ⚠ System alert active — contact attendant
        </div>
      )}

      {/* Logo / Header */}
      <div style={s.logoArea}>
        <span style={{ fontSize: 48 }}>🅿</span>
        <div>
          <h1 style={s.lotName}>{lot?.name ?? 'IUIU Smart Parking'}</h1>
          <p style={s.lotSub}>Kampala Campus · Islamic University in Uganda</p>
        </div>
      </div>

      {/* Giant available count */}
      <div style={s.countBlock}>
        <p style={s.countLabel}>WELCOME!</p>
        <p style={s.countNumber}>{lot?.available_slots ?? '—'}</p>
        <p style={s.countSub}>spaces available of {lot?.total_capacity ?? '—'}</p>
      </div>

      {/* Section-level breakdown */}
      <div style={s.sectionGrid}>
        {(Object.keys(slotsByClass) as VehicleClass[]).map(cls => {
          const group   = slotsByClass[cls];
          if (!group.length) return null;
          const vacant  = group.filter(s => s.status === 'vacant').length;
          const isFull  = vacant === 0;
          return (
            <div key={cls} style={{
              ...s.sectionCard,
              borderColor: isFull ? G.red : G.primary,
              background: isFull ? '#fef2f2' : 'rgba(255,255,255,0.12)',
            }}>
              <p style={{ ...s.sectionTitle, color: isFull ? G.red : G.white }}>
                {classLabel[cls]}
              </p>
              <p style={{ ...s.sectionCount, color: isFull ? G.red : G.white }}>
                {isFull ? 'SECTION FULL' : `${vacant} / ${group.length}`}
              </p>
              {/* Mini slot grid */}
              <div style={s.miniGrid}>
                {group.map(slot => (
                  <SlotDot key={slot.id} status={slot.status} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.legendRow}>
          <span style={s.dot(G.primary)} /> Vacant &nbsp;&nbsp;
          <span style={s.dot(G.red)}     /> Occupied
        </div>
        <p style={s.footerTime}>
          Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s: Record<string, any> = {
  root: {
    minHeight: '100vh', minWidth: '100vw',
    background: `linear-gradient(160deg, ${G.dark} 0%, #166534 60%, #15803d 100%)`,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '32px 24px',
    fontFamily: "'Inter', system-ui, sans-serif",
    color: G.white, textAlign: 'center',
    userSelect: 'none',
  },
  alertStrip: {
    position: 'fixed', top: 0, left: 0, right: 0,
    background: G.orange, color: G.white, fontWeight: 700,
    padding: '10px', fontSize: 16, textAlign: 'center',
  },
  logoArea: {
    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
  },
  lotName: { margin: 0, fontSize: 28, fontWeight: 900, color: G.white },
  lotSub:  { margin: '4px 0 0', fontSize: 14, color: '#86efac' },
  countBlock: { marginBottom: 32, textAlign: 'center' },
  countLabel: {
    margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: 4,
    color: '#86efac', textTransform: 'uppercase',
  },
  countNumber: {
    margin: '0', fontSize: 140, fontWeight: 900, lineHeight: 1,
    color: G.white, textShadow: '0 4px 30px rgba(0,0,0,0.3)',
  },
  countSub: {
    margin: '4px 0 0', fontSize: 22, color: '#bbf7d0', fontWeight: 600,
  },
  sectionGrid: {
    display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center',
    marginBottom: 24, width: '100%', maxWidth: 900,
  },
  sectionCard: {
    flex: '1 1 220px', border: '2px solid', borderRadius: 20,
    padding: '20px 16px',
  },
  sectionTitle: { margin: '0 0 4px', fontSize: 16, fontWeight: 700 },
  sectionCount: { margin: '0 0 14px', fontSize: 32, fontWeight: 900 },
  miniGrid: {
    display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
  },
  footer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  legendRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 14, color: '#bbf7d0',
  },
  dot: (color: string): React.CSSProperties => ({
    display: 'inline-block', width: 12, height: 12,
    borderRadius: 3, background: color, marginRight: 4,
  }),
  footerTime: { margin: 0, fontSize: 12, color: '#86efac' },
  // Fire / full screens
  fireScreen: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  fireTitle: {
    fontSize: 72, fontWeight: 900, margin: 0, letterSpacing: 4,
  },
  centreContent: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  fullTitle: {
    fontSize: 80, fontWeight: 900, margin: '16px 0', letterSpacing: 6,
  },
};
