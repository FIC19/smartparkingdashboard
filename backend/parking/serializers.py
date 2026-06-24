"""
IUIU Smart Parking — DRF Serializers
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    ParkingLot, Entrance, Exit, SlotType, ParkingSlot,
    Ticket, Transaction, AudioConfig, Alert, AttendantAssignment, AuditLog,
)

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# USER
# ─────────────────────────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name',
                  'email', 'role', 'phone', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model  = User
        fields = ['username', 'first_name', 'last_name', 'email',
                  'role', 'phone', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user     = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


# ─────────────────────────────────────────────────────────────────────────────
# PARKING LOT
# ─────────────────────────────────────────────────────────────────────────────

class ParkingLotSerializer(serializers.ModelSerializer):
    total_capacity  = serializers.ReadOnlyField()
    available_slots = serializers.ReadOnlyField()
    occupied_slots  = serializers.ReadOnlyField()
    is_full         = serializers.ReadOnlyField()

    class Meta:
        model  = ParkingLot
        fields = ['id', 'name', 'location', 'is_active', 'firebase_node',
                  'lost_receipt_fee', 'no_plate_fee', 'lost_ticket_fee',
                  'total_capacity', 'available_slots', 'occupied_slots', 'is_full',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# ─────────────────────────────────────────────────────────────────────────────
# ENTRANCE / EXIT
# ─────────────────────────────────────────────────────────────────────────────

class EntranceSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Entrance
        fields = ['id', 'lot', 'name', 'sensor_id', 'camera_ip',
                  'servo_channel', 'is_active']
        read_only_fields = ['id']


class ExitSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Exit
        fields = ['id', 'lot', 'name', 'sensor_id', 'servo_channel', 'is_active']
        read_only_fields = ['id']


# ─────────────────────────────────────────────────────────────────────────────
# SLOT TYPE & SLOT
# ─────────────────────────────────────────────────────────────────────────────

class SlotTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SlotType
        fields = ['id', 'name', 'vehicle_class', 'hourly_rate', 'flat_rate',
                  'daily_max_rate', 'grace_period_minutes', 'color_hex', 'description']


class ParkingSlotSerializer(serializers.ModelSerializer):
    slot_type_detail = SlotTypeSerializer(source='slot_type', read_only=True)

    class Meta:
        model  = ParkingSlot
        fields = ['id', 'lot', 'slot_type', 'slot_type_detail', 'slot_number',
                  'status', 'sensor_id', 'last_updated']
        read_only_fields = ['id', 'last_updated']


class ParkingSlotStatusSerializer(serializers.ModelSerializer):
    """Lightweight serializer for real-time slot status updates."""
    vehicle_type = serializers.SerializerMethodField()
    license_plate = serializers.SerializerMethodField()
    entry_time = serializers.SerializerMethodField()

    class Meta:
        model  = ParkingSlot
        fields = ['id', 'slot_number', 'status', 'last_updated',
                  'vehicle_type', 'license_plate', 'entry_time']

    def get_vehicle_type(self, obj):
        ticket = obj.tickets.filter(status='active').first()
        return ticket.vehicle_type if ticket else None

    def get_license_plate(self, obj):
        ticket = obj.tickets.filter(status='active').first()
        return ticket.license_plate if ticket else None

    def get_entry_time(self, obj):
        ticket = obj.tickets.filter(status='active').first()
        return ticket.entry_time.isoformat() if ticket else None


# ─────────────────────────────────────────────────────────────────────────────
# TICKET
# ─────────────────────────────────────────────────────────────────────────────

class TicketSerializer(serializers.ModelSerializer):
    duration_hours   = serializers.ReadOnlyField()
    calculated_fee   = serializers.SerializerMethodField()
    attendant_name   = serializers.SerializerMethodField()
    slot_number      = serializers.SerializerMethodField()

    class Meta:
        model  = Ticket
        fields = [
            'id', 'ticket_number', 'lot', 'entrance', 'exit_gate',
            'assigned_slot', 'slot_number',
            'vehicle_type', 'license_plate',
            'entry_time', 'exit_time',
            'payment_method', 'amount_charged',
            'is_service_exempt', 'exempt_reason',
            'status', 'attendant', 'attendant_name',
            'barcode_data', 'ai_classification_raw',
            'duration_hours', 'calculated_fee',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'ticket_number', 'barcode_data',
                            'created_at', 'updated_at']

    def get_calculated_fee(self, obj):
        return obj.calculate_fee()

    def get_attendant_name(self, obj):
        return obj.attendant.get_full_name() if obj.attendant else None

    def get_slot_number(self, obj):
        return obj.assigned_slot.slot_number if obj.assigned_slot else None


class TicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Ticket
        fields = ['lot', 'entrance', 'vehicle_type', 'license_plate',
                  'is_service_exempt', 'exempt_reason', 'attendant',
                  'ai_classification_raw']


class TicketCheckoutSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Ticket
        fields = ['exit_gate', 'payment_method', 'amount_charged', 'attendant']

    def update(self, instance, validated_data):
        from django.utils import timezone
        instance.exit_time = timezone.now()
        instance.status    = 'exempt' if instance.is_service_exempt else 'paid'
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# TRANSACTION
# ─────────────────────────────────────────────────────────────────────────────

class TransactionSerializer(serializers.ModelSerializer):
    ticket_number    = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = Transaction
        fields = ['id', 'ticket', 'ticket_number', 'amount', 'payment_method',
                  'mobile_money_ref', 'processed_by', 'processed_by_name', 'processed_at']
        read_only_fields = ['id', 'processed_at']

    def get_ticket_number(self, obj):
        return obj.ticket.ticket_number if obj.ticket else None

    def get_processed_by_name(self, obj):
        return obj.processed_by.get_full_name() if obj.processed_by else None


# ─────────────────────────────────────────────────────────────────────────────
# AUDIO CONFIG
# ─────────────────────────────────────────────────────────────────────────────

class AudioConfigSerializer(serializers.ModelSerializer):
    trigger_label = serializers.SerializerMethodField()

    class Meta:
        model  = AudioConfig
        fields = ['id', 'lot', 'trigger_event', 'trigger_label', 'track_number',
                  'track_filename', 'volume', 'is_enabled', 'description']

    def get_trigger_label(self, obj):
        return dict(AudioConfig.TRIGGER_EVENTS).get(obj.trigger_event, obj.trigger_event)


# ─────────────────────────────────────────────────────────────────────────────
# ALERT
# ─────────────────────────────────────────────────────────────────────────────

class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Alert
        fields = ['id', 'lot', 'alert_type', 'severity', 'message',
                  'sensor_data', 'is_resolved', 'resolved_by',
                  'resolved_at', 'created_at']
        read_only_fields = ['id', 'created_at']


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogSerializer(serializers.ModelSerializer):
    username    = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()

    class Meta:
        model  = AuditLog
        fields = ['id', 'user', 'username', 'action', 'action_label',
                  'target_type', 'target_id', 'detail',
                  'metadata', 'ip_address', 'timestamp']
        read_only_fields = ['id', 'timestamp']

    def get_username(self, obj):
        return obj.user.username if obj.user else 'system'

    def get_action_label(self, obj):
        return dict(AuditLog.ACTION_TYPES).get(obj.action, obj.action)


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANT ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

class AttendantAssignmentSerializer(serializers.ModelSerializer):
    attendant_name = serializers.SerializerMethodField()
    lot_name       = serializers.SerializerMethodField()

    class Meta:
        model  = AttendantAssignment
        fields = ['id', 'attendant', 'attendant_name', 'lot', 'lot_name',
                  'entrance', 'exit_gate', 'shift_start', 'shift_end', 'is_active']

    def get_attendant_name(self, obj):
        return obj.attendant.get_full_name()

    def get_lot_name(self, obj):
        return obj.lot.name


# ─────────────────────────────────────────────────────────────────────────────
# GATE COMMAND
# ─────────────────────────────────────────────────────────────────────────────

class GateCommandSerializer(serializers.Serializer):
    gate_type    = serializers.ChoiceField(choices=['entrance', 'exit'])
    gate_id      = serializers.UUIDField()
    command      = serializers.ChoiceField(choices=['open', 'close'])
    triggered_by = serializers.UUIDField(required=False)


# ─────────────────────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────

class LotAnalyticsSerializer(serializers.Serializer):
    lot_id          = serializers.UUIDField()
    lot_name        = serializers.CharField()
    total_capacity  = serializers.IntegerField()
    occupied        = serializers.IntegerField()
    vacant          = serializers.IntegerField()
    occupancy_rate  = serializers.FloatField()
    active_tickets  = serializers.IntegerField()
    tickets_today   = serializers.IntegerField()
    revenue_today   = serializers.FloatField()
    revenue_week    = serializers.FloatField()
    revenue_month   = serializers.FloatField()
    by_vehicle_type = serializers.DictField()
    by_slot_type    = serializers.DictField()
    peak_hours      = serializers.ListField(child=serializers.IntegerField())
    daily_revenue   = serializers.ListField()
