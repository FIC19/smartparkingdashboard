/**
 * IUIU Smart Parking — Entrance Attendant Dashboard
 *
 * Designed for: Sunmi V2 Pro (Android POS), mobile phones, tablets, desktop
 * Device features:
 *   • Sunmi V2 Pro built-in barcode scanner → HID keyboard output (auto-captured by inputs)
 *   • Sunmi V2 Pro thermal printer → SunmiInnerPrinter JS API (58mm receipt)
 *   • Desktop/tablet → window.print() with thermal CSS fallback
 *   • All devices → browser camera API for vehicle/plate capture
 *
 * Menu sections:
 *   1. Dashboard   — slot status grid, today's stats
 *   2. Scan & Issue — QR/barcode scan, manual lookup, issue ticket, print receipt
 *   3. Gate Control — manual gate open (log only, no charge), available slots
 *   4. Vehicle Log  — today's entry table with search
 */
import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  lotsAPI, slotsAPI, entrancesAPI, ticketsAPI, assignmentsAPI,
} from '../api/client';
import EntranceDisplayScreen from './EntranceDisplayScreen';
import { useLotWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';
import type {
  ParkingLot, ParkingSlot, Entrance, Ticket, VehicleType, AttendantAssignment,
} from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d', light: '#dcfce7', lighter: '#f0fdf4',
  white:   '#ffffff', border: '#bbf7d0', text: '#111827', muted: '#6b7280',
  red:     '#dc2626', orange: '#d97706', blue: '#2563eb', purple: '#7c3aed',
  sidebar: '#0f3d1f',
};

const VTYPE_ICONS: Record<string, string> = {
  car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛', bus: '🚌',
};
const VEHICLE_TYPES: VehicleType[] = ['car', 'motorcycle', 'bicycle', 'van', 'truck', 'bus'];

// ── Sunmi V2 Pro printer detection & wrapper ─────────────────────────────────
const SunmiPrinter = {
  isAvailable: (): boolean =>
    !!(window as any).SunmiInnerPrinter ||
    !!(window as any).sunmiPrinter ||
    !!(window as any).Android?.printReceipt,

  printReceipt: (lines: string[]): void => {
    const printer =
      (window as any).SunmiInnerPrinter ||
      (window as any).sunmiPrinter;
    if (printer) {
      try {
        printer.printerInit?.();
        printer.setAlignment?.(1); // center
        lines.forEach(line => {
          if (line.startsWith('__BOLD__')) {
            printer.sendRAWData?.('\x1b\x45\x01');
            printer.printText?.(line.replace('__BOLD__', '') + '\n');
            printer.sendRAWData?.('\x1b\x45\x00');
          } else if (line.startsWith('__QR__')) {
            printer.printQRCode?.(line.replace('__QR__', ''), 6, 0);
          } else {
            printer.printText?.(line + '\n');
          }
        });
        printer.printText?.('\n\n\n');
        printer.cutPaper?.();
      } catch {}
    } else if ((window as any).Android?.printReceipt) {
      (window as any).Android.printReceipt(lines.join('\n'));
    }
  },
};

// ── Receipt printer ──────────────────────────────────────────────────────────
function printTicketReceipt(ticket: Ticket, lot: ParkingLot | null) {
  const lines = [
    '__BOLD__IUIU SMART PARKING',
    lot?.name ?? 'IUIU Campus',
    '================================',
    `Ticket: #${ticket.ticket_number}`,
    `Type  : ${ticket.vehicle_type.toUpperCase()}`,
    `Plate : ${ticket.license_plate || 'N/A'}`,
    `Slot  : ${ticket.slot_number ?? 'N/A'}`,
    `In    : ${new Date(ticket.entry_time).toLocaleString()}`,
    '================================',
    'Keep receipt for exit.',
    '================================',
    `__QR__${ticket.ticket_number}`,
    '================================',
    'Thank you!',
  ];

  if (SunmiPrinter.isAvailable()) {
    SunmiPrinter.printReceipt(lines);
    return;
  }

  // Browser print fallback — inject hidden print div
  const existing = document.getElementById('__receipt_print_area__');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = '__receipt_print_area__';
  div.innerHTML = `
    <style>
      @media print {
        body > *:not(#__receipt_print_area__) { display: none !important; }
        #__receipt_print_area__ {
          display: block !important; width: 58mm; font-family: monospace;
          font-size: 12px; padding: 4px;
        }
        #__receipt_print_area__ h2 { font-size: 14px; margin: 4px 0; text-align: center; }
        #__receipt_print_area__ .divider { border-top: 1px dashed #000; margin: 4px 0; }
        #__receipt_print_area__ .row { display: flex; justify-content: space-between; }
        #__receipt_print_area__ .center { text-align: center; }
        #__receipt_print_area__ .qr { width: 100px; height: 100px; margin: 0 auto; display: block; }
      }
      #__receipt_print_area__ { display: none; }
    </style>
    <h2>IUIU SMART PARKING</h2>
    <div class="center">${lot?.name ?? 'IUIU Campus'}</div>
    <div class="divider"></div>
    <div class="row"><span>Ticket:</span><span>#${ticket.ticket_number}</span></div>
    <div class="row"><span>Type:</span><span>${ticket.vehicle_type.toUpperCase()}</span></div>
    <div class="row"><span>Plate:</span><span>${ticket.license_plate || 'N/A'}</span></div>
    <div class="row"><span>Slot:</span><span>${ticket.slot_number ?? 'N/A'}</span></div>
    <div class="row"><span>In:</span><span>${new Date(ticket.entry_time).toLocaleTimeString()}</span></div>
    <div class="divider"></div>
    <div class="center">Keep receipt for exit</div>
    <div class="center" style="margin-top:8px">
      <canvas id="__qr_canvas__" class="qr"></canvas>
    </div>
    <div class="divider"></div>
    <div class="center">Thank you!</div>
  `;
  document.body.appendChild(div);
  window.print();
}

// ═══════════════════════════════════════════════════════════════════════════
// SLOT STATUS GRID
// ═══════════════════════════════════════════════════════════════════════════

function SlotGrid({ slots }: { slots: ParkingSlot[] }) {
  const statusColor: Record<string, string> = {
    vacant:      G.primary,
    occupied:    G.red,
    reserved:    G.orange,
    maintenance: G.muted,
  };
  const statusLabel: Record<string, string> = {
    vacant: '✓', occupied: '■', reserved: '◆', maintenance: '✕',
  };

  const counts = {
    vacant:      slots.filter(s => s.status === 'vacant').length,
    occupied:    slots.filter(s => s.status === 'occupied').length,
    reserved:    slots.filter(s => s.status === 'reserved').length,
    maintenance: slots.filter(s => s.status === 'maintenance').length,
  };

  return (
    <div>
      {/* Status counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { key: 'vacant',      label: 'Available',   icon: '🟢', color: G.primary },
          { key: 'occupied',    label: 'Occupied',    icon: '🔴', color: G.red },
          { key: 'reserved',    label: 'Booked',      icon: '🟠', color: G.orange },
          { key: 'maintenance', label: 'Maintenance', icon: '⚫', color: G.muted },
        ].map(({ key, label, icon, color }) => (
          <div key={key} style={{
            background: G.white, border: `2px solid ${color}20`,
            borderLeft: `5px solid ${color}`,
            borderRadius: 12, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color }}>{counts[key as keyof typeof counts]}</p>
              <p style={{ margin: 0, fontSize: 12, color: G.muted, fontWeight: 600 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {Object.entries(statusColor).map(([st, col]) => (
          <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: G.muted }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: col, display: 'inline-block' }} />
            {st.charAt(0).toUpperCase() + st.slice(1)}
          </div>
        ))}
      </div>

      {/* Slot grid */}
      {slots.length === 0 ? (
        <p style={{ color: G.muted, textAlign: 'center', padding: 24, fontSize: 14 }}>No slots loaded. Check connectivity.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6 }}>
          {slots.map(slot => (
            <div key={slot.id} title={`${slot.slot_number} — ${slot.status}`} style={{
              height: 48, borderRadius: 8, background: statusColor[slot.status] ?? G.muted,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'default', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}>
              <span style={{ color: G.white, fontSize: 10, fontWeight: 700 }}>{slot.slot_number}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{statusLabel[slot.status] ?? '?'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCAN & ISSUE PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ScanIssuePanel({
  lot, entrances, onTicketIssued, showToast,
}: {
  lot: ParkingLot | null;
  entrances: Entrance[];
  onTicketIssued: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [scanInput, setScanInput]   = useState('');
  const [foundTicket, setFoundTicket] = useState<Ticket | null>(null);
  const [searching, setSearching]   = useState(false);
  const [cameraOn, setCameraOn]     = useState(false);
  const [stream, setStream]         = useState<MediaStream | null>(null);

  // Issue ticket state
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [plate, setPlate]           = useState('');
  const [entranceId, setEntranceId] = useState(entrances[0]?.id ?? '');
  const [issuing, setIssuing]       = useState(false);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [isExempt, setIsExempt]     = useState(false);
  const [exemptReason, setExemptReason] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef  = useRef<HTMLInputElement>(null);

  // Auto-focus scan input
  useEffect(() => { scanRef.current?.focus(); }, []);

  // Update entrance ID when entrances load
  useEffect(() => {
    if (entrances.length && !entranceId) setEntranceId(entrances[0].id);
  }, [entrances]);

  // Camera
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      });
      setStream(s);
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      showToast('📷 Camera not available on this device.');
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setCameraOn(false);
  };

  const captureFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    // Auto-fill plate from captured image (AI endpoint stub)
    showToast('📷 Frame captured. Enter plate manually if needed.');
    stopCamera();
  };

  // Scan input: HID barcode scanner or manual type + Enter
  const handleScanKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      await lookupTicket(scanInput.trim());
    }
  };

  const lookupTicket = async (query: string) => {
    setSearching(true);
    setFoundTicket(null);
    try {
      const res = await ticketsAPI.list({ search: query });
      const found = res.data.results[0] ?? null;
      setFoundTicket(found);
      if (!found) showToast(`❓ No ticket found for "${query}"`);
    } catch {
      showToast('❌ Lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleIssueTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot || !entranceId) { showToast('⚠ Select a lot and entrance gate first.'); return; }
    setIssuing(true);
    try {
      const res = await ticketsAPI.create({
        lot: lot.id, entrance: entranceId,
        vehicle_type: vehicleType, license_plate: plate.toUpperCase(),
        is_service_exempt: isExempt,
        exempt_reason: isExempt ? exemptReason : '',
      });
      const ticket = res.data;
      setLastTicket(ticket);
      onTicketIssued(ticket);
      showToast(`✅ Ticket #${ticket.ticket_number} issued.`);
      // Auto-print
      printTicketReceipt(ticket, lot);
      setPlate(''); setIsExempt(false); setExemptReason('');
      setTimeout(() => scanRef.current?.focus(), 200);
    } catch (err: any) {
      showToast(`❌ ${err?.response?.data?.detail ?? 'Failed to issue ticket.'}`);
    } finally {
      setIssuing(false);
    }
  };

  const handleManualPrint = () => {
    if (lastTicket) printTicketReceipt(lastTicket, lot);
    else showToast('⚠ No recent ticket to print.');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* LEFT: Scan & Lookup */}
      <div>
        {/* Scanner input */}
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: G.dark }}>
            🔍 Scan / Lookup Ticket
          </h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: G.muted }}>
            Scan barcode with handheld / built-in scanner, or type ticket number and press Enter.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>🔎</span>
              <input
                ref={scanRef}
                style={{
                  width: '100%', padding: '13px 12px 13px 40px',
                  border: `2px solid ${G.primary}`, borderRadius: 10,
                  fontSize: 16, color: G.text, fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
                placeholder="Scan barcode or enter ticket #…"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleScanKey}
                autoFocus
              />
            </div>
            <button
              onClick={() => scanInput.trim() && lookupTicket(scanInput.trim())}
              style={{ padding: '13px 18px', background: G.primary, color: G.white, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              {searching ? '…' : 'Go'}
            </button>
          </div>

          {/* Camera trigger */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={cameraOn ? stopCamera : startCamera}
              style={{
                flex: 1, padding: '12px', border: `1.5px solid ${G.border}`,
                borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: cameraOn ? G.red : G.lighter, color: cameraOn ? G.white : G.dark,
              }}>
              {cameraOn ? '🚫 Stop Camera' : '📷 Open Camera'}
            </button>
          </div>

          {/* Camera viewfinder */}
          {cameraOn && (
            <div style={{ marginTop: 12, position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', display: 'block', borderRadius: 10 }} />
              <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(22,163,74,0.7)', borderRadius: 10, pointerEvents: 'none' }}>
                {/* Scan guides */}
                <div style={{ position: 'absolute', top: '25%', left: '20%', right: '20%', bottom: '25%', border: '2px solid rgba(255,255,255,0.6)', borderRadius: 4 }} />
              </div>
              <button
                onClick={captureFrame}
                style={{
                  position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                  padding: '12px 24px', background: G.primary, color: G.white,
                  border: '3px solid white', borderRadius: 30, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                }}>
                📸 Capture
              </button>
            </div>
          )}
        </div>

        {/* Found ticket details */}
        {foundTicket && (
          <div style={{ background: G.light, border: `2px solid ${G.primary}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>🎫 Ticket Found</h3>
              <span style={{
                padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                background: foundTicket.status === 'active' ? G.primary : G.muted, color: G.white,
              }}>
                {foundTicket.status.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {[
                ['Ticket #', `#${foundTicket.ticket_number}`],
                ['Vehicle', `${VTYPE_ICONS[foundTicket.vehicle_type]} ${foundTicket.vehicle_type}`],
                ['Plate', foundTicket.license_plate || '—'],
                ['Slot', foundTicket.slot_number ?? '—'],
                ['Entry', new Date(foundTicket.entry_time).toLocaleTimeString()],
                ['Duration', `${Math.floor(foundTicket.duration_hours)}h ${Math.floor((foundTicket.duration_hours % 1)*60)}m`],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: G.muted, fontSize: 11, fontWeight: 600, display: 'block' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: G.dark }}>{v}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => printTicketReceipt(foundTicket, lot)}
              style={{ marginTop: 14, width: '100%', padding: '10px', background: G.dark, color: G.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              🖨 Print Receipt
            </button>
          </div>
        )}

        {/* Last issued ticket */}
        {lastTicket && !foundTicket && (
          <div style={{ background: '#f0fdf4', border: `1.5px solid ${G.primary}`, borderRadius: 12, padding: '14px 18px', fontSize: 13 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, color: G.dark }}>✅ Last Issued: #{lastTicket.ticket_number}</p>
            <p style={{ margin: 0, color: G.muted }}>
              {VTYPE_ICONS[lastTicket.vehicle_type]} {lastTicket.vehicle_type} · {lastTicket.license_plate || 'no plate'} · Slot {lastTicket.slot_number ?? '—'}
            </p>
            <button onClick={handleManualPrint} style={{ marginTop: 10, padding: '8px 16px', background: G.primary, color: G.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              🖨 Reprint Receipt
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Issue New Ticket */}
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: G.dark }}>
            🎫 Issue New Ticket
          </h3>
          <form onSubmit={handleIssueTicket}>
            {/* Vehicle type */}
            <label style={fS.label}>Vehicle Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
              {VEHICLE_TYPES.map(vt => (
                <button key={vt} type="button" onClick={() => setVehicleType(vt)} style={{
                  padding: '10px 4px', borderRadius: 10,
                  border: `2px solid ${vehicleType === vt ? G.primary : G.border}`,
                  background: vehicleType === vt ? G.light : G.white,
                  cursor: 'pointer', fontWeight: 700, fontSize: 10, color: G.text,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 22 }}>{VTYPE_ICONS[vt]}</span>
                  {vt.slice(0, 5)}
                </button>
              ))}
            </div>

            {/* Entrance gate */}
            <label style={fS.label}>Entrance Gate</label>
            <select style={{ ...fS.input, marginBottom: 12 }} value={entranceId}
              onChange={e => setEntranceId(e.target.value)} required>
              {entrances.length === 0 && <option value="">No gates configured</option>}
              {entrances.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>

            {/* License plate */}
            <label style={fS.label}>License Plate</label>
            <input
              style={{ ...fS.input, marginBottom: 12, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2, fontSize: 15 }}
              placeholder="UAA 123B"
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase())}
            />

            {/* Exempt toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isExempt ? 10 : 16, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)}
                style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 600, color: G.orange }}>🆓 Service / Exempt Vehicle (no charge)</span>
            </label>
            {isExempt && (
              <input style={{ ...fS.input, marginBottom: 14 }}
                placeholder="Reason (e.g. KCCA, Staff, Campus Carrier)"
                value={exemptReason} onChange={e => setExemptReason(e.target.value)} required={isExempt} />
            )}

            {lot?.is_full && !isExempt && (
              <div style={{ background: '#fef2f2', border: `1.5px solid #fecaca`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: G.red, fontWeight: 600 }}>
                ⚠ Lot is FULL — no vacant slots available.
              </div>
            )}

            <button type="submit" disabled={issuing || (!isExempt && !!lot?.is_full)} style={{
              width: '100%', padding: '14px',
              background: issuing ? G.muted : G.primary, color: G.white,
              border: 'none', borderRadius: 10, cursor: issuing ? 'not-allowed' : 'pointer',
              fontWeight: 800, fontSize: 16, letterSpacing: 0.3,
            }}>
              {issuing ? 'Issuing…' : '🎫 Issue Ticket & Print Receipt'}
            </button>

            {SunmiPrinter.isAvailable() && (
              <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, color: G.primary }}>
                🖨 Sunmi printer detected — auto-print active
              </p>
            )}
            {!SunmiPrinter.isAvailable() && (
              <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, color: G.muted }}>
                🖨 Printing via browser print dialog
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Print styles injected to document once */}
      <style>{`
        @media print {
          body > *:not(#__receipt_print_area__) { display: none !important; }
          #__receipt_print_area__ { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE CONTROL PANEL
// ═══════════════════════════════════════════════════════════════════════════

function GateControlPanel({
  lot, entrances, slots, onQuickLog, showToast,
}: {
  lot: ParkingLot | null;
  entrances: Entrance[];
  slots: ParkingSlot[];
  onQuickLog: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [selectedGate, setSelectedGate] = useState(entrances[0]?.id ?? '');
  const [opening, setOpening]           = useState(false);

  // Quick log (no charge, no receipt)
  const [logVehicle, setLogVehicle]     = useState<VehicleType>('car');
  const [logPlate, setLogPlate]         = useState('');
  const [logging, setLogging]           = useState(false);
  const [reason, setReason]             = useState('');
  const [showLogForm, setShowLogForm]   = useState(false);

  const vacant      = slots.filter(s => s.status === 'vacant').length;
  const occupied    = slots.filter(s => s.status === 'occupied').length;
  const reserved    = slots.filter(s => s.status === 'reserved').length;
  const maintenance = slots.filter(s => s.status === 'maintenance').length;

  useEffect(() => {
    if (entrances.length && !selectedGate) setSelectedGate(entrances[0].id);
  }, [entrances]);

  const handleOpenGate = async () => {
    if (!selectedGate) { showToast('⚠ Select a gate first.'); return; }
    setOpening(true);
    try {
      await entrancesAPI.openGate(selectedGate);
      showToast('🔓 Gate opened successfully!');
    } catch {
      showToast('❌ Gate command failed. Check connection.');
    } finally { setOpening(false); }
  };

  const handleQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot || !selectedGate) { showToast('⚠ Select lot and gate.'); return; }
    setLogging(true);
    try {
      const res = await ticketsAPI.create({
        lot: lot.id, entrance: selectedGate,
        vehicle_type: logVehicle, license_plate: logPlate.toUpperCase(),
        is_service_exempt: true,
        exempt_reason: reason || 'Manual entry — no charge',
      });
      onQuickLog(res.data);
      showToast(`📋 Vehicle logged (no charge). Ticket #${res.data.ticket_number}`);
      setLogPlate(''); setReason('');
      // Open gate
      await entrancesAPI.openGate(selectedGate);
      showToast('🔓 Gate opened.');
    } catch {
      showToast('❌ Log failed.');
    } finally { setLogging(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Gate panel */}
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 800, color: G.dark }}>
            🚪 Gate Control
          </h3>

          <label style={fS.label}>Select Entrance Gate</label>
          <select style={{ ...fS.input, marginBottom: 18, fontSize: 15 }}
            value={selectedGate} onChange={e => setSelectedGate(e.target.value)}>
            {entrances.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>

          {/* Gate status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: G.lighter, borderRadius: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: G.primary, boxShadow: `0 0 6px ${G.primary}`, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: G.dark, fontWeight: 600 }}>Gate Ready</span>
          </div>

          {/* Open gate button */}
          <button onClick={handleOpenGate} disabled={opening} style={{
            width: '100%', padding: '20px', border: 'none',
            borderRadius: 14, cursor: opening ? 'wait' : 'pointer',
            background: opening ? G.muted : `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
            color: G.white, fontWeight: 900, fontSize: 22,
            boxShadow: opening ? 'none' : '0 6px 20px rgba(22,163,74,0.4)',
            transition: 'all 0.2s', marginBottom: 12,
          }}>
            {opening ? '⏳ Opening…' : '🔓 OPEN GATE'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: G.muted, margin: 0 }}>
            Opens selected entrance gate manually
          </p>
        </div>

        {/* Slot availability summary */}
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '18px', marginTop: 14 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: G.dark }}>🅿 Slot Availability</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { label: 'Free',    count: vacant,      color: G.primary, icon: '🟢' },
              { label: 'Taken',   count: occupied,    color: G.red,     icon: '🔴' },
              { label: 'Booked',  count: reserved,    color: G.orange,  icon: '🟠' },
              { label: 'Maint.',  count: maintenance, color: G.muted,   icon: '⚫' },
            ].map(({ label, count, color, icon }) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color }}>{count}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: G.muted }}>{icon} {label}</p>
              </div>
            ))}
          </div>
          {lot?.is_full && (
            <div style={{ marginTop: 12, padding: '8px', background: '#fef2f2', borderRadius: 8, textAlign: 'center', color: G.red, fontWeight: 700, fontSize: 13 }}>
              🔴 LOT FULL — No vacant slots
            </div>
          )}
        </div>
      </div>

      {/* Quick log (no charge) */}
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>
              📋 Log Vehicle (No Charge)
            </h3>
            <button onClick={() => setShowLogForm(f => !f)} style={{
              padding: '6px 12px', background: showLogForm ? '#fef2f2' : G.lighter,
              color: showLogForm ? G.red : G.dark, border: `1.5px solid ${G.border}`,
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            }}>
              {showLogForm ? '✕ Cancel' : '+ Log Vehicle'}
            </button>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 13, color: G.muted }}>
            Use this for service vehicles, staff, or official visitors that should not be charged. Vehicle is recorded in the system but no receipt is required.
          </p>

          {showLogForm && (
            <form onSubmit={handleQuickLog}>
              <label style={fS.label}>Vehicle Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
                {VEHICLE_TYPES.map(vt => (
                  <button key={vt} type="button" onClick={() => setLogVehicle(vt)} style={{
                    padding: '8px 4px', borderRadius: 8,
                    border: `2px solid ${logVehicle === vt ? G.orange : G.border}`,
                    background: logVehicle === vt ? '#fff7ed' : G.white,
                    cursor: 'pointer', fontSize: 10, color: G.text,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ fontSize: 18 }}>{VTYPE_ICONS[vt]}</span>
                    {vt.slice(0, 5)}
                  </button>
                ))}
              </div>

              <label style={fS.label}>License Plate</label>
              <input style={{ ...fS.input, marginBottom: 10, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2 }}
                placeholder="UAA 123B"
                value={logPlate}
                onChange={e => setLogPlate(e.target.value.toUpperCase())} />

              <label style={fS.label}>Reason</label>
              <input style={{ ...fS.input, marginBottom: 14 }}
                placeholder="e.g. KCCA Vehicle, Campus Staff, Visitor"
                value={reason}
                onChange={e => setReason(e.target.value)} required />

              <button type="submit" disabled={logging} style={{
                width: '100%', padding: '13px',
                background: G.orange, color: G.white, border: 'none',
                borderRadius: 10, cursor: logging ? 'wait' : 'pointer',
                fontWeight: 800, fontSize: 15,
              }}>
                {logging ? 'Logging…' : '📋 Log & Open Gate (No Charge)'}
              </button>
            </form>
          )}

          {/* Entrance gate list */}
          {!showLogForm && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>CONFIGURED ENTRANCE GATES</p>
              {entrances.length === 0 ? (
                <p style={{ color: G.muted, fontSize: 13 }}>No entrance gates configured.</p>
              ) : entrances.map(en => (
                <div key={en.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: G.lighter, borderRadius: 8, marginBottom: 6 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: G.dark }}>🚪 {en.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: G.muted }}>Sensor: {en.sensor_id}</p>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 20, background: en.is_active ? G.light : '#f3f4f6', color: en.is_active ? G.dark : G.muted, fontSize: 11, fontWeight: 700 }}>
                    {en.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE LOG PANEL
// ═══════════════════════════════════════════════════════════════════════════

function VehicleLogPanel({ tickets, onRefresh, lot }: {
  tickets: Ticket[];
  onRefresh: () => void;
  lot: ParkingLot | null;
}) {
  const [search, setSearch] = useState('');

  const filtered = tickets.filter(t =>
    !search ||
    t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
    t.license_plate.toLowerCase().includes(search.toLowerCase()) ||
    t.vehicle_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Search + refresh */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
          <input
            style={{ ...fS.input, paddingLeft: 38, fontSize: 14 }}
            placeholder="Search ticket #, plate, or vehicle type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={onRefresh} style={{ padding: '10px 16px', background: G.lighter, border: `1.5px solid ${G.border}`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: G.dark, fontSize: 14 }}>Today's Vehicle Log — {lot?.name}</span>
          <span style={{ fontSize: 12, color: G.muted }}>{filtered.length} entries</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: G.muted }}>
            <p style={{ fontSize: 36 }}>🏁</p>
            <p style={{ fontWeight: 600 }}>No vehicles recorded yet today.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: G.lighter }}>
                  {['#', 'Time', 'Type', 'Plate', 'Slot', 'Duration', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: G.dark, fontSize: 12, borderBottom: `1px solid ${G.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const hrs  = Math.floor(t.duration_hours);
                  const mins = Math.floor((t.duration_hours - hrs) * 60);
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${G.border}`, background: i % 2 === 0 ? G.white : G.lighter }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: G.dark }}>#{t.ticket_number}</td>
                      <td style={{ padding: '10px 12px', color: G.muted, fontSize: 12 }}>
                        {new Date(t.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {VTYPE_ICONS[t.vehicle_type]} {t.vehicle_type}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1.5 }}>
                        {t.license_plate || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{t.slot_number ?? '—'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{hrs}h {mins}m</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: t.status === 'active' ? G.primary : G.muted, color: G.white,
                        }}>{t.status === 'active' ? 'Inside' : t.status}</span>
                        {t.is_service_exempt && <span style={{ marginLeft: 4, fontSize: 10, color: G.orange }}>• Exempt</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          onClick={() => printTicketReceipt(t, lot)}
                          style={{ padding: '5px 10px', background: G.lighter, border: `1px solid ${G.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: G.dark }}>
                          🖨 Print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ENTRANCE DETECTED POPUP (triggered by WebSocket entrance_detected event)
// ═══════════════════════════════════════════════════════════════════════════

interface EntranceDetectedPopupProps {
  lot: ParkingLot | null;
  entrances: Entrance[];
  detectedData: { plate?: string; vehicle_type?: string; entrance_id?: string } | null;
  onClose: () => void;
  onIssued: (t: Ticket) => void;
  showToast: (m: string) => void;
}

function EntranceDetectedPopup({
  lot, entrances, detectedData, onClose, onIssued, showToast,
}: EntranceDetectedPopupProps) {
  const [vehicleType, setVehicleType] = useState<VehicleType>((detectedData?.vehicle_type as VehicleType) || 'car');
  const [plate, setPlate]             = useState((detectedData?.plate || '').toUpperCase());
  const [entranceId, setEntranceId]   = useState(detectedData?.entrance_id || entrances[0]?.id || '');
  const [isExempt, setIsExempt]       = useState(false);
  const [exemptReason, setExemptReason] = useState('');
  const [issuing, setIssuing]         = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot || !entranceId) { showToast('⚠ No lot/entrance configured.'); return; }
    setIssuing(true);
    try {
      const res = await ticketsAPI.create({
        lot: lot.id, entrance: entranceId,
        vehicle_type: vehicleType,
        license_plate: plate.toUpperCase(),
        is_service_exempt: isExempt,
        exempt_reason: isExempt ? exemptReason : '',
      });
      const ticket = res.data;
      setIssuedTicket(ticket);
      onIssued(ticket);
      printTicketReceipt(ticket, lot);
      showToast(`✅ Ticket #${ticket.ticket_number} issued — gate opening`);
      // Auto-open gate after 1s
      if (entrances.length) {
        setTimeout(async () => {
          try { await entrancesAPI.openGate(entranceId); } catch {}
        }, 1000);
      }
    } catch (err: any) {
      showToast(`❌ ${err?.response?.data?.detail ?? 'Failed to issue ticket'}`);
    } finally { setIssuing(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 8000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: G.white, borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '95vh', overflow: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        border: `3px solid ${G.primary}`,
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${G.dark}, ${G.primary})`,
          padding: '18px 22px', borderRadius: '17px 17px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ color: '#d1fae5', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
              🚨 Vehicle Detected at Entrance
            </div>
            <div style={{ color: G.white, fontWeight: 800, fontSize: 17 }}>Issue Parking Ticket</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                     color: G.white, cursor: 'pointer', padding: '4px 10px', fontSize: 16 }}>✕</button>
        </div>

        {issuedTicket ? (
          /* Issued ticket confirmation */
          <div style={{ padding: '24px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: G.dark, margin: '0 0 4px', fontWeight: 900 }}>Ticket Issued!</h2>
            <p style={{ color: G.muted, fontSize: 13, margin: '0 0 20px' }}>Gate opening automatically…</p>
            <div style={{
              background: G.lighter, border: `2px solid ${G.primary}`, borderRadius: 14,
              padding: '16px 20px', marginBottom: 20, textAlign: 'left',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                {[
                  ['Ticket #', `#${issuedTicket.ticket_number}`],
                  ['Vehicle', `${VTYPE_ICONS[issuedTicket.vehicle_type]} ${issuedTicket.vehicle_type}`],
                  ['Plate', issuedTicket.license_plate || '—'],
                  ['Slot', issuedTicket.slot_number ?? '—'],
                  ['Time In', new Date(issuedTicket.entry_time).toLocaleTimeString()],
                  ['Status', issuedTicket.is_service_exempt ? '🆓 Exempt' : '💵 Chargeable'],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: G.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontWeight: 700, color: G.dark }}>{v}</div>
                  </div>
                ))}
              </div>
              {issuedTicket.barcode_data && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <img src={`data:image/png;base64,${issuedTicket.barcode_data}`}
                    alt="QR Code" style={{ width: 110, height: 110, borderRadius: 8, border: `2px solid ${G.border}` }} />
                  <p style={{ fontSize: 10, color: G.muted, margin: '4px 0 0' }}>Show at exit gate</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => printTicketReceipt(issuedTicket, lot)}
                style={{ flex: 1, padding: '12px', background: G.dark, color: G.white, border: 'none',
                         borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                🖨 Reprint Receipt
              </button>
              <button onClick={onClose}
                style={{ flex: 1, padding: '12px', background: G.lighter, color: G.dark, border: `1.5px solid ${G.border}`,
                         borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Issue form */
          <form onSubmit={handleIssue} style={{ padding: '20px 22px' }}>
            {/* Vehicle type selector */}
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: G.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vehicle Type</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
              {VEHICLE_TYPES.map(vt => (
                <button key={vt} type="button" onClick={() => setVehicleType(vt)}
                  style={{
                    padding: '8px 4px', borderRadius: 10,
                    border: `2px solid ${vehicleType === vt ? G.primary : G.border}`,
                    background: vehicleType === vt ? G.light : G.white,
                    cursor: 'pointer', fontSize: 10, fontWeight: 600, color: G.text,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                  <span style={{ fontSize: 20 }}>{VTYPE_ICONS[vt]}</span>
                  <span>{vt.slice(0, 4)}</span>
                </button>
              ))}
            </div>

            {/* Entrance gate */}
            {entrances.length > 1 && (
              <>
                <p style={fS.label as React.CSSProperties}>Entrance Gate</p>
                <select style={{ ...fS.input as React.CSSProperties, marginBottom: 12 }}
                  value={entranceId} onChange={e => setEntranceId(e.target.value)}>
                  {entrances.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </>
            )}

            {/* License plate */}
            <p style={fS.label as React.CSSProperties}>License Plate</p>
            <input
              style={{ ...(fS.input as React.CSSProperties), marginBottom: 14,
                       textTransform: 'uppercase', fontFamily: 'monospace',
                       letterSpacing: 2, fontSize: 16, fontWeight: 700 }}
              placeholder="UAA 123B"
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase())}
            />

            {/* Exempt toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isExempt ? 10 : 16, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 600, color: G.orange }}>🆓 Service / Exempt (no charge)</span>
            </label>
            {isExempt && (
              <input style={{ ...(fS.input as React.CSSProperties), marginBottom: 14 }}
                placeholder="Reason (e.g. Staff, KCCA, Campus Carrier)"
                value={exemptReason} onChange={e => setExemptReason(e.target.value)} />
            )}

            {lot?.is_full && !isExempt && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 8,
                            padding: '10px 14px', marginBottom: 12, fontSize: 13, color: G.red, fontWeight: 600 }}>
                ⚠ Lot is FULL — no vacant slots. Exempt vehicles can still enter.
              </div>
            )}

            <button type="submit" disabled={issuing || (!isExempt && !!lot?.is_full)}
              style={{
                width: '100%', padding: '15px', border: 'none', borderRadius: 12, cursor: issuing ? 'wait' : 'pointer',
                background: issuing ? G.muted : `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
                color: G.white, fontWeight: 900, fontSize: 17, letterSpacing: 0.3,
                boxShadow: issuing ? 'none' : '0 6px 20px rgba(22,163,74,0.35)',
              }}>
              {issuing ? '⏳ Issuing…' : '🎫 Issue Ticket & Open Gate'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRANCE ATTENDANT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

type MenuPage = 'dashboard' | 'scan_issue' | 'gate_control' | 'vehicle_log';

interface Props { onLogout: () => void; }

export default function EntranceAttendantDashboard({ onLogout }: Props) {
  const { user } = useAuth();
  const [page,        setPage]        = useState<MenuPage>('dashboard');
  const [showDisplay, setShowDisplay] = useState(false);
  const [lots,      setLots]      = useState<ParkingLot[]>([]);
  const [activeLot, setActiveLot] = useState<ParkingLot | null>(null);
  const [slots,     setSlots]     = useState<ParkingSlot[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [tickets,   setTickets]   = useState<Ticket[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Entrance detected popup (triggered by WebSocket)
  const [entrancePopup, setEntrancePopup] = useState(false);
  const [entranceDetectedData, setEntranceDetectedData] = useState<{plate?: string; vehicle_type?: string; entrance_id?: string} | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // Load initial data
  useEffect(() => {
    lotsAPI.list()
      .then(res => {
        setLots(res.data.results);
        if (res.data.results.length) setActiveLot(res.data.results[0]);
      })
      .finally(() => setLoading(false));
  }, []);

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
    slot_update: (payload: any) => {
      setSlots(prev => prev.map(s => s.id === payload.id ? { ...s, ...payload } : s));
    },
    entrance_detected: (payload: any) => {
      // Auto-popup: vehicle arrived at entrance
      setEntranceDetectedData({
        plate: payload.license_plate || payload.plate || '',
        vehicle_type: payload.vehicle_type || 'car',
        entrance_id: payload.entrance_id || payload.entrance || '',
      });
      setEntrancePopup(true);
      showToast('🚗 Vehicle detected — issue ticket now');
    },
    ticket_created: (payload: any) => {
      setTickets(prev => {
        // Don't duplicate if already in list
        if (prev.some(t => t.id === payload.id)) return prev;
        return [payload, ...prev];
      });
    },
    alert: (payload: any) => {
      if (payload.alert_type === 'fire') {
        showToast(`🔥 FIRE ALERT: ${payload.message} — Evacuate immediately!`);
      }
    },
  });

  const handleRefreshTickets = useCallback(() => {
    if (!activeLot) return;
    const today = new Date().toISOString().slice(0, 10);
    ticketsAPI.list({ lot: activeLot.id, entry_time__date: today })
      .then(res => setTickets(res.data.results));
  }, [activeLot]);

  const vacant   = slots.filter(s => s.status === 'vacant').length;
  const occupied = slots.filter(s => s.status === 'occupied').length;

  const menuItems: { key: MenuPage; icon: string; label: string }[] = [
    { key: 'dashboard',    icon: '🏠', label: 'Dashboard' },
    { key: 'scan_issue',   icon: '🔍', label: 'Scan & Issue' },
    { key: 'gate_control', icon: '🚪', label: 'Gate Control' },
    { key: 'vehicle_log',  icon: '📋', label: 'Vehicle Log' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: G.lighter, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #d1fae5', borderTopColor: G.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: G.primary, fontWeight: 600 }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: G.lighter }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 220 : 60, background: G.sidebar,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
        transition: 'width 0.2s', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>🚪</span>
          </div>
          {sidebarOpen && (
            <div>
              <p style={{ margin: 0, color: G.white, fontWeight: 700, fontSize: 12 }}>Entrance Panel</p>
              <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>IUIU Parking</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: '#86efac',
            cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
          }}>{sidebarOpen ? '◀' : '▶'}</button>
        </div>

        {/* Attendant info */}
        {sidebarOpen && user && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: G.white, fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>
                {user.first_name?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <div>
                <p style={{ margin: 0, color: G.white, fontWeight: 600, fontSize: 12 }}>
                  {user.first_name} {user.last_name}
                </p>
                <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>Entrance Attendant</p>
              </div>
            </div>
          </div>
        )}

        {/* Lot selector */}
        {sidebarOpen && lots.length > 1 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 6px', color: '#86efac', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Lot</p>
            {lots.map(lot => (
              <button key={lot.id} onClick={() => setActiveLot(lot)} style={{
                display: 'flex', alignItems: 'center', width: '100%', padding: '7px 8px',
                border: 'none', borderRadius: 6, fontSize: 11, fontWeight: activeLot?.id === lot.id ? 700 : 400,
                background: activeLot?.id === lot.id ? 'rgba(22,163,74,0.25)' : 'transparent',
                color: activeLot?.id === lot.id ? '#86efac' : '#d1fae5',
                cursor: 'pointer', marginBottom: 2, textAlign: 'left',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: lot.is_full ? G.red : G.primary, display: 'inline-block', marginRight: 6 }} />
                {lot.name}
              </button>
            ))}
          </div>
        )}

        {/* Slot status mini */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ margin: 0, color: '#86efac', fontWeight: 900, fontSize: 18 }}>{vacant}</p>
                <p style={{ margin: 0, color: '#d1fae5', fontSize: 9 }}>Free</p>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ margin: 0, color: '#fca5a5', fontWeight: 900, fontSize: 18 }}>{occupied}</p>
                <p style={{ margin: 0, color: '#d1fae5', fontSize: 9 }}>Taken</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav menu */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {menuItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: sidebarOpen ? '12px 12px' : '12px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center',
              border: 'none', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
              background: page === item.key ? 'rgba(22,163,74,0.3)' : 'transparent',
              color: page === item.key ? '#86efac' : '#d1fae5',
              fontWeight: page === item.key ? 700 : 400,
              fontSize: 13, transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && item.label}
            </button>
          ))}
        </nav>

        {/* Time display */}
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

        {/* Sign out */}
        <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={onLogout} style={{
            width: '100%', padding: '10px',
            border: '1.5px solid #4ade80', borderRadius: 8,
            background: 'transparent', color: '#4ade80',
            cursor: 'pointer', fontWeight: 600, fontSize: 12,
          }}>
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {activeLot && (
              <span style={{
                padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13,
                background: activeLot.is_full ? '#fef2f2' : G.light,
                color: activeLot.is_full ? G.red : G.dark,
              }}>
                {activeLot.is_full ? '🔴 LOT FULL' : `🟢 ${activeLot.available_slots} Free`}
              </span>
            )}
          </div>
        </div>

        {/* ── DASHBOARD PAGE ────────────────────────────────────────── */}
        {page === 'dashboard' && (
          <div>
            {/* Welcome card */}
            <div style={{ background: `linear-gradient(135deg, ${G.dark}, ${G.primary})`, borderRadius: 16, padding: '22px 26px', marginBottom: 24, color: G.white }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                Welcome, {user?.first_name ?? 'Attendant'} 👋
              </h2>
              <p style={{ margin: '6px 0 0', color: '#d1fae5', fontSize: 13 }}>
                Entrance Attendant · {activeLot?.name ?? 'IUIU Parking'} · {new Date().toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{tickets.length}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#d1fae5' }}>Entries today</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{tickets.filter(t => t.status === 'active').length}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#d1fae5' }}>Still parked</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{vacant}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#d1fae5' }}>Slots free</p>
                </div>
              </div>
            </div>

            {/* Slot grid */}
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>🅿 Slot Status</h3>
                <span style={{ fontSize: 12, color: G.muted }}>{slots.length} total</span>
              </div>
              <SlotGrid slots={slots} />
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <button onClick={() => { setEntranceDetectedData(null); setEntrancePopup(true); }} style={{
                padding: '20px', background: G.primary, color: G.white,
                border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 15,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                boxShadow: '0 6px 20px rgba(22,163,74,0.35)',
              }}>
                <span style={{ fontSize: 32 }}>🎫</span>
                Issue Ticket
              </button>
              <button onClick={() => setPage('scan_issue')} style={{
                padding: '20px', background: '#1d4ed8', color: G.white,
                border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 15,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 32 }}>🔍</span>
                Scan & Lookup
              </button>
              <button onClick={() => setPage('gate_control')} style={{
                padding: '20px', background: G.dark, color: G.white,
                border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 15,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 32 }}>🚪</span>
                Gate Control
              </button>
            </div>
          </div>
        )}

        {/* ── SCAN & ISSUE PAGE ─────────────────────────────────── */}
        {page === 'scan_issue' && (
          <ScanIssuePanel
            lot={activeLot}
            entrances={entrances}
            onTicketIssued={t => setTickets(prev => [t, ...prev])}
            showToast={showToast}
          />
        )}

        {/* ── GATE CONTROL PAGE ─────────────────────────────────── */}
        {page === 'gate_control' && (
          <GateControlPanel
            lot={activeLot}
            entrances={entrances}
            slots={slots}
            onQuickLog={t => setTickets(prev => [t, ...prev])}
            showToast={showToast}
          />
        )}

        {/* ── VEHICLE LOG PAGE ──────────────────────────────────── */}
        {page === 'vehicle_log' && (
          <VehicleLogPanel
            tickets={tickets}
            lot={activeLot}
            onRefresh={handleRefreshTickets}
          />
        )}
      </main>

      {/* ── TOAST ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: G.dark, color: G.white, padding: '12px 28px',
          borderRadius: 30, fontWeight: 700, fontSize: 14, zIndex: 9999,
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)', maxWidth: '90vw', textAlign: 'center',
        }}>{toast}</div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        * { box-sizing: border-box; }
        select, input, button { font-family: inherit; }
      `}</style>

      {/* ── ENTRANCE DISPLAY OVERLAY ─────────────────────────────────────── */}
      {showDisplay && <EntranceDisplayScreen onClose={() => setShowDisplay(false)} />}

      {/* ── ENTRANCE DETECTED POPUP ──────────────────────────────────────── */}
      {entrancePopup && (
        <EntranceDetectedPopup
          lot={activeLot}
          entrances={entrances}
          detectedData={entranceDetectedData}
          onClose={() => { setEntrancePopup(false); setEntranceDetectedData(null); }}
          onIssued={t => {
            setTickets(prev => [t, ...prev]);
            // Refresh slots after a moment
            setTimeout(() => {
              if (activeLot) lotsAPI.slotsStatus(activeLot.id)
                .then(r => setSlots(r.data)).catch(() => {});
            }, 1500);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ── Live clock for sidebar ──────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ margin: 0, color: G.white, fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>{time.toLocaleDateString()}</p>
    </div>
  );
}

// ── Shared form styles ──────────────────────────────────────────────────────
const fS: Record<string, React.CSSProperties> = {
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: G.muted, marginBottom: 4 },
  input: {
    width: '100%', padding: '11px 12px', border: `1.5px solid ${G.border}`,
    borderRadius: 8, fontSize: 13, color: G.text, background: G.white,
  },
};
