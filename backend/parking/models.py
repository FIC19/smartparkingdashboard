"""
IUIU Smart Parking — Database Models
Covers: Lots, Slots, Entrances, Exits, Tickets, Transactions,
        Pricing, Audio Config, Alerts, AuditLog, and RBAC Users.
"""
import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.core.validators import MinValueValidator


# ─────────────────────────────────────────────────────────────────────────────
# USER / AUTH
# ─────────────────────────────────────────────────────────────────────────────

class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin',               'Admin'),
        ('attendant',           'Attendant (Parking Floor)'),
        ('entrance_attendant',  'Entrance Attendant'),
        ('exit_attendant',      'Exit Attendant'),
        ('entrance_display',    'Entrance Display Screen'),
        ('exit_display',        'Exit Display Screen'),
    ]
    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role     = models.CharField(max_length=20, choices=ROLE_CHOICES, default='attendant')
    phone    = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'auth_user'
        verbose_name = 'User'

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"


# ─────────────────────────────────────────────────────────────────────────────
# PARKING LOT
# ─────────────────────────────────────────────────────────────────────────────

class ParkingLot(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name          = models.CharField(max_length=200)
    location      = models.CharField(max_length=500)
    is_active     = models.BooleanField(default=True)
    firebase_node    = models.CharField(max_length=200, blank=True,
                                        help_text="Legacy Firebase node path (unused for ESP32)")
    lost_receipt_fee = models.DecimalField(
        max_digits=10, decimal_places=0, default=5000,
        help_text="Extra fee charged when a client cannot present their original receipt (UGX)"
    )
    no_plate_fee     = models.DecimalField(
        max_digits=10, decimal_places=0, default=10000,
        help_text="Flat fee for a vehicle with no ticket and no identifiable plate number (UGX)"
    )
    lost_ticket_fee  = models.DecimalField(
        max_digits=10, decimal_places=0, default=15000,
        help_text="Flat fee charged when a client's ticket is completely lost (UGX)"
    )
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def total_capacity(self):
        return self.slots.count()

    @property
    def available_slots(self):
        return self.slots.filter(status='vacant').count()

    @property
    def occupied_slots(self):
        return self.slots.filter(status='occupied').count()

    @property
    def is_full(self):
        return self.available_slots == 0


# ─────────────────────────────────────────────────────────────────────────────
# ENTRANCE / EXIT GATES
# ─────────────────────────────────────────────────────────────────────────────

class Entrance(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot            = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='entrances')
    name           = models.CharField(max_length=100)
    sensor_id      = models.CharField(max_length=100, unique=True,
                                      help_text="ESP32 device_id for this entrance unit")
    camera_ip      = models.CharField(max_length=50, blank=True,
                                      help_text="IP of the camera on this lane")
    servo_channel  = models.IntegerField(default=0)
    is_active      = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.lot.name} → {self.name}"


class Exit(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot           = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='exits')
    name          = models.CharField(max_length=100)
    sensor_id     = models.CharField(max_length=100, unique=True)
    servo_channel = models.IntegerField(default=1)
    is_active     = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.lot.name} ← {self.name}"


# ─────────────────────────────────────────────────────────────────────────────
# SLOT TYPE & PRICING
# ─────────────────────────────────────────────────────────────────────────────

class SlotType(models.Model):
    VEHICLE_CLASS = [
        ('car',   'Normal Car'),
        ('truck', 'Large Truck / Van / Bus'),
        ('cycle', 'Motorcycle / Bicycle'),
    ]
    name          = models.CharField(max_length=100)
    vehicle_class = models.CharField(max_length=20, choices=VEHICLE_CLASS, unique=True)
    hourly_rate   = models.DecimalField(
        max_digits=10, decimal_places=0,
        validators=[MinValueValidator(0)],
        help_text="Rate in UGX per hour"
    )
    flat_rate     = models.DecimalField(
        max_digits=10, decimal_places=0, default=0,
        help_text="Optional flat rate (overrides hourly if > 0)"
    )
    daily_max_rate = models.DecimalField(
        max_digits=10, decimal_places=0, null=True, blank=True,
        help_text="Optional daily cap in UGX"
    )
    grace_period_minutes = models.IntegerField(
        default=10,
        help_text="Free grace window before billing starts"
    )
    color_hex = models.CharField(max_length=7, default='#16a34a',
                                  help_text="UI badge colour for this slot type")
    description  = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} — UGX {self.hourly_rate:,}/hr"


# ─────────────────────────────────────────────────────────────────────────────
# PARKING SLOT
# ─────────────────────────────────────────────────────────────────────────────

class ParkingSlot(models.Model):
    STATUS = [
        ('vacant',      'Vacant'),
        ('occupied',    'Occupied'),
        ('reserved',    'Reserved'),
        ('maintenance', 'Under Maintenance'),
    ]
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot         = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='slots')
    slot_type   = models.ForeignKey(SlotType, on_delete=models.SET_NULL, null=True, blank=True, related_name='slots')
    slot_number = models.CharField(max_length=20)
    status      = models.CharField(max_length=20, choices=STATUS, default='vacant', db_index=True)
    sensor_id   = models.CharField(max_length=100, blank=True,
                                   help_text="ESP32 sensor_id for this slot's ultrasonic sensor")
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('lot', 'slot_number')
        ordering        = ['slot_number']

    def __str__(self):
        return f"Slot {self.slot_number} [{self.status}] — {self.lot.name}"


# ─────────────────────────────────────────────────────────────────────────────
# TICKET
# ─────────────────────────────────────────────────────────────────────────────

class Ticket(models.Model):
    VEHICLE_TYPES = [
        ('car',        'Car'),
        ('motorcycle', 'Motorcycle'),
        ('bicycle',    'Bicycle'),
        ('van',        'Van'),
        ('truck',      'Truck'),
        ('bus',        'Bus'),
    ]
    PAYMENT_METHODS = [
        ('cash',         'Cash'),
        ('mobile_money', 'Mobile Money (MoMo)'),
        ('exempt',       'Exempt / Free Pass'),
    ]
    STATUS = [
        ('active', 'Active — Vehicle Inside'),
        ('paid',   'Paid & Exited'),
        ('exempt', 'Service Exempt'),
        ('void',   'Voided'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_number    = models.CharField(max_length=20, unique=True, db_index=True)
    lot              = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='tickets')
    entrance         = models.ForeignKey(Entrance, on_delete=models.SET_NULL, null=True, blank=True)
    exit_gate        = models.ForeignKey(Exit, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='exit_tickets')
    assigned_slot    = models.ForeignKey(ParkingSlot, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='tickets')
    vehicle_type     = models.CharField(max_length=20, choices=VEHICLE_TYPES)
    license_plate    = models.CharField(max_length=20, blank=True)
    entry_time       = models.DateTimeField(default=timezone.now, db_index=True)
    exit_time        = models.DateTimeField(null=True, blank=True)
    payment_method   = models.CharField(max_length=20, choices=PAYMENT_METHODS, blank=True)
    amount_charged   = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    is_service_exempt = models.BooleanField(default=False)
    exempt_reason    = models.CharField(max_length=200, blank=True,
                                        help_text="e.g. KCCA, Staff, Campus Carrier")
    status           = models.CharField(max_length=20, choices=STATUS, default='active', db_index=True)
    attendant        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='processed_tickets')
    barcode_data     = models.TextField(blank=True, help_text="Base64 PNG of QR code")
    ai_classification_raw = models.JSONField(default=dict, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-entry_time']

    def __str__(self):
        return f"#{self.ticket_number} {self.vehicle_type} — {self.status}"

    @property
    def duration_hours(self):
        end = self.exit_time or timezone.now()
        return max(0, (end - self.entry_time).total_seconds() / 3600)

    def calculate_fee(self):
        """Return computed fee in UGX. Respects flat rate, grace period and daily cap."""
        if self.is_service_exempt:
            return 0
        if not self.assigned_slot or not self.assigned_slot.slot_type:
            return 0
        st = self.assigned_slot.slot_type
        # Flat rate overrides hourly
        if st.flat_rate and float(st.flat_rate) > 0:
            return round(float(st.flat_rate))
        grace_fraction = st.grace_period_minutes / 60
        billable_hours = max(0, self.duration_hours - grace_fraction)
        if billable_hours == 0:
            return 0
        fee = float(st.hourly_rate) * max(1, billable_hours)
        if st.daily_max_rate:
            fee = min(fee, float(st.daily_max_rate))
        return round(fee)


# ─────────────────────────────────────────────────────────────────────────────
# TRANSACTION
# ─────────────────────────────────────────────────────────────────────────────

class Transaction(models.Model):
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket           = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name='transaction')
    amount           = models.DecimalField(max_digits=10, decimal_places=0)
    payment_method   = models.CharField(max_length=20)
    mobile_money_ref = models.CharField(max_length=100, blank=True)
    processed_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                          related_name='transactions')
    processed_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Txn {self.id} — UGX {self.amount:,}"


# ─────────────────────────────────────────────────────────────────────────────
# AUDIO CONFIG
# ─────────────────────────────────────────────────────────────────────────────

class AudioConfig(models.Model):
    TRIGGER_EVENTS = [
        ('system_start',     'System Start'),
        ('vehicle_scan',     'Vehicle Scanning'),
        ('access_granted',   'Access Granted'),
        ('access_denied',    'Access Denied'),
        ('vehicle_exit',     'Vehicle Exit'),
        ('fire_alarm',       'Fire / Smoke Alarm'),
        ('lot_full',         'Parking Lot Full'),
        ('welcome',          'Welcome Message'),
        ('slot_assignment',  'Slot Assignment'),
        ('payment_prompt',   'Payment Prompt'),
        ('payment_confirmed','Payment Confirmed'),
        ('goodbye',          'Goodbye'),
    ]
    lot            = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='audio_configs')
    trigger_event  = models.CharField(max_length=30, choices=TRIGGER_EVENTS)
    track_number   = models.IntegerField(help_text="DFPlayer Mini track index (1-based)")
    track_filename = models.CharField(max_length=100, help_text="e.g. 0001.mp3")
    volume         = models.IntegerField(default=25, help_text="0–30")
    is_enabled     = models.BooleanField(default=True)
    description    = models.TextField(blank=True)

    class Meta:
        unique_together = ('lot', 'trigger_event')
        ordering        = ['trigger_event']

    def __str__(self):
        return f"{self.lot.name} | {self.trigger_event} → Track {self.track_number}"


# ─────────────────────────────────────────────────────────────────────────────
# ALERT
# ─────────────────────────────────────────────────────────────────────────────

class Alert(models.Model):
    TYPES = [
        ('fire',         'Fire / Smoke'),
        ('lot_full',     'Parking Full'),
        ('section_full', 'Section Full'),
        ('sensor_error', 'Sensor Error'),
        ('gate_error',   'Gate Error'),
    ]
    SEVERITY = [
        ('low',      'Low'),
        ('medium',   'Medium'),
        ('high',     'High'),
        ('critical', 'Critical'),
    ]
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot          = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='alerts')
    alert_type   = models.CharField(max_length=20, choices=TYPES, db_index=True)
    severity     = models.CharField(max_length=20, choices=SEVERITY)
    message      = models.TextField()
    sensor_data  = models.JSONField(default=dict, blank=True)
    is_resolved  = models.BooleanField(default=False, db_index=True)
    resolved_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    resolved_at  = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.severity.upper()}] {self.alert_type} — {self.lot.name}"


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(models.Model):
    ACTION_TYPES = [
        ('login',           'User Login'),
        ('logout',          'User Logout'),
        ('ticket_create',   'Ticket Created'),
        ('ticket_checkout', 'Ticket Checkout'),
        ('ticket_void',     'Ticket Voided'),
        ('gate_open',       'Gate Opened'),
        ('gate_override',   'Gate Override'),
        ('slot_status',     'Slot Status Changed'),
        ('user_create',     'User Created'),
        ('user_update',     'User Updated'),
        ('user_delete',     'User Deleted'),
        ('pricing_change',  'Pricing Changed'),
        ('audio_change',    'Audio Config Changed'),
        ('free_pass',       'Free Pass Issued'),
        ('alert_resolve',   'Alert Resolved'),
    ]
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='audit_logs')
    action      = models.CharField(max_length=30, choices=ACTION_TYPES, db_index=True)
    target_type = models.CharField(max_length=50, blank=True,
                                   help_text="Model name e.g. Ticket, User, ParkingSlot")
    target_id   = models.CharField(max_length=100, blank=True)
    detail      = models.TextField(blank=True, help_text="Human-readable summary of what changed")
    metadata    = models.JSONField(default=dict, blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Audit Log'

    def __str__(self):
        user_str = self.user.username if self.user else 'system'
        return f"[{self.action}] {user_str} @ {self.timestamp:%Y-%m-%d %H:%M}"


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANT LOT ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

class AttendantAssignment(models.Model):
    attendant   = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assignments')
    lot         = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='attendant_assignments')
    entrance    = models.ForeignKey(Entrance, on_delete=models.SET_NULL, null=True, blank=True)
    exit_gate   = models.ForeignKey(Exit, on_delete=models.SET_NULL, null=True, blank=True)
    shift_start = models.DateTimeField(default=timezone.now)
    shift_end   = models.DateTimeField(null=True, blank=True)
    is_active   = models.BooleanField(default=True)

    class Meta:
        unique_together = ('attendant', 'lot')

    def __str__(self):
        return f"{self.attendant.get_full_name()} @ {self.lot.name}"
