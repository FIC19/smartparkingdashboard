/**
 * IUIU Smart Parking — Entrance Validation Modal
 * ================================================
 * Shown automatically when the entrance ESP32 detects a vehicle.
 *
 * Workflow:
 *  1. entrance_detected WS event → modal opens (waiting for plate scan)
 *  2. plate_scanned WS event    → shows captured image + OCR plate text
 *  3. Attendant verifies plate, selects vehicle type
 *  4. Confirm → creates ticket, queues receipt print + gate open command
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ticketsAPI, esp32API } from '../api/client';
import type { VehicleType, ParkingLot, Entrance, Device } from '../types';

// ── Colour palette (matches IUIU green theme) ─────────────────────────────
const G = {
  primary:  '#16a34a',
  dark:     '#14532d',
  bg:       '#f0fdf4',
  border:   '#bbf7d0',
  text:     '#111827',
  muted:    '#6b7280',
  white:    '#ffffff',
  danger:   '#dc2626',
  amber:    '#d97706',
};

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'car',        label: 'Car',          icon: '🚗' },
  { value: 'motorcycle', label: 'Motorcycle',   icon: '🏍️' },
  { value: 'van',        label: 'Van / Minibus', icon: '🚐' },
  { value: 'truck',      label: 'Truck / Bus',  icon: '🚚' },
  { value: 'bicycle',    label: 'Bicycle',      icon: '🚲' },
];

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  /** Lot that owns this entrance */
  activeLot:      ParkingLot;
  /** Entrance gate the vehicle arrived at */
  entrance:       Entrance | null;
  /** ESP32 entrance device (for gate-open command) */
  entranceDevice: Device | null;
  /** Called when modal is dismissed without creating a ticket */
  onDismiss:      () => void;
  /** Called after ticket is created successfully */
  onTicketCreated: (ticketId: string) => void;
  /** Initial plate text from OCR (may be empty) */
  initialPlate?:  string;
  /** Base64 image from ESP32-CAM (may be empty) */
  capturedImage?: string;
  /** Show toast notification */
  showToast:      (msg: string) => void;
}

export default function EntranceValidationModal({
  activeLot,
  entrance,
  entranceDevice,
  onDismiss,
  onTicketCreated,
  initialPlate  = '',
  capturedImage = '',
  showToast,
}: Props) {
  const [plate,       setPlate]       = useState(initialPlate);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [imageB64,    setImageB64]    = useState(capturedImage);
  const [plateReady,  setPlateReady]  = useState(!!initialPlate);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  // Update plate/image if a new plate_scanned event arrives while modal is open
  useEffect(() => {
    if (initialPlate) { setPlate(initialPlate); setPlateReady(true); }
  }, [initialPlate]);

  useEffect(() => {
    if (capturedImage) setImageB64(capturedImage);
  }, [capturedImage]);

  const handleConfirm = useCallback(async () => {
    if (!plate.trim()) { setError('License plate is required.'); return; }
    if (!entrance)     { setError('No entrance gate is configured.'); return; }

    setSubmitting(true);
    setError('');

    try {
      // 1. Create ticket
      const res = await ticketsAPI.create({
        lot:          activeLot.id,
        entrance:     entrance.id,
        vehicle_type: vehicleType,
        license_plate: plate.trim().toUpperCase(),
      });
      const ticket = res.data;

      // 2. Send LCD "Ticket Created" to entrance device
      if (entranceDevice) {
        await esp32API.updateLCD({
          device_id: entranceDevice.device_id,
          line1:     'TICKET CREATED',
          line2:     `Plate: ${ticket.license_plate}`,
          line3:     `Slot:  ${ticket.slot_number ?? 'Assigned'}`,
          line4:     'Attendant: Open Gate',
        }).catch(() => {/* non-critical */});
      }

      showToast(`✅ Ticket ${ticket.ticket_number} created — Slot ${ticket.slot_number ?? 'N/A'}`);
      onTicketCreated(ticket.id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.response?.data?.license_plate?.[0] ?? 'Failed to create ticket.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [plate, vehicleType, activeLot, entrance, entranceDevice, onTicketCreated, showToast]);

  const handleOpenGate = useCallback(async () => {
    if (!entranceDevice) { showToast('No entrance device configured.'); return; }
    try {
      await esp32API.openGate({
        device_id:   entranceDevice.device_id,
        gate_type:   'entrance',
        duration_ms: 6000,
      });
      showToast('🚪 Gate open command sent');
      onDismiss();
    } catch {
      showToast('❌ Failed to send gate command');
    }
  }, [entranceDevice, onDismiss, showToast]);

  return (
    <div style={S.overlay}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.headerIcon}>🚗</span>
            <div>
              <div style={S.headerTitle}>Vehicle Detected — Entrance Validation</div>
              <div style={S.headerSub}>
                {activeLot.name} &nbsp;·&nbsp; {entrance?.name ?? 'Entrance Gate'}
              </div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onDismiss} title="Dismiss">✕</button>
        </div>

        <div style={S.body}>
          {/* Left: captured image + plate OCR */}
          <div style={S.leftPanel}>
            <div style={S.sectionLabel}>Captured Plate Image</div>
            <div style={S.imageBox}>
              {imageB64 ? (
                <img
                  src={`data:image/jpeg;base64,${imageB64}`}
                  alt="Captured plate"
                  style={S.plateImg}
                />
              ) : (
                <div style={S.noImage}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                  <div style={{ fontSize: 13, color: G.muted }}>
                    {plateReady ? 'No camera image' : 'Waiting for camera scan…'}
                  </div>
                  {!plateReady && <div style={S.spinner} />}
                </div>
              )}
            </div>

            {/* OCR result badge */}
            {plateReady && (
              <div style={S.ocrBadge}>
                <span style={{ fontSize: 11, color: G.muted }}>OCR RESULT</span>
                <span style={S.ocrText}>{plate || '—'}</span>
              </div>
            )}
          </div>

          {/* Right: form */}
          <div style={S.rightPanel}>

            {/* License plate input */}
            <div style={S.fieldGroup}>
              <label style={S.label}>License Plate Number *</label>
              <input
                style={S.plateInput}
                type="text"
                value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g. UAZ 123B"
                maxLength={12}
                autoFocus
              />
              <div style={{ fontSize: 11, color: G.muted, marginTop: 4 }}>
                OCR auto-filled — verify and correct if needed
              </div>
            </div>

            {/* Vehicle type selector */}
            <div style={S.fieldGroup}>
              <label style={S.label}>Vehicle Type *</label>
              <div style={S.typeGrid}>
                {VEHICLE_TYPES.map(vt => (
                  <button
                    key={vt.value}
                    style={{
                      ...S.typeBtn,
                      ...(vehicleType === vt.value ? S.typeBtnActive : {}),
                    }}
                    onClick={() => setVehicleType(vt.value)}
                  >
                    <span style={{ fontSize: 22 }}>{vt.icon}</span>
                    <span style={{ fontSize: 11, marginTop: 3 }}>{vt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={S.errorBox}>⚠️ {error}</div>
            )}

            {/* Action buttons */}
            <div style={S.actions}>
              <button
                style={{ ...S.btn, ...S.btnPrimary, opacity: submitting ? 0.7 : 1 }}
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? 'Creating…' : '✅ Confirm & Create Ticket'}
              </button>

              <button
                style={{ ...S.btn, ...S.btnGate }}
                onClick={handleOpenGate}
                disabled={submitting}
                title="Open gate without creating ticket (emergency)"
              >
                🚪 Open Gate Only
              </button>

              <button
                style={{ ...S.btn, ...S.btnCancel }}
                onClick={onDismiss}
              >
                Cancel
              </button>
            </div>

            {/* Info footer */}
            <div style={S.infoBox}>
              <strong>Instructions:</strong><br />
              1. Verify the license plate is correct<br />
              2. Select the vehicle type manually<br />
              3. Click "Confirm" to create the ticket<br />
              4. Click "Open Gate" to raise the barrier
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modal: {
    background: G.white,
    borderRadius: 16,
    width: '100%', maxWidth: 860,
    maxHeight: '92vh',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px',
    background: `linear-gradient(135deg, ${G.dark}, ${G.primary})`,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 28 },
  headerTitle: { fontSize: 16, fontWeight: 700, color: G.white },
  headerSub:   { fontSize: 12, color: '#bbf7d0', marginTop: 2 },
  closeBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8, color: G.white,
    fontSize: 16, cursor: 'pointer',
    padding: '4px 10px',
  },
  body: {
    display: 'flex', gap: 0, flex: 1,
    minHeight: 0, overflow: 'hidden',
  },
  leftPanel: {
    width: 280, flexShrink: 0,
    background: '#f9fafb',
    borderRight: `1px solid ${G.border}`,
    padding: 20,
    display: 'flex', flexDirection: 'column', gap: 12,
    overflow: 'auto',
  },
  rightPanel: {
    flex: 1, padding: 24,
    overflow: 'auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: G.muted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  imageBox: {
    flex: 1, minHeight: 180,
    background: '#f3f4f6',
    borderRadius: 10,
    border: `2px dashed ${G.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  plateImg: {
    width: '100%', height: '100%',
    objectFit: 'contain',
  },
  noImage: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 20, textAlign: 'center',
  },
  spinner: {
    marginTop: 12,
    width: 24, height: 24,
    border: `3px solid ${G.border}`,
    borderTopColor: G.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  ocrBadge: {
    background: '#fff',
    border: `1px solid ${G.border}`,
    borderRadius: 8,
    padding: '8px 12px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  ocrText: {
    fontSize: 18, fontWeight: 800,
    color: G.dark, letterSpacing: 2,
    fontFamily: 'monospace',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 12, fontWeight: 700, color: G.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  plateInput: {
    padding: '12px 14px',
    fontSize: 22, fontWeight: 800,
    border: `2px solid ${G.border}`,
    borderRadius: 10,
    outline: 'none',
    fontFamily: 'monospace',
    letterSpacing: 3,
    color: G.dark,
    textTransform: 'uppercase',
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  typeBtn: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '10px 4px',
    border: `2px solid ${G.border}`,
    borderRadius: 10,
    background: '#f9fafb',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  typeBtnActive: {
    borderColor: G.primary,
    background: '#dcfce7',
    color: G.dark,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13, color: G.danger,
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  btn: {
    padding: '12px 18px',
    border: 'none',
    borderRadius: 10,
    fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`,
    color: G.white,
  },
  btnGate: {
    background: '#fef3c7',
    color: '#92400e',
    border: '1.5px solid #fcd34d',
  },
  btnCancel: {
    background: '#f3f4f6',
    color: G.muted,
  },
  infoBox: {
    background: G.bg,
    border: `1px solid ${G.border}`,
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 12, color: G.muted,
    lineHeight: 1.8,
  },
};
