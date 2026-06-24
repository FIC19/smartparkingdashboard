"""
IUIU Smart Parking — Utilities
Covers: Ticket generation, QR code creation, ESP32 IoT commands (via device_control),
        revenue analytics queries including weekly, peak hours.
"""
import uuid
import json
import qrcode
import io
import base64
from datetime import date, timedelta, datetime
from decimal import Decimal

from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# TICKET NUMBER GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

def generate_ticket_number() -> str:
    """Generate a human-readable unique ticket number: SP-YYYYMMDD-XXXX"""
    today  = date.today().strftime('%Y%m%d')
    suffix = uuid.uuid4().hex[:6].upper()
    return f"SP-{today}-{suffix}"


# ─────────────────────────────────────────────────────────────────────────────
# QR CODE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def generate_qr_base64(ticket) -> str:
    """
    Encode ticket metadata into a QR code and return a base64 PNG string
    suitable for embedding in an HTML img tag or printing via Sunmi V2 Pro.
    """
    payload = {
        "ticket_number": ticket.ticket_number,
        "lot":           str(ticket.lot_id),
        "vehicle_type":  ticket.vehicle_type,
        "license_plate": ticket.license_plate,
        "entry_time":    ticket.entry_time.isoformat(),
        "slot":          ticket.assigned_slot.slot_number if ticket.assigned_slot else None,
    }
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=4,
    )
    qr.add_data(json.dumps(payload))
    qr.make(fit=True)
    img    = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


# ─────────────────────────────────────────────────────────────────────────────
# ESP32 COMMANDS (via device_control app)
# ─────────────────────────────────────────────────────────────────────────────

def esp32_open_gate(device_id: str, gate_type: str, duration_ms: int = 6000) -> bool:
    """Queue a gate-open command for an ESP32 device."""
    try:
        from device_control.models import Device, DeviceCommand
        device = Device.objects.filter(device_id=device_id).first()
        if not device:
            return False
        DeviceCommand.objects.create(
            device=device,
            command_type='open_gate',
            payload={'gate_type': gate_type, 'duration_ms': duration_ms},
        )
        return True
    except Exception:
        return False


def esp32_lcd_update(device_id: str, line1: str, line2: str = '',
                     line3: str = '', line4: str = '') -> bool:
    """Queue an LCD update command for an ESP32 device."""
    try:
        from device_control.models import Device, DeviceCommand
        device = Device.objects.filter(device_id=device_id).first()
        if not device:
            return False
        DeviceCommand.objects.create(
            device=device,
            command_type='lcd_update',
            payload={'line1': line1, 'line2': line2,
                     'line3': line3, 'line4': line4},
        )
        return True
    except Exception:
        return False


def esp32_play_audio(device_id: str, track_number: int, volume: int = 25) -> bool:
    """Queue an audio playback command for an ESP32 device."""
    try:
        from device_control.models import Device, DeviceCommand
        device = Device.objects.filter(device_id=device_id).first()
        if not device:
            return False
        DeviceCommand.objects.create(
            device=device,
            command_type='play_audio',
            payload={'track_number': track_number, 'volume': volume},
        )
        return True
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# LEGACY FIREBASE STUBS (kept to avoid import errors; no-ops in production)
# ─────────────────────────────────────────────────────────────────────────────

def firebase_command_gate(gate_type, sensor_id, command, lot_node=''):
    return False

def firebase_trigger_audio(lot_node, track_number, volume=25):
    return False

def firebase_update_slot(lot_node, sensor_id, status):
    return False

def firebase_broadcast_alert(lot_node, alert_type, message):
    return False


# ─────────────────────────────────────────────────────────────────────────────
# SLOT ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

def assign_best_slot(lot, vehicle_class: str):
    """
    Find the best vacant slot for a vehicle class.
    Falls back to any vacant slot if no typed slot available.
    Returns a ParkingSlot or None.
    """
    from .models import ParkingSlot
    # Try type-specific first
    slot = (
        ParkingSlot.objects
        .filter(lot=lot, status='vacant', slot_type__vehicle_class=vehicle_class)
        .select_related('slot_type')
        .first()
    )
    if slot:
        return slot
    # Fallback: any vacant slot in the lot
    return (
        ParkingSlot.objects
        .filter(lot=lot, status='vacant')
        .select_related('slot_type')
        .first()
    )


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOG HELPER
# ─────────────────────────────────────────────────────────────────────────────

def log_action(user, action: str, target_type: str = '', target_id: str = '',
               detail: str = '', metadata: dict = None, ip_address: str = None):
    """Create an AuditLog entry. Never raises — failures are silent."""
    try:
        from .models import AuditLog
        AuditLog.objects.create(
            user=user,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            detail=detail,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET BROADCAST
# ─────────────────────────────────────────────────────────────────────────────

def ws_broadcast_lot(lot_id: str, message: dict):
    """Broadcast a message to all WebSocket clients subscribed to a lot group."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"lot_{lot_id}",
                {"type": "ws_event", "data": message},
            )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# REVENUE & ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

def get_lot_analytics(lot) -> dict:
    """Return a rich analytics snapshot for a single ParkingLot."""
    from .models import Ticket, ParkingSlot, SlotType

    now        = timezone.now()
    today      = now.date()
    week_start = today - timedelta(days=today.weekday())  # Monday
    month_start = today.replace(day=1)

    paid_statuses = ['paid', 'exempt']

    # ── counts ──────────────────────────────────────────────────────────────
    tickets_today = Ticket.objects.filter(
        lot=lot, entry_time__date=today
    )
    tickets_active = Ticket.objects.filter(lot=lot, status='active')

    # ── revenue ─────────────────────────────────────────────────────────────
    revenue_today = Ticket.objects.filter(
        lot=lot, status__in=paid_statuses, entry_time__date=today
    ).aggregate(total=Sum('amount_charged'))['total'] or Decimal('0')

    revenue_week = Ticket.objects.filter(
        lot=lot, status__in=paid_statuses,
        entry_time__date__gte=week_start
    ).aggregate(total=Sum('amount_charged'))['total'] or Decimal('0')

    revenue_month = Ticket.objects.filter(
        lot=lot, status__in=paid_statuses,
        entry_time__date__gte=month_start
    ).aggregate(total=Sum('amount_charged'))['total'] or Decimal('0')

    # ── by vehicle type (today) ──────────────────────────────────────────────
    by_vehicle = dict(
        Ticket.objects.filter(lot=lot, entry_time__date=today)
              .values('vehicle_type')
              .annotate(count=Count('id'))
              .values_list('vehicle_type', 'count')
    )

    # ── by slot type ─────────────────────────────────────────────────────────
    by_slot = {}
    for st in SlotType.objects.all():
        occupied = ParkingSlot.objects.filter(
            lot=lot, slot_type=st, status='occupied'
        ).count()
        total = ParkingSlot.objects.filter(lot=lot, slot_type=st).count()
        by_slot[st.vehicle_class] = {'occupied': occupied, 'total': total}

    # ── peak hours (last 7 days) ─────────────────────────────────────────────
    week_ago = now - timedelta(days=7)
    peak_raw = (
        Ticket.objects
        .filter(lot=lot, entry_time__gte=week_ago)
        .extra(select={'hour': 'EXTRACT(HOUR FROM entry_time)'})
        .values('hour')
        .annotate(count=Count('id'))
        .order_by('hour')
    )
    peak_hours = {int(row['hour']): row['count'] for row in peak_raw}
    # Fill missing hours with 0
    peak_hours_full = [peak_hours.get(h, 0) for h in range(24)]

    # ── daily revenue (last 30 days) ─────────────────────────────────────────
    thirty_days_ago = today - timedelta(days=30)
    daily_revenue_raw = (
        Ticket.objects
        .filter(lot=lot, status__in=paid_statuses,
                entry_time__date__gte=thirty_days_ago)
        .extra(select={'day': "DATE(entry_time)"})
        .values('day')
        .annotate(revenue=Sum('amount_charged'), count=Count('id'))
        .order_by('day')
    )
    daily_revenue = [
        {'day': str(r['day']), 'revenue': float(r['revenue'] or 0), 'count': r['count']}
        for r in daily_revenue_raw
    ]

    occupied_count = lot.occupied_slots
    total_capacity = lot.total_capacity

    return {
        'lot_id':          str(lot.id),
        'lot_name':        lot.name,
        'total_capacity':  total_capacity,
        'occupied':        occupied_count,
        'vacant':          lot.available_slots,
        'occupancy_rate':  round(occupied_count / total_capacity * 100, 1) if total_capacity else 0,
        'active_tickets':  tickets_active.count(),
        'tickets_today':   tickets_today.count(),
        'revenue_today':   float(revenue_today),
        'revenue_week':    float(revenue_week),
        'revenue_month':   float(revenue_month),
        'by_vehicle_type': by_vehicle,
        'by_slot_type':    by_slot,
        'peak_hours':      peak_hours_full,
        'daily_revenue':   daily_revenue,
    }
