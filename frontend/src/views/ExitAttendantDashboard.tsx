/**
 * IUIU Smart Parking — Exit Attendant Dashboard
 *
 * Designed for: Sunmi V2 Pro (Android POS), mobile phones, tablets, desktop
 *
 * Workflow:
 *   1. Vehicle triggers exit sensor → WebSocket push notifies attendant
 *   2. Attendant scans ticket (HID barcode / camera / manual)
 *   3. System calculates fee (hourly rate × duration, set by admin)
 *   4. Fee displayed; client pays — Cash OR Mobile Money
 *   5. Attendant confirms payment → ticket checked out → gate opens
 *
 * Lost Receipt flow:
 *   • Lost receipt + plate  → lookup active ticket → checkout + lost_receipt_fee
 *   • Lost receipt + no plate (unidentifiable) → flat no_plate_fee, manual record
 *
 * Service vehicle / manual gate:
 *   • One-tap open gate button, logs reason, no payment
 *
 * Printing:
 *   • Sunmi V2 Pro: SunmiInnerPrinter JS API (58mm thermal)
 *   • All other devices: window.print() with thermal receipt CSS
 */
import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import EntranceDisplayScreen from './EntranceDisplayScreen';
import {
  lotsAPI, slotsAPI, exitsAPI, ticketsAPI,
} from '../api/client';
import { useLotWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';
import type {
  ParkingLot, ParkingSlot, Exit, Ticket, VehicleType,
} from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const G = {
  primary: '#16a34a', dark: '#14532d', light: '#dcfce7', lighter: '#f0fdf4',
  white: '#ffffff', border: '#bbf7d0', text: '#111827', muted: '#6b7280',
  red: '#dc2626', orange: '#d97706', blue: '#2563eb', purple: '#7c3aed',
  sidebar: '#0f3d1f',
};

const VTYPE_ICONS: Record<string, string> = {
  car: '🚗', motorcycle: '🏍', bicycle: '🚲', van: '🚐', truck: '🚛', bus: '🚌',
};

// ── Sunmi V2 Pro printer wrapper ─────────────────────────────────────────────
const SunmiPrinter = {
  isAvailable: (): boolean =>
    !!(window as any).SunmiInnerPrinter ||
    !!(window as any).sunmiPrinter ||
    !!(window as any).Android?.printReceipt,

  printLines: (lines: string[]) => {
    const printer = (window as any).SunmiInnerPrinter || (window as any).sunmiPrinter;
    if (printer) {
      try {
        printer.printerInit?.();
        printer.setAlignment?.(1);
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
function printExitReceipt(ticket: Ticket, lot: ParkingLot | null, lostFeeApplied: number) {
  const fee         = ticket.amount_charged;
  const durationH   = Math.floor(ticket.duration_hours);
  const durationM   = Math.floor((ticket.duration_hours - durationH) * 60);

  const lines = [
    '__BOLD__IUIU SMART PARKING',
    lot?.name ?? 'IUIU Campus',
    '================================',
    'EXIT RECEIPT',
    '================================',
    `Ticket : #${ticket.ticket_number}`,
    `Type   : ${ticket.vehicle_type.toUpperCase()}`,
    `Plate  : ${ticket.license_plate || 'N/A'}`,
    `In     : ${new Date(ticket.entry_time).toLocaleString()}`,
    `Out    : ${ticket.exit_time ? new Date(ticket.exit_time).toLocaleString() : new Date().toLocaleString()}`,
    `Duration: ${durationH}h ${durationM}m`,
    '================================',
    `Amount : UGX ${Number(fee).toLocaleString()}`,
    ...(lostFeeApplied > 0 ? [`Lost fee: UGX ${lostFeeApplied.toLocaleString()}`] : []),
    `Payment: ${ticket.payment_method?.toUpperCase() ?? 'CASH'}`,
    '================================',
    'GATE OPENED — DRIVE SAFELY!',
    '================================',
    `__QR__${ticket.ticket_number}`,
    '================================',
    'Thank you!',
  ];

  if (SunmiPrinter.isAvailable()) {
    SunmiPrinter.printLines(lines);
    return;
  }

  const existing = document.getElementById('__exit_receipt_print__');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = '__exit_receipt_print__';
  div.innerHTML = `
    <style>
      @media print {
        body > *:not(#__exit_receipt_print__) { display: none !important; }
        #__exit_receipt_print__ {
          display: block !important; width: 58mm; font-family: monospace;
          font-size: 12px; padding: 4px;
        }
        #__exit_receipt_print__ h2 { font-size: 14px; margin: 4px 0; text-align: center; }
        #__exit_receipt_print__ .divider { border-top: 1px dashed #000; margin: 4px 0; }
        #__exit_receipt_print__ .row { display: flex; justify-content: space-between; }
        #__exit_receipt_print__ .center { text-align: center; }
        #__exit_receipt_print__ .fee { font-size: 18px; font-weight: bold; text-align: center; margin: 6px 0; }
      }
      #__exit_receipt_print__ { display: none; }
    </style>
    <h2>IUIU SMART PARKING</h2>
    <div class="center">${lot?.name ?? 'IUIU Campus'}</div>
    <div class="center" style="font-weight:bold">EXIT RECEIPT</div>
    <div class="divider"></div>
    <div class="row"><span>Ticket:</span><span>#${ticket.ticket_number}</span></div>
    <div class="row"><span>Type:</span><span>${ticket.vehicle_type.toUpperCase()}</span></div>
    <div class="row"><span>Plate:</span><span>${ticket.license_plate || 'N/A'}</span></div>
    <div class="row"><span>In:</span><span>${new Date(ticket.entry_time).toLocaleTimeString()}</span></div>
    <div class="row"><span>Out:</span><span>${new Date().toLocaleTimeString()}</span></div>
    <div class="row"><span>Duration:</span><span>${durationH}h ${durationM}m</span></div>
    <div class="divider"></div>
    <div class="fee">UGX ${Number(fee).toLocaleString()}</div>
    ${lostFeeApplied > 0 ? `<div class="row"><span>Lost Receipt:</span><span>+UGX ${lostFeeApplied.toLocaleString()}</span></div>` : ''}
    <div class="row"><span>Payment:</span><span>${ticket.payment_method?.toUpperCase() ?? 'CASH'}</span></div>
    <div class="divider"></div>
    <div class="center" style="font-weight:bold">GATE OPENED — DRIVE SAFELY!</div>
    <div class="divider"></div>
    <div class="center">Thank you!</div>
  `;
  document.body.appendChild(div);
  window.print();
}

// ── UGX formatter ────────────────────────────────────────────────────────────
const ugx = (n: number) => `UGX ${Number(n).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════════════════
// SCAN & CHECKOUT PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ScanCheckoutPanel({
  lot, exits, onCheckedOut, showToast,
}: {
  lot: ParkingLot | null;
  exits: Exit[];
  onCheckedOut: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [scanInput, setScanInput]       = useState('');
  const [searching, setSearching]       = useState(false);
  const [ticket, setTicket]             = useState<Ticket | null>(null);

  // Payment state
  const [exitGateId, setExitGateId]     = useState(exits[0]?.id ?? '');
  const [payMethod, setPayMethod]       = useState<'cash' | 'mobile_money'>('cash');
  const [mmoRef, setMmoRef]             = useState('');
  const [paying, setPaying]             = useState(false);
  const [paid, setPaid]                 = useState(false);

  // Camera
  const [cameraOn, setCameraOn]         = useState(false);
  const [stream, setStream]             = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef  = useRef<HTMLInputElement>(null);

  // Incoming sensor notification
  const [sensorAlert, setSensorAlert]   = useState('');

  useEffect(() => { if (exits.length && !exitGateId) setExitGateId(exits[0].id); }, [exits]);
  useEffect(() => { scanRef.current?.focus(); }, []);

  // Expose for WebSocket sensor trigger
  useEffect(() => {
    (window as any).__exitSensorAlert = (msg: string) => setSensorAlert(msg);
    return () => { delete (window as any).__exitSensorAlert; };
  }, []);

  const lookupTicket = async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setTicket(null);
    setPaid(false);
    try {
      const res = await ticketsAPI.list({ search: query.trim(), status: 'active' });
      const found = res.data.results[0] ?? null;
      setTicket(found);
      if (!found) showToast(`❓ No active ticket found for "${query.trim()}"`);
      else         showToast(`✅ Ticket found: #${found.ticket_number}`);
    } catch { showToast('❌ Lookup failed — check connection.'); }
    finally  { setSearching(false); }
  };

  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) lookupTicket(scanInput.trim());
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s); setCameraOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 100);
    } catch { showToast('📷 Camera not available.'); }
  };
  const stopCamera = () => { stream?.getTracks().forEach(t => t.stop()); setStream(null); setCameraOn(false); };
  const captureFrame = () => { stopCamera(); showToast('📷 Frame captured. Enter ticket number if needed.'); };

  const handleCheckout = async () => {
    if (!ticket || !exitGateId) { showToast('⚠ Select exit gate.'); return; }
    if (payMethod === 'mobile_money' && !mmoRef.trim()) {
      showToast('⚠ Enter Mobile Money reference number.'); return;
    }
    setPaying(true);
    try {
      const res = await ticketsAPI.checkout(ticket.id, {
        exit_gate:      exitGateId,
        payment_method: payMethod,
        amount_charged: ticket.calculated_fee,
        mobile_money_ref: payMethod === 'mobile_money' ? mmoRef : undefined,
      });
      // Open gate
      try { await exitsAPI.openGate(exitGateId); } catch {}
      setPaid(true);
      onCheckedOut(res.data);
      showToast(`🔓 Gate opened! Ticket #${ticket.ticket_number} closed.`);
      printExitReceipt(res.data, lot, 0);
      // Reset after a moment
      setTimeout(() => {
        setScanInput(''); setTicket(null); setPaid(false); setMmoRef('');
        scanRef.current?.focus();
      }, 3000);
    } catch (err: any) {
      showToast(`❌ ${err?.response?.data?.detail ?? 'Checkout failed.'}`);
    } finally { setPaying(false); }
  };

  const fee = ticket ? ticket.calculated_fee : 0;
  const durationH = ticket ? Math.floor(ticket.duration_hours) : 0;
  const durationM = ticket ? Math.floor((ticket.duration_hours - durationH) * 60) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

      {/* LEFT: Scan */}
      <div>
        {/* Sensor alert banner */}
        {sensorAlert && (
          <div style={{ background: G.orange, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <span style={{ color: G.white, fontWeight: 700, fontSize: 14 }}>{sensorAlert}</span>
            <button onClick={() => setSensorAlert('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: G.white, cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        )}

        {/* Scan input */}
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: G.dark }}>🔍 Scan Exit Ticket</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: G.muted }}>
            Scan barcode with built-in / external scanner, or type ticket number and press Enter.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>🔎</span>
              <input
                ref={scanRef}
                style={{ width: '100%', padding: '13px 12px 13px 40px', border: `2px solid ${G.primary}`, borderRadius: 10, fontSize: 16, color: G.text, fontFamily: 'monospace', boxSizing: 'border-box' }}
                placeholder="Scan barcode or enter ticket #…"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleScanKey}
                autoFocus
              />
            </div>
            <button onClick={() => lookupTicket(scanInput)} style={{ padding: '13px 18px', background: G.primary, color: G.white, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              {searching ? '…' : 'Go'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={cameraOn ? stopCamera : startCamera} style={{ flex: 1, padding: '10px', border: `1.5px solid ${G.border}`, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, background: cameraOn ? G.red : G.lighter, color: cameraOn ? G.white : G.dark }}>
              {cameraOn ? '🚫 Stop Camera' : '📷 Camera Scan'}
            </button>
          </div>

          {cameraOn && (
            <div style={{ marginTop: 12, position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', borderRadius: 10 }} />
              <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(22,163,74,0.7)', borderRadius: 10, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: '25%', left: '20%', right: '20%', bottom: '25%', border: '2px solid rgba(255,255,255,0.6)', borderRadius: 4 }} />
              </div>
              <button onClick={captureFrame} style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', background: G.primary, color: G.white, border: '3px solid white', borderRadius: 30, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                📸 Capture
              </button>
            </div>
          )}
        </div>

        {/* Exit gate selector */}
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 12, padding: '16px 18px' }}>
          <label style={fS.label}>Exit Gate</label>
          <select style={fS.input} value={exitGateId} onChange={e => setExitGateId(e.target.value)}>
            {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
          {SunmiPrinter.isAvailable()
            ? <p style={{ margin: '6px 0 0', fontSize: 11, color: G.primary }}>🖨 Sunmi printer detected</p>
            : <p style={{ margin: '6px 0 0', fontSize: 11, color: G.muted }}>🖨 Browser print</p>
          }
        </div>
      </div>

      {/* RIGHT: Ticket details + payment */}
      <div>
        {!ticket && !paid && (
          <div style={{ background: G.lighter, border: `1.5px dashed ${G.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center', color: G.muted }}>
            <p style={{ fontSize: 40, margin: '0 0 12px' }}>🎫</p>
            <p style={{ fontWeight: 600, fontSize: 14 }}>Scan or enter a ticket to see vehicle details and fee.</p>
          </div>
        )}

        {ticket && !paid && (
          <div style={{ background: G.white, border: `2px solid ${G.primary}`, borderRadius: 14, padding: '20px 22px' }}>
            {/* Vehicle details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: G.dark }}>
                  {VTYPE_ICONS[ticket.vehicle_type]} {ticket.vehicle_type.toUpperCase()}
                </p>
                <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontSize: 20, fontWeight: 900, letterSpacing: 3, color: G.dark }}>
                  {ticket.license_plate || '— No Plate —'}
                </p>
              </div>
              <span style={{ padding: '4px 14px', borderRadius: 20, background: G.primary, color: G.white, fontWeight: 800, fontSize: 12 }}>ACTIVE</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, fontSize: 13 }}>
              {[
                ['Ticket #', `#${ticket.ticket_number}`],
                ['Entry', new Date(ticket.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
                ['Duration', `${durationH}h ${durationM}m`],
                ['Slot', ticket.slot_number ?? '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ background: G.lighter, borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ margin: 0, fontSize: 11, color: G.muted, fontWeight: 600 }}>{l}</p>
                  <p style={{ margin: 0, fontWeight: 700, color: G.dark }}>{v}</p>
                </div>
              ))}
            </div>

            {/* QR Code if available */}
            {ticket.barcode_data && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <img src={`data:image/png;base64,${ticket.barcode_data}`}
                  alt="QR Code" style={{ width: 90, height: 90, borderRadius: 8, border: `2px solid ${G.border}` }} />
              </div>
            )}

            {/* Fee display — prominent */}
            <div style={{ background: `linear-gradient(135deg, ${G.dark}, ${G.primary})`, borderRadius: 12, padding: '18px 20px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#d1fae5', fontSize: 12, fontWeight: 600 }}>TOTAL AMOUNT DUE</p>
              <p style={{ margin: '4px 0 0', color: G.white, fontSize: 36, fontWeight: 900, letterSpacing: 1 }}>
                {ugx(fee)}
              </p>
              <p style={{ margin: '4px 0 0', color: '#d1fae5', fontSize: 11 }}>
                {durationH}h {durationM}m · {ticket.vehicle_type}
                {ticket.is_service_exempt ? ' · EXEMPT' : ''}
              </p>
            </div>

            {/* Payment method */}
            {!ticket.is_service_exempt && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: G.muted }}>PAYMENT METHOD</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { value: 'cash',         label: '💵 Cash',         icon: '💵' },
                    { value: 'mobile_money', label: '📱 Mobile Money', icon: '📱' },
                  ].map(m => (
                    <button key={m.value} onClick={() => setPayMethod(m.value as any)} style={{
                      padding: '14px 8px', border: `2px solid ${payMethod === m.value ? G.primary : G.border}`,
                      borderRadius: 10, background: payMethod === m.value ? G.light : G.white,
                      cursor: 'pointer', fontWeight: 700, fontSize: 14, color: G.dark,
                    }}>{m.label}</button>
                  ))}
                </div>
                {payMethod === 'mobile_money' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={fS.label}>Mobile Money Reference #</label>
                    <input style={{ ...fS.input, fontFamily: 'monospace', fontSize: 15, letterSpacing: 1 }}
                      placeholder="e.g. MPS12345678"
                      value={mmoRef}
                      onChange={e => setMmoRef(e.target.value.toUpperCase())} />
                  </div>
                )}
              </>
            )}

            {/* Confirm + open gate */}
            <button onClick={handleCheckout} disabled={paying} style={{
              width: '100%', padding: '16px', border: 'none',
              borderRadius: 12, cursor: paying ? 'wait' : 'pointer',
              background: paying ? G.muted : `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
              color: G.white, fontWeight: 900, fontSize: 18,
              boxShadow: paying ? 'none' : '0 6px 20px rgba(22,163,74,0.35)',
            }}>
              {paying ? '⏳ Processing…'
                : ticket.is_service_exempt ? '🔓 Open Gate (Exempt — No Charge)'
                : `✅ Confirm ${payMethod === 'cash' ? 'Cash' : 'MoMo'} & Open Gate`}
            </button>
          </div>
        )}

        {paid && (
          <div style={{ background: G.light, border: `3px solid ${G.primary}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 48, margin: '0 0 12px' }}>🎉</p>
            <p style={{ fontWeight: 900, fontSize: 22, color: G.dark }}>Payment Confirmed!</p>
            <p style={{ color: G.primary, fontWeight: 600, marginBottom: 0 }}>Gate is opening…</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOST RECEIPT PANEL
// ═══════════════════════════════════════════════════════════════════════════

function LostReceiptPanel({
  lot, exits, onCheckedOut, showToast,
}: {
  lot: ParkingLot | null;
  exits: Exit[];
  onCheckedOut: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [mode, setMode]           = useState<'plate' | 'lost_ticket' | 'no_info'>('plate');
  const [plateInput, setPlateInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [ticket, setTicket]       = useState<Ticket | null>(null);
  const [exitGateId, setExitGateId] = useState(exits[0]?.id ?? '');
  const [payMethod, setPayMethod] = useState<'cash' | 'mobile_money'>('cash');
  const [mmoRef, setMmoRef]       = useState('');
  const [paying, setPaying]       = useState(false);
  const [paid, setPaid]           = useState(false);

  // No-info form
  const [noInfoVehicle, setNoInfoVehicle] = useState<VehicleType>('car');
  const [noInfoPlate, setNoInfoPlate]     = useState('');
  const [noInfoReason, setNoInfoReason]   = useState('');
  const [noInfoPaying, setNoInfoPaying]   = useState(false);

  const lostFee       = lot?.lost_receipt_fee ?? 5000;
  const lostTicketFee = lot?.lost_ticket_fee  ?? 15000;
  const noPlateFee    = lot?.no_plate_fee     ?? 10000;

  useEffect(() => { if (exits.length && !exitGateId) setExitGateId(exits[0].id); }, [exits]);

  const searchByPlate = async () => {
    if (!plateInput.trim()) { showToast('⚠ Enter a plate number.'); return; }
    setSearching(true); setTicket(null); setPaid(false);
    try {
      const res = await ticketsAPI.list({ license_plate: plateInput.trim().toUpperCase(), status: 'active' });
      const found = res.data.results[0] ?? null;
      setTicket(found);
      if (!found) showToast(`❓ No active ticket found for plate "${plateInput.trim().toUpperCase()}"`);
      else         showToast(`✅ Ticket found: #${found.ticket_number}`);
    } catch { showToast('❌ Search failed.'); }
    finally  { setSearching(false); }
  };

  const handleLostCheckout = async () => {
    if (!ticket || !exitGateId) { showToast('⚠ Select exit gate.'); return; }
    if (payMethod === 'mobile_money' && !mmoRef.trim()) { showToast('⚠ Enter MoMo reference.'); return; }
    setPaying(true);
    try {
      const totalFee = ticket.calculated_fee + Number(lostFee);
      const res = await ticketsAPI.checkout(ticket.id, {
        exit_gate:        exitGateId,
        payment_method:   payMethod,
        amount_charged:   totalFee,
        mobile_money_ref: payMethod === 'mobile_money' ? mmoRef : undefined,
      });
      try { await exitsAPI.openGate(exitGateId); } catch {}
      setPaid(true);
      onCheckedOut(res.data);
      showToast(`🔓 Gate opened! Lost receipt fee applied.`);
      printExitReceipt(res.data, lot, Number(lostFee));
      setTimeout(() => { setTicket(null); setPlateInput(''); setPaid(false); setMmoRef(''); }, 3000);
    } catch (err: any) { showToast(`❌ ${err?.response?.data?.detail ?? 'Checkout failed.'}`); }
    finally { setPaying(false); }
  };

  const handleLostTicketCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitGateId || !lot) { showToast('⚠ Select exit gate.'); return; }
    if (payMethod === 'mobile_money' && !mmoRef.trim()) { showToast('⚠ Enter MoMo reference.'); return; }
    setNoInfoPaying(true);
    try {
      const createRes = await ticketsAPI.create({
        lot: lot.id,
        entrance: null as any,
        vehicle_type: noInfoVehicle,
        license_plate: noInfoPlate.toUpperCase() || 'UNKNOWN',
        is_service_exempt: false,
        exempt_reason: '',
      });
      const newTicket = createRes.data;
      const checkoutRes = await ticketsAPI.checkout(newTicket.id, {
        exit_gate:        exitGateId,
        payment_method:   payMethod,
        amount_charged:   Number(lostTicketFee),
        mobile_money_ref: payMethod === 'mobile_money' ? mmoRef : undefined,
      });
      try { await exitsAPI.openGate(exitGateId); } catch {}
      onCheckedOut(checkoutRes.data);
      showToast(`🔓 Gate opened! Lost ticket flat fee ${ugx(Number(lostTicketFee))} charged.`);
      printExitReceipt(checkoutRes.data, lot, 0);
      setNoInfoPlate(''); setNoInfoReason(''); setMmoRef('');
    } catch (err: any) { showToast(`❌ ${err?.response?.data?.detail ?? 'Checkout failed.'}`); }
    finally { setNoInfoPaying(false); }
  };

  const handleNoInfoCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitGateId || !lot) { showToast('⚠ Select exit gate.'); return; }
    setNoInfoPaying(true);
    try {
      // Create a synthetic exit-only record and immediately checkout
      const createRes = await ticketsAPI.create({
        lot: lot.id,
        entrance: null as any,
        vehicle_type: noInfoVehicle,
        license_plate: noInfoPlate.toUpperCase() || 'UNKNOWN',
        is_service_exempt: false,
        exempt_reason: '',
      });
      const newTicket = createRes.data;
      const checkoutRes = await ticketsAPI.checkout(newTicket.id, {
        exit_gate:      exitGateId,
        payment_method: payMethod,
        amount_charged: Number(noPlateFee),
        mobile_money_ref: payMethod === 'mobile_money' ? mmoRef : undefined,
      });
      try { await exitsAPI.openGate(exitGateId); } catch {}
      onCheckedOut(checkoutRes.data);
      showToast(`🔓 Gate opened! Flat fee ${ugx(Number(noPlateFee))} charged.`);
      printExitReceipt(checkoutRes.data, lot, 0);
      setNoInfoPlate(''); setNoInfoReason(''); setMmoRef('');
    } catch (err: any) { showToast(`❌ ${err?.response?.data?.detail ?? 'Checkout failed.'}`); }
    finally { setNoInfoPaying(false); }
  };

  return (
    <div>
      {/* Info panel */}
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          ⚠ Admin-Set Special Fees
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#92400e' }}>🎫 Lost Receipt: <strong>{ugx(Number(lostFee))}</strong> <span style={{ fontWeight: 400, fontSize: 11 }}>(surcharge on hourly)</span></span>
          <span style={{ fontSize: 13, color: '#92400e' }}>🎟 Lost Ticket: <strong>{ugx(Number(lostTicketFee))}</strong> <span style={{ fontWeight: 400, fontSize: 11 }}>(flat, unrecoverable)</span></span>
          <span style={{ fontSize: 13, color: '#92400e' }}>🔍 No Plate/Ticket: <strong>{ugx(Number(noPlateFee))}</strong> <span style={{ fontWeight: 400, fontSize: 11 }}>(flat, unidentifiable)</span></span>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { key: 'plate',       label: '🔍 Has Plate Number',         sub: 'Search by plate → find ticket → hourly + receipt fee' },
          { key: 'lost_ticket', label: '🎟 Ticket Completely Lost',    sub: 'Cannot find in system at all → flat lost ticket fee' },
          { key: 'no_info',     label: '❓ No Plate / No Info',        sub: 'Cannot identify vehicle → flat no-plate fee' },
        ].map(m => (
          <button key={m.key} onClick={() => { setMode(m.key as any); setTicket(null); setPaid(false); }} style={{
            flex: 1, padding: '14px 16px', border: `2px solid ${mode === m.key ? G.orange : G.border}`,
            borderRadius: 12, background: mode === m.key ? '#fff7ed' : G.white,
            cursor: 'pointer', textAlign: 'left',
          }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: G.dark }}>{m.label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: G.muted }}>{m.sub}</p>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* LEFT: Search / form */}
        <div>
          {mode === 'plate' && (
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: G.dark }}>🔍 Search by Plate</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input style={{ flex: 1, ...fS.input, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2, fontSize: 15 }}
                  placeholder="UAA 123B"
                  value={plateInput}
                  onChange={e => setPlateInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && searchByPlate()} />
                <button onClick={searchByPlate} style={{ padding: '10px 18px', background: G.primary, color: G.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>

              {ticket && (
                <div style={{ background: G.lighter, borderRadius: 10, padding: '14px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 800, color: G.dark }}>✅ Ticket Found</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
                    {[
                      ['Ticket #', `#${ticket.ticket_number}`],
                      ['Vehicle', `${VTYPE_ICONS[ticket.vehicle_type]} ${ticket.vehicle_type}`],
                      ['Plate', ticket.license_plate || '—'],
                      ['Duration', `${Math.floor(ticket.duration_hours)}h`],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <p style={{ margin: 0, fontSize: 11, color: G.muted, fontWeight: 600 }}>{l}</p>
                        <p style={{ margin: 0, fontWeight: 700, color: G.dark }}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, background: `linear-gradient(135deg, ${G.dark}, ${G.primary})`, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#d1fae5', fontSize: 11 }}>TOTAL (Hourly + Lost Receipt Fee)</p>
                    <p style={{ margin: '2px 0', color: G.white, fontSize: 26, fontWeight: 900 }}>
                      {ugx(ticket.calculated_fee + Number(lostFee))}
                    </p>
                    <p style={{ margin: 0, color: '#d1fae5', fontSize: 10 }}>
                      {ugx(ticket.calculated_fee)} + {ugx(Number(lostFee))} lost fee
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'lost_ticket' && (
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: G.dark }}>🎟 Completely Lost Ticket</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: G.muted }}>
                Use when the client cannot present their ticket AND the system has no record for their vehicle. A flat fee of <strong>{ugx(Number(lostTicketFee))}</strong> will be charged.
              </p>
              <form onSubmit={handleLostTicketCheckout}>
                <label style={fS.label}>Vehicle Type (best guess)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
                  {(['car','motorcycle','bicycle','van','truck'] as VehicleType[]).map(vt => (
                    <button key={vt} type="button" onClick={() => setNoInfoVehicle(vt)} style={{
                      padding: '8px 4px', borderRadius: 8, border: `2px solid ${noInfoVehicle === vt ? G.red : G.border}`,
                      background: noInfoVehicle === vt ? '#fef2f2' : G.white, cursor: 'pointer', fontSize: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}>
                      <span style={{ fontSize: 18 }}>{VTYPE_ICONS[vt]}</span>
                      {vt.slice(0, 5)}
                    </button>
                  ))}
                </div>

                <label style={fS.label}>Plate Number (if visible)</label>
                <input style={{ ...fS.input, marginBottom: 10, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2 }}
                  placeholder="UAA 123B or partial"
                  value={noInfoPlate}
                  onChange={e => setNoInfoPlate(e.target.value.toUpperCase())} />

                <label style={fS.label}>Notes / Reason</label>
                <input style={{ ...fS.input, marginBottom: 14 }}
                  placeholder="e.g. Ticket lost, not found in system after plate search"
                  value={noInfoReason}
                  onChange={e => setNoInfoReason(e.target.value)} required />

                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: G.red, fontSize: 14 }}>Flat Fee: {ugx(Number(lostTicketFee))}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: G.muted }}>No hourly calculation — admin-set flat rate for completely lost tickets</p>
                </div>

                <label style={fS.label}>Payment Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[['cash','💵 Cash'],['mobile_money','📱 MoMo']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setPayMethod(v as any)} style={{
                      padding: '10px', border: `2px solid ${payMethod === v ? G.primary : G.border}`,
                      borderRadius: 8, background: payMethod === v ? G.light : G.white, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark,
                    }}>{l}</button>
                  ))}
                </div>
                {payMethod === 'mobile_money' && (
                  <input style={{ ...fS.input, marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}
                    placeholder="MoMo Reference #"
                    value={mmoRef} onChange={e => setMmoRef(e.target.value.toUpperCase())} required />
                )}

                <label style={fS.label}>Exit Gate</label>
                <select style={{ ...fS.input, marginBottom: 14 }} value={exitGateId} onChange={e => setExitGateId(e.target.value)}>
                  {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>

                <button type="submit" disabled={noInfoPaying} style={{
                  width: '100%', padding: '14px', border: 'none', borderRadius: 10,
                  background: noInfoPaying ? G.muted : G.red, color: G.white, cursor: noInfoPaying ? 'wait' : 'pointer', fontWeight: 800, fontSize: 15,
                }}>
                  {noInfoPaying ? 'Processing…' : `💳 Charge ${ugx(Number(lostTicketFee))} & Open Gate`}
                </button>
              </form>
            </div>
          )}

          {mode === 'no_info' && (
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: G.dark }}>❓ Unidentifiable Vehicle</h3>
              <form onSubmit={handleNoInfoCheckout}>
                <label style={fS.label}>Vehicle Type (best guess)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
                  {(['car','motorcycle','bicycle','van','truck'] as VehicleType[]).map(vt => (
                    <button key={vt} type="button" onClick={() => setNoInfoVehicle(vt)} style={{
                      padding: '8px 4px', borderRadius: 8, border: `2px solid ${noInfoVehicle === vt ? G.orange : G.border}`,
                      background: noInfoVehicle === vt ? '#fff7ed' : G.white, cursor: 'pointer', fontSize: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}>
                      <span style={{ fontSize: 18 }}>{VTYPE_ICONS[vt]}</span>
                      {vt.slice(0, 5)}
                    </button>
                  ))}
                </div>

                <label style={fS.label}>Partial Plate (if any)</label>
                <input style={{ ...fS.input, marginBottom: 10, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2 }}
                  placeholder="UAA 1?? or UNKNOWN"
                  value={noInfoPlate}
                  onChange={e => setNoInfoPlate(e.target.value.toUpperCase())} />

                <label style={fS.label}>Reason / Notes</label>
                <input style={{ ...fS.input, marginBottom: 14 }}
                  placeholder="e.g. Receipt not found in system, vehicle at gate"
                  value={noInfoReason}
                  onChange={e => setNoInfoReason(e.target.value)} required />

                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: G.red, fontSize: 14 }}>Flat Fee: {ugx(Number(noPlateFee))}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: G.muted }}>No hourly calculation — admin set flat rate</p>
                </div>

                <label style={fS.label}>Payment Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[['cash','💵 Cash'],['mobile_money','📱 MoMo']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setPayMethod(v as any)} style={{
                      padding: '10px', border: `2px solid ${payMethod === v ? G.primary : G.border}`,
                      borderRadius: 8, background: payMethod === v ? G.light : G.white, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark,
                    }}>{l}</button>
                  ))}
                </div>
                {payMethod === 'mobile_money' && (
                  <input style={{ ...fS.input, marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}
                    placeholder="MoMo Reference #"
                    value={mmoRef} onChange={e => setMmoRef(e.target.value.toUpperCase())} required />
                )}

                <label style={fS.label}>Exit Gate</label>
                <select style={{ ...fS.input, marginBottom: 14 }} value={exitGateId} onChange={e => setExitGateId(e.target.value)}>
                  {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>

                <button type="submit" disabled={noInfoPaying} style={{
                  width: '100%', padding: '14px', border: 'none', borderRadius: 10,
                  background: noInfoPaying ? G.muted : G.orange, color: G.white, cursor: noInfoPaying ? 'wait' : 'pointer', fontWeight: 800, fontSize: 15,
                }}>
                  {noInfoPaying ? 'Processing…' : `💳 Charge ${ugx(Number(noPlateFee))} & Open Gate`}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT: Payment (plate mode) */}
        <div>
          {mode === 'plate' && ticket && !paid && (
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: G.dark }}>💳 Collect Payment</h3>

              <label style={fS.label}>Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[['cash','💵 Cash'],['mobile_money','📱 MoMo']].map(([v,l]) => (
                  <button key={v} onClick={() => setPayMethod(v as any)} style={{
                    padding: '14px 8px', border: `2px solid ${payMethod === v ? G.primary : G.border}`,
                    borderRadius: 10, background: payMethod === v ? G.light : G.white, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: G.dark,
                  }}>{l}</button>
                ))}
              </div>
              {payMethod === 'mobile_money' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={fS.label}>MoMo Reference #</label>
                  <input style={{ ...fS.input, fontFamily: 'monospace', fontSize: 14, letterSpacing: 1 }}
                    placeholder="MPS12345678"
                    value={mmoRef} onChange={e => setMmoRef(e.target.value.toUpperCase())} />
                </div>
              )}

              <label style={fS.label}>Exit Gate</label>
              <select style={{ ...fS.input, marginBottom: 14 }} value={exitGateId} onChange={e => setExitGateId(e.target.value)}>
                {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>

              <button onClick={handleLostCheckout} disabled={paying} style={{
                width: '100%', padding: '16px', border: 'none', borderRadius: 12,
                background: paying ? G.muted : G.orange, color: G.white, cursor: paying ? 'wait' : 'pointer',
                fontWeight: 900, fontSize: 16, boxShadow: paying ? 'none' : '0 6px 20px rgba(217,119,6,0.35)',
              }}>
                {paying ? '⏳ Processing…' : `✅ Confirm & Open Gate (${ugx(ticket.calculated_fee + Number(lostFee))})`}
              </button>
            </div>
          )}

          {mode === 'plate' && paid && (
            <div style={{ background: G.light, border: `3px solid ${G.primary}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 48, margin: '0 0 12px' }}>🎉</p>
              <p style={{ fontWeight: 900, fontSize: 22, color: G.dark }}>Payment Confirmed!</p>
              <p style={{ color: G.primary, fontWeight: 600 }}>Gate is opening…</p>
            </div>
          )}

          {mode === 'plate' && !ticket && (
            <div style={{ background: G.lighter, border: `1.5px dashed ${G.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center', color: G.muted }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>🔍</p>
              <p style={{ fontWeight: 600 }}>Search by plate to find the active ticket.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE CONTROL PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ExitGateControlPanel({
  lot, exits, slots, onQuickLog, showToast,
}: {
  lot: ParkingLot | null;
  exits: Exit[];
  slots: ParkingSlot[];
  onQuickLog: (t: Ticket) => void;
  showToast: (m: string) => void;
}) {
  const [selectedGate, setSelectedGate] = useState(exits[0]?.id ?? '');
  const [opening, setOpening]           = useState(false);
  const [showLogForm, setShowLogForm]   = useState(false);
  const [logVehicle, setLogVehicle]     = useState<VehicleType>('car');
  const [logPlate, setLogPlate]         = useState('');
  const [logReason, setLogReason]       = useState('');
  const [logging, setLogging]           = useState(false);

  useEffect(() => { if (exits.length && !selectedGate) setSelectedGate(exits[0].id); }, [exits]);

  const handleOpenGate = async () => {
    if (!selectedGate) { showToast('⚠ Select a gate.'); return; }
    setOpening(true);
    try { await exitsAPI.openGate(selectedGate); showToast('🔓 Gate opened!'); }
    catch { showToast('❌ Gate command failed.'); }
    finally { setOpening(false); }
  };

  const handleQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot || !selectedGate) { showToast('⚠ Select lot and gate.'); return; }
    setLogging(true);
    try {
      // Create exempt ticket for service vehicle
      const createRes = await ticketsAPI.create({
        lot: lot.id, entrance: null as any,
        vehicle_type: logVehicle, license_plate: logPlate.toUpperCase(),
        is_service_exempt: true,
        exempt_reason: logReason || 'Service vehicle — manual gate open (exit)',
      });
      await ticketsAPI.checkout(createRes.data.id, {
        exit_gate: selectedGate, payment_method: 'exempt' as any, amount_charged: 0,
      });
      try { await exitsAPI.openGate(selectedGate); } catch {}
      onQuickLog(createRes.data);
      showToast('🔓 Gate opened. Vehicle logged (no charge).');
      setLogPlate(''); setLogReason('');
    } catch { showToast('❌ Log failed.'); }
    finally { setLogging(false); }
  };

  const vacant   = slots.filter(s => s.status === 'vacant').length;
  const occupied = slots.filter(s => s.status === 'occupied').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: G.dark }}>🚪 Manual Gate Control</h3>

          <label style={fS.label}>Exit Gate</label>
          <select style={{ ...fS.input, marginBottom: 18, fontSize: 15 }} value={selectedGate} onChange={e => setSelectedGate(e.target.value)}>
            {exits.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: G.lighter, borderRadius: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: G.primary, boxShadow: `0 0 6px ${G.primary}`, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: G.dark, fontWeight: 600 }}>Gate Ready</span>
          </div>

          <button onClick={handleOpenGate} disabled={opening} style={{
            width: '100%', padding: '20px', border: 'none', borderRadius: 14,
            cursor: opening ? 'wait' : 'pointer',
            background: opening ? G.muted : `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
            color: G.white, fontWeight: 900, fontSize: 22,
            boxShadow: opening ? 'none' : '0 6px 20px rgba(22,163,74,0.4)', transition: 'all 0.2s', marginBottom: 12,
          }}>
            {opening ? '⏳ Opening…' : '🔓 OPEN GATE'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: G.muted, margin: 0 }}>
            Opens exit gate manually — no payment required
          </p>
        </div>

        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '18px', marginTop: 14 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: G.dark }}>🅿 Current Slot Status</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { label: 'Free',  count: vacant,   color: G.primary, icon: '🟢' },
              { label: 'Taken', count: occupied, color: G.red,     icon: '🔴' },
              { label: 'Total', count: slots.length, color: G.blue, icon: '🅿' },
            ].map(({ label, count, color, icon }) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color }}>{count}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: G.muted }}>{icon} {label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>📋 Log Service Vehicle Exit</h3>
            <button onClick={() => setShowLogForm(f => !f)} style={{
              padding: '6px 12px', background: showLogForm ? '#fef2f2' : G.lighter,
              color: showLogForm ? G.red : G.dark, border: `1.5px solid ${G.border}`,
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
            }}>{showLogForm ? '✕ Cancel' : '+ Log Vehicle'}</button>
          </div>

          <p style={{ margin: '0 0 14px', fontSize: 13, color: G.muted }}>
            For service, staff, and official vehicles that should not be charged. A record is logged, gate opens, no payment required.
          </p>

          {showLogForm && (
            <form onSubmit={handleQuickLog}>
              <label style={fS.label}>Vehicle Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
                {(['car','motorcycle','bicycle','van','truck'] as VehicleType[]).map(vt => (
                  <button key={vt} type="button" onClick={() => setLogVehicle(vt)} style={{
                    padding: '8px 4px', borderRadius: 8, border: `2px solid ${logVehicle === vt ? G.orange : G.border}`,
                    background: logVehicle === vt ? '#fff7ed' : G.white, cursor: 'pointer', fontSize: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ fontSize: 18 }}>{VTYPE_ICONS[vt]}</span>
                    {vt.slice(0,5)}
                  </button>
                ))}
              </div>

              <label style={fS.label}>License Plate</label>
              <input style={{ ...fS.input, marginBottom: 10, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 2 }}
                placeholder="UAA 123B"
                value={logPlate} onChange={e => setLogPlate(e.target.value.toUpperCase())} />

              <label style={fS.label}>Reason</label>
              <input style={{ ...fS.input, marginBottom: 14 }}
                placeholder="e.g. KCCA Vehicle, Staff, Campus Carrier"
                value={logReason} onChange={e => setLogReason(e.target.value)} required />

              <button type="submit" disabled={logging} style={{
                width: '100%', padding: '13px', background: G.orange, color: G.white,
                border: 'none', borderRadius: 10, cursor: logging ? 'wait' : 'pointer', fontWeight: 800, fontSize: 15,
              }}>{logging ? 'Logging…' : '📋 Log & Open Gate (No Charge)'}</button>
            </form>
          )}

          {!showLogForm && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>CONFIGURED EXIT GATES</p>
              {exits.map(ex => (
                <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: G.lighter, borderRadius: 8, marginBottom: 6 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: G.dark }}>🚪 {ex.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: G.muted }}>Sensor: {ex.sensor_id}</p>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 20, background: ex.is_active ? G.light : '#f3f4f6', color: ex.is_active ? G.dark : G.muted, fontSize: 11, fontWeight: 700 }}>
                    {ex.is_active ? 'Active' : 'Inactive'}
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

function ExitVehicleLogPanel({ tickets, lot, onRefresh }: {
  tickets: Ticket[];
  lot: ParkingLot | null;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = tickets.filter(t =>
    !search ||
    t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
    t.license_plate.toLowerCase().includes(search.toLowerCase()) ||
    t.vehicle_type.toLowerCase().includes(search.toLowerCase()) ||
    (t.status || '').toLowerCase().includes(search.toLowerCase())
  );

  const exits   = filtered.filter(t => t.status !== 'active');
  const active  = filtered.filter(t => t.status === 'active');

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
          <input style={{ ...fS.input, paddingLeft: 38 }}
            placeholder="Search ticket #, plate, or status…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={onRefresh} style={{ padding: '10px 16px', background: G.lighter, border: `1.5px solid ${G.border}`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: G.dark }}>
          ↻ Refresh
        </button>
      </div>

      {/* Summary counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Today',   count: filtered.length, color: G.blue,    icon: '📋' },
          { label: 'Checked Out',   count: exits.length,    color: G.primary, icon: '✅' },
          { label: 'Still Inside',  count: active.length,   color: G.red,     icon: '🔴' },
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

      <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: G.dark, fontSize: 14 }}>Today's Vehicle Log — {lot?.name}</span>
          <span style={{ fontSize: 12, color: G.muted }}>{filtered.length} records</span>
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
                  {['#','Time In','Time Out','Type','Plate','Duration','Fee','Status',''].map(h => (
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
                      <td style={{ padding: '10px 12px', color: G.muted, fontSize: 12 }}>
                        {t.exit_time ? new Date(t.exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{VTYPE_ICONS[t.vehicle_type]} {t.vehicle_type}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1.5 }}>{t.license_plate || '—'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{hrs}h {mins}m</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: G.dark }}>
                        {t.amount_charged > 0 ? ugx(t.amount_charged) : '—'}
                        {t.is_service_exempt && <span style={{ marginLeft: 4, fontSize: 10, color: G.orange }}>Exempt</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: t.status === 'active' ? G.primary : t.status === 'paid' ? G.blue : G.muted, color: G.white }}>
                          {t.status === 'active' ? 'Inside' : t.status === 'paid' ? 'Paid' : t.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => printExitReceipt(t, null, 0)} style={{ padding: '5px 10px', background: G.lighter, border: `1px solid ${G.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: G.dark }}>
                          🖨
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

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>{time.toLocaleDateString()}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXIT ATTENDANT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

type MenuPage = 'dashboard' | 'scan_checkout' | 'lost_receipt' | 'gate_control' | 'vehicle_log';

interface Props { onLogout: () => void; }

export default function ExitAttendantDashboard({ onLogout }: Props) {
  const { user } = useAuth();
  const [page,        setPage]        = useState<MenuPage>('dashboard');
  const [showDisplay, setShowDisplay] = useState(false);
  const [lots,       setLots]      = useState<ParkingLot[]>([]);
  const [activeLot,  setActiveLot] = useState<ParkingLot | null>(null);
  const [slots,      setSlots]     = useState<ParkingSlot[]>([]);
  const [exits,      setExits]     = useState<Exit[]>([]);
  const [tickets,    setTickets]   = useState<Ticket[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [toast,      setToast]     = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Sensor notification: vehicle detected at exit gate
  const [sensorNotif, setSensorNotif] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

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
      exitsAPI.list(activeLot.id),
      ticketsAPI.list({ lot: activeLot.id, entry_time__date: today }),
    ]).then(([slotsRes, exitsRes, ticketsRes]) => {
      setSlots(slotsRes.data.results);
      setExits(exitsRes.data.results);
      setTickets(ticketsRes.data.results);
    });
  }, [activeLot]);

  // Real-time WebSocket
  useLotWebSocket(activeLot?.id ?? '', {
    slot_update: (payload: any) => {
      setSlots(prev => prev.map(s => s.id === payload.id ? { ...s, ...payload } : s));
    },
    ticket_created: (payload: any) => {
      setTickets(prev => prev.some(t => t.id === payload.id) ? prev : [payload, ...prev]);
    },
    ticket_closed: (payload: any) => {
      setTickets(prev => prev.map(t => t.id === payload.id ? { ...t, ...payload } : t));
    },
    // Sensor detects vehicle at exit gate
    exit_detected: (payload: any) => {
      setSensorNotif(`🚗 Vehicle detected at ${payload.gate_name ?? 'exit gate'}!`);
      // Auto-navigate to scan page and trigger scan input focus
      setPage('scan_checkout');
      // Notify the scan panel
      if ((window as any).__exitSensorAlert) {
        (window as any).__exitSensorAlert(`Vehicle at exit gate — scan ticket!`);
      }
      showToast(`🔔 Vehicle at exit — scan ticket!`);
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

  const menuItems: { key: MenuPage; icon: string; label: string }[] = [
    { key: 'dashboard',    icon: '🏠', label: 'Dashboard' },
    { key: 'scan_checkout', icon: '🔍', label: 'Scan & Checkout' },
    { key: 'lost_receipt', icon: '🎫', label: 'Lost Receipt' },
    { key: 'gate_control', icon: '🚪', label: 'Gate Control' },
    { key: 'vehicle_log',  icon: '📋', label: 'Vehicle Log' },
  ];

  const checkedOutToday = tickets.filter(t => t.status === 'paid' || t.status === 'exempt').length;
  const stillInside     = tickets.filter(t => t.status === 'active').length;
  const revenueToday    = tickets.reduce((sum, t) => sum + Number(t.amount_charged ?? 0), 0);
  const vacant          = slots.filter(s => s.status === 'vacant').length;
  const occupied        = slots.filter(s => s.status === 'occupied').length;

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
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${G.red}, #991b1b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>🚪</span>
          </div>
          {sidebarOpen && (
            <div>
              <p style={{ margin: 0, color: G.white, fontWeight: 700, fontSize: 12 }}>Exit Panel</p>
              <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>IUIU Parking</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#86efac', cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Attendant info */}
        {sidebarOpen && user && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${G.red}, #991b1b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: G.white, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                {user.first_name?.[0]?.toUpperCase() ?? 'E'}
              </div>
              <div>
                <p style={{ margin: 0, color: G.white, fontWeight: 600, fontSize: 12 }}>{user.first_name} {user.last_name}</p>
                <p style={{ margin: 0, color: '#86efac', fontSize: 10 }}>Exit Attendant</p>
              </div>
            </div>
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

        {/* Lot selector */}
        {sidebarOpen && lots.length > 1 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {lots.map(lot => (
              <button key={lot.id} onClick={() => setActiveLot(lot)} style={{
                display: 'flex', alignItems: 'center', width: '100%', padding: '7px 8px',
                border: 'none', borderRadius: 6, fontSize: 11, fontWeight: activeLot?.id === lot.id ? 700 : 400,
                background: activeLot?.id === lot.id ? 'rgba(220,38,38,0.25)' : 'transparent',
                color: activeLot?.id === lot.id ? '#fca5a5' : '#d1fae5',
                cursor: 'pointer', marginBottom: 2, textAlign: 'left',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: lot.is_full ? G.red : G.primary, display: 'inline-block', marginRight: 6 }} />
                {lot.name}
              </button>
            ))}
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {menuItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: sidebarOpen ? '12px 12px' : '12px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center',
              border: 'none', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
              background: page === item.key ? 'rgba(220,38,38,0.25)' : 'transparent',
              color: page === item.key ? '#fca5a5' : '#d1fae5',
              fontWeight: page === item.key ? 700 : 400, fontSize: 13, transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && item.label}
              {/* Sensor notification badge */}
              {item.key === 'scan_checkout' && sensorNotif && (
                <span style={{ marginLeft: 'auto', width: 10, height: 10, borderRadius: '50%', background: G.red, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 6px ${G.red}` }} />
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
          <button onClick={onLogout} style={{ width: '100%', padding: '10px', border: '1.5px solid #4ade80', borderRadius: 8, background: 'transparent', color: '#4ade80', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
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
          {sensorNotif && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: G.orange, borderRadius: 10, padding: '8px 16px' }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <span style={{ color: G.white, fontWeight: 700, fontSize: 13 }}>{sensorNotif}</span>
              <button onClick={() => { setSensorNotif(''); setPage('scan_checkout'); }} style={{ background: 'none', border: 'none', color: G.white, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                Scan Now →
              </button>
              <button onClick={() => setSensorNotif('')} style={{ background: 'none', border: 'none', color: G.white, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
          )}
        </div>

        {/* ── DASHBOARD PAGE ────────────────────────────────────────── */}
        {page === 'dashboard' && (
          <div>
            <div style={{ background: `linear-gradient(135deg, #991b1b, ${G.red})`, borderRadius: 16, padding: '22px 26px', marginBottom: 24, color: G.white }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                Welcome, {user?.first_name ?? 'Attendant'} 👋
              </h2>
              <p style={{ margin: '6px 0 0', color: '#fca5a5', fontSize: 13 }}>
                Exit Attendant · {activeLot?.name ?? 'IUIU Parking'} · {new Date().toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Checked out today', value: checkedOutToday },
                  { label: 'Still inside',       value: stillInside },
                  { label: 'Revenue today',       value: `UGX ${revenueToday.toLocaleString()}` },
                  { label: 'Free slots',          value: vacant },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>{value}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#fca5a5' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Slot grid */}
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: G.dark }}>🅿 Slot Status</h3>
                <span style={{ fontSize: 12, color: G.muted }}>{slots.length} total</span>
              </div>
              {/* Inline slot grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { key: 'vacant',      label: 'Available',   icon: '🟢', color: G.primary },
                  { key: 'occupied',    label: 'Occupied',    icon: '🔴', color: G.red },
                  { key: 'reserved',    label: 'Booked',      icon: '🟠', color: G.orange },
                  { key: 'maintenance', label: 'Maintenance', icon: '⚫', color: G.muted },
                ].map(({ key, label, icon, color }) => (
                  <div key={key} style={{ background: G.white, border: `2px solid ${color}20`, borderLeft: `5px solid ${color}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color }}>{slots.filter(s => s.status === key).length}</p>
                      <p style={{ margin: 0, fontSize: 12, color: G.muted, fontWeight: 600 }}>{label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 5 }}>
                {slots.map(slot => (
                  <div key={slot.id} title={`${slot.slot_number} — ${slot.status}`} style={{
                    height: 44, borderRadius: 8,
                    background: slot.status === 'vacant' ? G.primary : slot.status === 'occupied' ? G.red : slot.status === 'reserved' ? G.orange : G.muted,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  }}>
                    <span style={{ color: G.white, fontSize: 10, fontWeight: 700 }}>{slot.slot_number}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <button onClick={() => setPage('scan_checkout')} style={{ padding: '20px', background: G.red, color: G.white, border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 32 }}>🔍</span>Scan & Checkout
              </button>
              <button onClick={() => setPage('lost_receipt')} style={{ padding: '20px', background: G.orange, color: G.white, border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 32 }}>🎫</span>Lost Receipt
              </button>
            </div>
          </div>
        )}

        {/* ── SCAN & CHECKOUT ───────────────────────────────────── */}
        {page === 'scan_checkout' && (
          <ScanCheckoutPanel
            lot={activeLot}
            exits={exits}
            onCheckedOut={t => setTickets(prev => prev.map(x => x.id === t.id ? t : x))}
            showToast={showToast}
          />
        )}

        {/* ── LOST RECEIPT ──────────────────────────────────────── */}
        {page === 'lost_receipt' && (
          <LostReceiptPanel
            lot={activeLot}
            exits={exits}
            onCheckedOut={t => setTickets(prev => prev.map(x => x.id === t.id ? t : x))}
            showToast={showToast}
          />
        )}

        {/* ── GATE CONTROL ──────────────────────────────────────── */}
        {page === 'gate_control' && (
          <ExitGateControlPanel
            lot={activeLot}
            exits={exits}
            slots={slots}
            onQuickLog={t => setTickets(prev => [t, ...prev])}
            showToast={showToast}
          />
        )}

        {/* ── VEHICLE LOG ───────────────────────────────────────── */}
        {page === 'vehicle_log' && (
          <ExitVehicleLogPanel
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
        * { box-sizing: border-box; }
        select, input, button { font-family: inherit; }
        @media print {
          body > *:not(#__exit_receipt_print__) { display: none !important; }
          #__exit_receipt_print__ { display: block !important; }
        }
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
