"""
ASGI config — Daphne serves both HTTP and WebSocket traffic.

WebSocket routes:
  ws://host/ws/lot/<lot_id>/      → real-time slot/ticket/alert updates per lot
  ws://host/ws/tickets/<lot_id>/ → live ticket queue for attendants
  ws://host/ws/devices/          → ESP32 device status & hardware events
"""
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import re_path
from parking.consumers import LotStatusConsumer, TicketQueueConsumer
from device_control.consumers import DeviceEventConsumer

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'iuiu_parking.settings')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter([
            re_path(r'^ws/lot/(?P<lot_id>[^/]+)/$',     LotStatusConsumer.as_asgi()),
            re_path(r'^ws/tickets/(?P<lot_id>[^/]+)/$', TicketQueueConsumer.as_asgi()),
            re_path(r'^ws/devices/$',                   DeviceEventConsumer.as_asgi()),
        ])
    ),
})
