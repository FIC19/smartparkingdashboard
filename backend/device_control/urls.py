"""
IUIU Smart Parking — Device Control URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ESPEventView,
    ESPCommandPollView,
    GateOpenView,
    LCDUpdateView,
    AudioPlayView,
    DeviceViewSet,
    SensorEventListView,
)

router = DefaultRouter()
router.register(r'devices', DeviceViewSet, basename='device')

urlpatterns = [
    # ESP32 → Django  (no JWT, local-network only)
    path('esp/events/',                 ESPEventView.as_view(),      name='esp_events'),
    path('esp/commands/<str:device_id>/', ESPCommandPollView.as_view(), name='esp_commands'),

    # Dashboard → Django → ESP32
    path('gate/open/',    GateOpenView.as_view(),   name='gate_open'),
    path('lcd/update/',   LCDUpdateView.as_view(),  name='lcd_update'),
    path('audio/play/',   AudioPlayView.as_view(),  name='audio_play'),

    # Device management & event log
    path('devices/events/', SensorEventListView.as_view(), name='device_events'),
    path('', include(router.urls)),
]
