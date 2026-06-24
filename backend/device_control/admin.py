from django.contrib import admin
from .models import Device, DeviceCommand, SensorEvent


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display  = ['device_id', 'name', 'device_type', 'lot', 'online_status', 'last_seen', 'ip_address']
    list_filter   = ['device_type', 'online_status']
    search_fields = ['device_id', 'name']
    readonly_fields = ['last_seen', 'online_status', 'ip_address', 'created_at', 'updated_at']


@admin.register(DeviceCommand)
class DeviceCommandAdmin(admin.ModelAdmin):
    list_display  = ['device', 'command_type', 'executed', 'created_at', 'acknowledged_at']
    list_filter   = ['command_type', 'executed']
    readonly_fields = ['created_at', 'acknowledged_at']


@admin.register(SensorEvent)
class SensorEventAdmin(admin.ModelAdmin):
    list_display  = ['device', 'event_type', 'timestamp', 'processed']
    list_filter   = ['event_type', 'processed']
    readonly_fields = ['timestamp']
