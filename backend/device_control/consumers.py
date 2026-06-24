"""
IUIU Smart Parking — Device Event WebSocket Consumer
Clients connect to ws://host/ws/devices/ to receive real-time hardware events:
  device_status, gate_opened, fire_alert from all devices.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class DeviceEventConsumer(AsyncWebsocketConsumer):
    GROUP_NAME = "devices"

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        if data.get("type") == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))

    # ── Channel layer handlers ────────────────────────────────────────────

    async def device_event(self, event):
        """Forward any device broadcast to all connected dashboard clients."""
        await self.send(text_data=json.dumps({
            "type":    event["event_type"],
            "payload": event["payload"],
        }))
