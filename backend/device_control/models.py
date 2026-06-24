"""
IUIU Smart Parking — ESP32 Device Control Models
Tracks hardware devices, commands queued for them, and sensor events they report.
"""
from django.db import models
from django.utils import timezone


class Device(models.Model):
    DEVICE_TYPES = [
        ('entrance_unit', 'Entrance Unit'),
        ('exit_unit',     'Exit Unit'),
        ('slot_sensor',   'Slot Sensor Unit'),
        ('smoke_sensor',  'Smoke / Fire Sensor'),
    ]

    device_id        = models.CharField(max_length=64, unique=True, db_index=True)
    name             = models.CharField(max_length=100)
    device_type      = models.CharField(max_length=32, choices=DEVICE_TYPES)
    lot              = models.ForeignKey(
        'parking.ParkingLot',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='devices',
    )
    online_status    = models.BooleanField(default=False)
    last_seen        = models.DateTimeField(null=True, blank=True)
    ip_address       = models.GenericIPAddressField(null=True, blank=True)
    firmware_version = models.CharField(max_length=32, blank=True, default='')
    notes            = models.TextField(blank=True, default='')
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['device_type', 'name']

    def __str__(self):
        status = 'ONLINE' if self.online_status else 'OFFLINE'
        return f"{self.name} [{self.device_id}] — {status}"

    def mark_online(self, ip: str | None = None) -> None:
        fields = ['online_status', 'last_seen']
        self.online_status = True
        self.last_seen     = timezone.now()
        if ip:
            self.ip_address = ip
            fields.append('ip_address')
        self.save(update_fields=fields)

    def mark_offline(self) -> None:
        self.online_status = False
        self.save(update_fields=['online_status'])

    @property
    def seconds_since_seen(self) -> int | None:
        if not self.last_seen:
            return None
        return int((timezone.now() - self.last_seen).total_seconds())


class DeviceCommand(models.Model):
    """
    Commands queued by the dashboard for an ESP32 device.
    The ESP32 polls GET /api/esp/commands/<device_id>/ to fetch and execute them.
    """
    COMMAND_TYPES = [
        ('open_gate',  'Open Gate'),
        ('close_gate', 'Close Gate'),
        ('lcd_update', 'LCD Update'),
        ('play_audio', 'Play Audio'),
        ('reboot',     'Reboot Device'),
        ('set_servo',  'Set Servo Angle'),
    ]

    device          = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='commands')
    command_type    = models.CharField(max_length=32, choices=COMMAND_TYPES)
    payload         = models.JSONField(default=dict)
    executed        = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.command_type} → {self.device.name} ({'done' if self.executed else 'pending'})"


class SensorEvent(models.Model):
    """
    Every event posted by an ESP32 device is logged here.
    Allows audit trail and debugging.
    """
    EVENT_TYPES = [
        ('heartbeat',         'Heartbeat'),
        ('entrance_detected', 'Vehicle at Entrance'),
        ('exit_detected',     'Vehicle at Exit'),
        ('slot_occupied',     'Slot Occupied'),
        ('slot_vacant',       'Slot Vacant'),
        ('smoke_detected',    'Smoke / Fire Detected'),
        ('plate_scanned',     'Plate Image Captured'),
        ('gate_opened',       'Gate Opened'),
        ('gate_closed',       'Gate Closed'),
    ]

    device     = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=32, choices=EVENT_TYPES)
    payload    = models.JSONField(default=dict)
    timestamp  = models.DateTimeField(auto_now_add=True)
    processed  = models.BooleanField(default=False)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.event_type} @ {self.device.name} [{self.timestamp:%Y-%m-%d %H:%M:%S}]"
