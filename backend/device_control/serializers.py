"""
IUIU Smart Parking — Device Control Serializers
"""
from rest_framework import serializers
from .models import Device, DeviceCommand, SensorEvent


class DeviceSerializer(serializers.ModelSerializer):
    seconds_since_seen = serializers.SerializerMethodField()
    lot_name           = serializers.SerializerMethodField()

    class Meta:
        model  = Device
        fields = '__all__'

    def get_seconds_since_seen(self, obj):
        return obj.seconds_since_seen

    def get_lot_name(self, obj):
        return obj.lot.name if obj.lot else None


class DeviceCommandSerializer(serializers.ModelSerializer):
    class Meta:
        model        = DeviceCommand
        fields       = '__all__'
        read_only_fields = ['executed', 'acknowledged_at', 'created_at']


class SensorEventSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source='device.name', read_only=True)

    class Meta:
        model  = SensorEvent
        fields = '__all__'


# ── Request body serializers (not model-bound) ────────────────────────────────

class ESPEventPayloadSerializer(serializers.Serializer):
    """Body of POST /api/esp/events/ from an ESP32 device."""
    device_id        = serializers.CharField(max_length=64)
    event_type       = serializers.ChoiceField(choices=[e[0] for e in SensorEvent.EVENT_TYPES])
    payload          = serializers.DictField(child=serializers.JSONField(), default=dict)
    firmware_version = serializers.CharField(max_length=32, required=False, default='')


class GateOpenSerializer(serializers.Serializer):
    device_id   = serializers.CharField(max_length=64)
    gate_type   = serializers.ChoiceField(choices=['entrance', 'exit'])
    duration_ms = serializers.IntegerField(default=5000, min_value=500, max_value=30_000)


class LCDUpdateSerializer(serializers.Serializer):
    device_id   = serializers.CharField(max_length=64)
    line1       = serializers.CharField(max_length=20)
    line2       = serializers.CharField(max_length=20, required=False, default='')
    line3       = serializers.CharField(max_length=20, required=False, default='')
    line4       = serializers.CharField(max_length=20, required=False, default='')
    duration_ms = serializers.IntegerField(default=0, min_value=0)  # 0 = permanent


class AudioPlaySerializer(serializers.Serializer):
    device_id    = serializers.CharField(max_length=64)
    track_number = serializers.IntegerField(min_value=1, max_value=99)
    volume       = serializers.IntegerField(min_value=0, max_value=30, default=20)
