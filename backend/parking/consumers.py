"""
IUIU Smart Parking — Django Channels WebSocket Consumers
Clients connect to:
  ws://host/ws/lot/<lot_id>/        → real-time slot status + alerts
  ws://host/ws/tickets/<lot_id>/   → live ticket queue updates
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class LotStatusConsumer(AsyncWebsocketConsumer):
    """
    Broadcasts slot status changes and alerts to all connected clients
    (Admin Dashboard, Entrance Panel, Attendant Console) for a given lot.
    """

    async def connect(self):
        self.lot_id    = self.scope['url_route']['kwargs']['lot_id']
        self.group_name = f"lot_{self.lot_id}"

        # Join the lot-specific channel group
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send current slot snapshot on connect
        snapshot = await self.get_slots_snapshot()
        await self.send(text_data=json.dumps({
            'type':    'slots_snapshot',
            'payload': snapshot,
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        """Clients may send ping messages to keep the connection alive."""
        data = json.loads(text_data)
        if data.get('type') == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ── Handlers dispatched by channel layer ──────────────────────────────

    async def slot_update(self, event):
        """Relay a slot status change to all connected clients."""
        await self.send(text_data=json.dumps({
            'type':    'slot_update',
            'payload': event['payload'],
        }))

    async def alert_broadcast(self, event):
        """Relay a critical alert (fire, lot_full) to all clients."""
        await self.send(text_data=json.dumps({
            'type':    'alert',
            'payload': event['payload'],
        }))

    async def ticket_created(self, event):
        """Notify attendant dashboards that a new ticket was issued."""
        await self.send(text_data=json.dumps({
            'type':    'ticket_created',
            'payload': event['payload'],
        }))

    async def ticket_closed(self, event):
        """Notify when a ticket has been checked out / paid."""
        await self.send(text_data=json.dumps({
            'type':    'ticket_closed',
            'payload': event['payload'],
        }))

    # ── ESP32 hardware event handlers ─────────────────────────────────────

    async def entrance_detected(self, event):
        """ESP32 entrance sensor detected a vehicle — trigger validation flow."""
        await self.send(text_data=json.dumps({
            'type':    'entrance_detected',
            'payload': event['payload'],
        }))

    async def exit_detected(self, event):
        """ESP32 exit sensor detected a vehicle — trigger payment flow."""
        await self.send(text_data=json.dumps({
            'type':    'exit_detected',
            'payload': event['payload'],
        }))

    async def gate_opened(self, event):
        """A gate was commanded open (entrance or exit)."""
        await self.send(text_data=json.dumps({
            'type':    'gate_opened',
            'payload': event['payload'],
        }))

    async def plate_scanned(self, event):
        """ESP32-CAM captured a plate image; payload includes OCR result."""
        await self.send(text_data=json.dumps({
            'type':    'plate_scanned',
            'payload': event['payload'],
        }))

    async def fire_alert(self, event):
        """MQ2 smoke sensor triggered a fire alert."""
        await self.send(text_data=json.dumps({
            'type':    'fire_alert',
            'payload': event['payload'],
        }))

    # ── DB helpers ────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_slots_snapshot(self):
        from .models import ParkingSlot
        from .serializers import ParkingSlotStatusSerializer
        slots = ParkingSlot.objects.filter(lot_id=self.lot_id).select_related('slot_type')
        return ParkingSlotStatusSerializer(slots, many=True).data


class TicketQueueConsumer(AsyncWebsocketConsumer):
    """
    Live ticket queue channel used by the Attendant Console to receive
    new entry requests without polling.
    """

    async def connect(self):
        self.lot_id     = self.scope['url_route']['kwargs']['lot_id']
        self.group_name = f"tickets_{self.lot_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        pass  # Ticket queue is read-only push from the server

    async def new_ticket(self, event):
        await self.send(text_data=json.dumps({
            'type':    'new_ticket',
            'payload': event['payload'],
        }))
