"""
IUIU Smart Parking — ESP32 Device Control Views

Architecture:
  ESP32 → POST /api/esp/events/            (report sensor events)
  ESP32 → GET  /api/esp/commands/<id>/     (poll for pending commands)
  Dashboard → POST /api/gate/open/         (queue gate-open command)
  Dashboard → POST /api/lcd/update/        (queue LCD text update)
  Dashboard → POST /api/audio/play/        (queue DFPlayer audio)
  Dashboard → GET/POST /api/devices/       (manage device records)
  Dashboard → GET /api/devices/events/     (view event log)
"""
import base64
import logging

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Device, DeviceCommand, SensorEvent
from .serializers import (
    DeviceSerializer, DeviceCommandSerializer, SensorEventSerializer,
    ESPEventPayloadSerializer, GateOpenSerializer, LCDUpdateSerializer, AudioPlaySerializer,
)
from parking.permissions import IsAdmin, IsAttendant

logger       = logging.getLogger(__name__)
channel_layer = get_channel_layer()

# How long with no heartbeat before a device is considered offline (seconds)
OFFLINE_THRESHOLD_SECS = 90


# ── WebSocket broadcast helpers ───────────────────────────────────────────────

def _broadcast_lot(lot_id: str | None, msg_type: str, payload: dict) -> None:
    """Send a message to all WS clients watching lot_<lot_id>."""
    if not channel_layer or not lot_id:
        return
    async_to_sync(channel_layer.group_send)(
        f"lot_{lot_id}",
        {"type": msg_type.replace("-", "_"), "payload": payload},
    )


def _broadcast_devices(event_type: str, payload: dict) -> None:
    """Send a message to all WS clients on the global 'devices' group."""
    if not channel_layer:
        return
    async_to_sync(channel_layer.group_send)(
        "devices",
        {"type": "device_event", "event_type": event_type, "payload": payload},
    )


# ── OCR helper ────────────────────────────────────────────────────────────────

def _run_ocr(image_b64: str) -> str:
    """
    Decode a base64 JPEG/PNG (sent by ESP32-CAM) and extract license plate text
    using pytesseract + OpenCV preprocessing. Fully offline — no cloud API.
    Falls back to empty string if dependencies are missing.
    """
    if not image_b64:
        return ""
    try:
        import cv2
        import numpy as np
        import pytesseract
        from PIL import Image

        img_bytes = base64.b64decode(image_b64)
        arr       = np.frombuffer(img_bytes, dtype=np.uint8)
        img       = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return ""

        # Preprocessing pipeline
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        # Upscale small images for better recognition
        scale = max(1, 300 // max(h, 1))
        if scale > 1:
            gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
        gray  = cv2.GaussianBlur(gray, (3, 3), 0)
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        config = (
            "--psm 8 --oem 3 "
            "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        )
        text = pytesseract.image_to_string(Image.fromarray(th), config=config)
        return text.strip().upper().replace(" ", "").replace("\n", "")

    except ImportError:
        logger.warning("pytesseract / OpenCV not installed — OCR unavailable")
        return ""
    except Exception as exc:
        logger.error("OCR error: %s", exc)
        return ""


# ── ESP32-facing views (no JWT required) ─────────────────────────────────────

class ESPEventView(APIView):
    """
    POST /api/esp/events/
    Called by ESP32 devices to report sensor events and heartbeats.
    Authentication: none (devices authenticate via device_id on local network).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        ser = ESPEventPayloadSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        data       = ser.validated_data
        device_id  = data["device_id"]
        event_type = data["event_type"]
        payload    = data["payload"]
        fw_ver     = data.get("firmware_version", "")
        client_ip  = request.META.get("REMOTE_ADDR")

        # Register / update device
        device, created = Device.objects.get_or_create(
            device_id=device_id,
            defaults={"name": device_id, "device_type": "entrance_unit"},
        )
        device.mark_online(ip=client_ip)
        if fw_ver and device.firmware_version != fw_ver:
            device.firmware_version = fw_ver
            device.save(update_fields=["firmware_version"])

        # Record the raw event
        event = SensorEvent.objects.create(
            device=device, event_type=event_type, payload=payload
        )

        lot_id = str(device.lot_id) if device.lot_id else None

        # ── Event-specific processing ──────────────────────────────────────

        if event_type == "heartbeat":
            pass  # device.mark_online() already handled above

        elif event_type == "smoke_detected":
            if device.lot_id:
                from parking.models import Alert
                Alert.objects.create(
                    lot_id=device.lot_id,
                    alert_type="fire",
                    severity="critical",
                    message=(
                        f"Smoke detected by sensor '{device.name}'. "
                        f"MQ2 reading: {payload.get('mq2_value', 'N/A')}"
                    ),
                    sensor_data=payload,
                )
            _broadcast_lot(lot_id, "fire_alert", {
                "device_id":   device_id,
                "device_name": device.name,
                "mq2_value":   payload.get("mq2_value"),
                "lot_id":      lot_id,
            })

        elif event_type in ("slot_occupied", "slot_vacant"):
            sensor_id  = payload.get("sensor_id") or payload.get("slot_id", "")
            new_status = "occupied" if event_type == "slot_occupied" else "vacant"
            if sensor_id:
                from parking.models import ParkingSlot
                updated = ParkingSlot.objects.filter(sensor_id=sensor_id).update(
                    status=new_status, last_updated=timezone.now()
                )
                if updated and lot_id:
                    _broadcast_lot(lot_id, "slot_update", {
                        "sensor_id": sensor_id,
                        "status":    new_status,
                        "lot_id":    lot_id,
                    })

        elif event_type == "entrance_detected":
            # Queue LCD welcome message
            DeviceCommand.objects.create(
                device=device,
                command_type="lcd_update",
                payload={
                    "line1": "WELCOME TO IUIU",
                    "line2": "PLEASE WAIT FOR",
                    "line3": "VERIFICATION...",
                    "line4": "",
                },
            )
            # Queue welcome audio (track 1)
            DeviceCommand.objects.create(
                device=device,
                command_type="play_audio",
                payload={"track": 1, "volume": 25},
            )
            _broadcast_lot(lot_id, "entrance_detected", {
                "device_id":   device_id,
                "device_name": device.name,
                "lot_id":      lot_id,
                "distance_cm": payload.get("distance_cm"),
            })

        elif event_type == "exit_detected":
            DeviceCommand.objects.create(
                device=device,
                command_type="lcd_update",
                payload={
                    "line1": "WAIT FOR PAYMENT",
                    "line2": "PROCESSING...",
                    "line3": "",
                    "line4": "",
                },
            )
            _broadcast_lot(lot_id, "exit_detected", {
                "device_id":   device_id,
                "device_name": device.name,
                "lot_id":      lot_id,
                "distance_cm": payload.get("distance_cm"),
            })

        elif event_type == "plate_scanned":
            image_b64  = payload.get("image_b64", "")
            plate_text = _run_ocr(image_b64)
            _broadcast_lot(lot_id, "plate_scanned", {
                "device_id":  device_id,
                "plate_text": plate_text,
                "image_b64":  image_b64,
                "lot_id":     lot_id,
            })

        # Always push a device-status update to the devices WS group
        _broadcast_devices("device_status", {
            "device_id":    device_id,
            "device_name":  device.name,
            "device_type":  device.device_type,
            "online_status": True,
            "last_seen":    timezone.now().isoformat(),
            "event_type":   event_type,
            "lot_id":       lot_id,
        })

        event.processed = True
        event.save(update_fields=["processed"])

        return Response({"status": "ok", "event_id": event.id}, status=status.HTTP_200_OK)


class ESPCommandPollView(APIView):
    """
    GET /api/esp/commands/<device_id>/
    ESP32 polls this endpoint (every 500 ms) to receive pending commands.
    Commands are marked executed immediately so they are not re-delivered.
    """
    permission_classes = [AllowAny]

    def get(self, request, device_id: str):
        try:
            device = Device.objects.get(device_id=device_id)
        except Device.DoesNotExist:
            return Response({"commands": []})

        # Refresh last_seen on every poll
        device.mark_online(ip=request.META.get("REMOTE_ADDR"))

        # Fetch up to 5 pending commands
        pending = DeviceCommand.objects.filter(
            device=device, executed=False
        ).order_by("created_at")[:5]

        # Atomically mark as executed
        ids = [c.id for c in pending]
        if ids:
            DeviceCommand.objects.filter(id__in=ids).update(
                executed=True, acknowledged_at=timezone.now()
            )

        return Response({"commands": DeviceCommandSerializer(pending, many=True).data})


# ── Dashboard-facing views (JWT required) ────────────────────────────────────

class GateOpenView(APIView):
    """
    POST /api/gate/open/
    Queue an open-gate command for a specific ESP32 device.
    The ESP32 will pick it up on its next poll cycle.
    """
    permission_classes = [IsAttendant]

    def post(self, request):
        ser = GateOpenSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        d = ser.validated_data
        try:
            device = Device.objects.get(device_id=d["device_id"])
        except Device.DoesNotExist:
            return Response({"error": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

        cmd = DeviceCommand.objects.create(
            device=device,
            command_type="open_gate",
            payload={"gate_type": d["gate_type"], "duration_ms": d["duration_ms"]},
        )

        lot_id = str(device.lot_id) if device.lot_id else None
        _broadcast_lot(lot_id, "gate_opened", {
            "device_id":  device.device_id,
            "gate_type":  d["gate_type"],
            "opened_by":  request.user.username,
            "command_id": cmd.id,
        })
        _broadcast_devices("gate_opened", {
            "device_id":  device.device_id,
            "device_name": device.name,
            "gate_type":  d["gate_type"],
        })

        return Response({"status": "command_queued", "command_id": cmd.id})


class LCDUpdateView(APIView):
    """
    POST /api/lcd/update/
    Send up to 4 lines of text to an ESP32's I2C LCD.
    Used by exit attendant to show dynamic payment amounts.
    """
    permission_classes = [IsAttendant]

    def post(self, request):
        ser = LCDUpdateSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        d = ser.validated_data
        try:
            device = Device.objects.get(device_id=d["device_id"])
        except Device.DoesNotExist:
            return Response({"error": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

        cmd = DeviceCommand.objects.create(
            device=device,
            command_type="lcd_update",
            payload={
                "line1":       d["line1"],
                "line2":       d["line2"],
                "line3":       d["line3"],
                "line4":       d["line4"],
                "duration_ms": d["duration_ms"],
            },
        )
        return Response({"status": "command_queued", "command_id": cmd.id})


class AudioPlayView(APIView):
    """
    POST /api/audio/play/
    Trigger a DFPlayer Mini track on a specified device.
    """
    permission_classes = [IsAttendant]

    def post(self, request):
        ser = AudioPlaySerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        d = ser.validated_data
        try:
            device = Device.objects.get(device_id=d["device_id"])
        except Device.DoesNotExist:
            return Response({"error": "Device not found"}, status=status.HTTP_404_NOT_FOUND)

        cmd = DeviceCommand.objects.create(
            device=device,
            command_type="play_audio",
            payload={"track": d["track_number"], "volume": d["volume"]},
        )
        return Response({"status": "command_queued", "command_id": cmd.id})


class DeviceViewSet(viewsets.ModelViewSet):
    """
    CRUD for Device records.
    GET  /api/devices/        — list all devices with online/offline status
    POST /api/devices/        — register a new device
    PATCH /api/devices/<id>/  — update device details (assign to lot, rename, etc.)
    """
    serializer_class   = DeviceSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs        = Device.objects.select_related("lot").all()
        threshold = timezone.now() - timezone.timedelta(seconds=OFFLINE_THRESHOLD_SECS)
        # Auto-mark stale devices offline
        qs.filter(online_status=True, last_seen__lt=threshold).update(online_status=False)
        return qs


class SensorEventListView(APIView):
    """
    GET /api/devices/events/?device_id=xxx&event_type=heartbeat&limit=100
    Returns recent sensor events for auditing and debugging.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = SensorEvent.objects.select_related("device")
        if did := request.query_params.get("device_id"):
            qs = qs.filter(device__device_id=did)
        if et := request.query_params.get("event_type"):
            qs = qs.filter(event_type=et)
        limit = min(int(request.query_params.get("limit", 50)), 500)
        return Response(SensorEventSerializer(qs[:limit], many=True).data)
