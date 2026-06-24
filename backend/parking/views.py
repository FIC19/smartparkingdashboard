"""
IUIU Smart Parking — API Views
All endpoints are DRF ViewSets registered via a DefaultRouter.
Custom actions handle gate commands, checkout, analytics, and alerts.
"""
from django.utils import timezone
from django.db.models import Sum, Count
from django.contrib.auth import get_user_model

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    ParkingLot, Entrance, Exit, SlotType, ParkingSlot,
    Ticket, Transaction, AudioConfig, Alert, AttendantAssignment, AuditLog,
)
from .serializers import (
    UserSerializer, UserCreateSerializer,
    ParkingLotSerializer, EntranceSerializer, ExitSerializer,
    SlotTypeSerializer, ParkingSlotSerializer, ParkingSlotStatusSerializer,
    TicketSerializer, TicketCreateSerializer, TicketCheckoutSerializer,
    TransactionSerializer, AudioConfigSerializer,
    AlertSerializer, AttendantAssignmentSerializer,
    GateCommandSerializer, AuditLogSerializer,
)
from .permissions import IsAdmin, IsAttendant, IsAdminOrReadOnly, IsAnyDisplay
from .utils import (
    generate_ticket_number, generate_qr_base64,
    firebase_command_gate, firebase_trigger_audio,
    firebase_broadcast_alert, get_lot_analytics, assign_best_slot,
    log_action, ws_broadcast_lot, esp32_open_gate, esp32_lcd_update,
)

User = get_user_model()


def get_client_ip(request):
    x_forward = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forward:
        return x_forward.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


# ─────────────────────────────────────────────────────────────────────────────
# AUTH — Custom JWT claims
# ─────────────────────────────────────────────────────────────────────────────

class CustomTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token         = super().get_token(user)
        # Django superusers always get admin role regardless of role field
        token['role'] = 'admin' if user.is_superuser else user.role
        token['name'] = user.get_full_name() or user.username
        token['uid']  = str(user.id)
        return token


class CustomTokenView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                user = User.objects.get(username=request.data.get('username'))
                log_action(user, 'login', 'User', str(user.id),
                           f"Login from {get_client_ip(request)}",
                           ip_address=get_client_ip(request))
            except Exception:
                pass
        return response


# ─────────────────────────────────────────────────────────────────────────────
# USERS
# ─────────────────────────────────────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    queryset           = User.objects.all().order_by('first_name')
    permission_classes = [IsAdmin]
    filter_backends    = [filters.SearchFilter, DjangoFilterBackend]
    search_fields      = ['username', 'first_name', 'last_name', 'email']
    filterset_fields   = ['role', 'is_active']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    def perform_create(self, serializer):
        user = serializer.save()
        log_action(self.request.user, 'user_create', 'User', str(user.id),
                   f"Created user {user.username} with role {user.role}",
                   ip_address=get_client_ip(self.request))

    def perform_update(self, serializer):
        user = serializer.save()
        log_action(self.request.user, 'user_update', 'User', str(user.id),
                   f"Updated user {user.username}",
                   ip_address=get_client_ip(self.request))

    def perform_destroy(self, instance):
        log_action(self.request.user, 'user_delete', 'User', str(instance.id),
                   f"Deleted user {instance.username}",
                   ip_address=get_client_ip(self.request))
        instance.delete()


# ─────────────────────────────────────────────────────────────────────────────
# PARKING LOT
# ─────────────────────────────────────────────────────────────────────────────

class ParkingLotViewSet(viewsets.ModelViewSet):
    queryset           = ParkingLot.objects.filter(is_active=True)
    serializer_class   = ParkingLotSerializer
    permission_classes = [IsAdminOrReadOnly]

    @action(detail=True, methods=['get'], permission_classes=[IsAnyDisplay])
    def analytics(self, request, pk=None):
        lot  = self.get_object()
        data = get_lot_analytics(lot)
        return Response(data)

    @action(detail=True, methods=['get'], permission_classes=[IsAnyDisplay])
    def slots_status(self, request, pk=None):
        lot   = self.get_object()
        slots = ParkingSlot.objects.filter(lot=lot).select_related('slot_type')
        return Response(ParkingSlotStatusSerializer(slots, many=True).data)

    @action(detail=True, methods=['get'], permission_classes=[IsAdmin])
    def revenue_report(self, request, pk=None):
        lot  = self.get_object()
        rows = (
            Ticket.objects
            .filter(lot=lot, status__in=['paid', 'exempt'])
            .extra(select={'day': "DATE(entry_time)"})
            .values('day')
            .annotate(revenue=Sum('amount_charged'), count=Count('id'))
            .order_by('day')
        )
        return Response(list(rows))


# ─────────────────────────────────────────────────────────────────────────────
# ENTRANCE / EXIT
# ─────────────────────────────────────────────────────────────────────────────

class EntranceViewSet(viewsets.ModelViewSet):
    queryset           = Entrance.objects.select_related('lot')
    serializer_class   = EntranceSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['lot', 'is_active']

    @action(detail=True, methods=['post'], permission_classes=[IsAttendant])
    def open_gate(self, request, pk=None):
        entrance = self.get_object()
        success  = esp32_open_gate(entrance.sensor_id, 'entrance')
        log_action(request.user, 'gate_open', 'Entrance', str(entrance.id),
                   f"Opened entrance gate {entrance.name}",
                   ip_address=get_client_ip(request))
        ws_broadcast_lot(str(entrance.lot_id), {
            'type': 'gate_opened',
            'payload': {'gate_type': 'entrance', 'gate_name': entrance.name},
        })
        return Response({'status': 'gate_open' if success else 'command_queued'})


class ExitViewSet(viewsets.ModelViewSet):
    queryset           = Exit.objects.select_related('lot')
    serializer_class   = ExitSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['lot', 'is_active']

    @action(detail=True, methods=['post'], permission_classes=[IsAttendant])
    def open_gate(self, request, pk=None):
        exit_gate = self.get_object()
        success   = esp32_open_gate(exit_gate.sensor_id, 'exit')
        log_action(request.user, 'gate_open', 'Exit', str(exit_gate.id),
                   f"Opened exit gate {exit_gate.name}",
                   ip_address=get_client_ip(request))
        ws_broadcast_lot(str(exit_gate.lot_id), {
            'type': 'gate_opened',
            'payload': {'gate_type': 'exit', 'gate_name': exit_gate.name},
        })
        return Response({'status': 'gate_open' if success else 'command_queued'})


# ─────────────────────────────────────────────────────────────────────────────
# SLOT TYPE & SLOT
# ─────────────────────────────────────────────────────────────────────────────

class SlotTypeViewSet(viewsets.ModelViewSet):
    queryset           = SlotType.objects.all()
    serializer_class   = SlotTypeSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_update(self, serializer):
        instance = serializer.save()
        log_action(self.request.user, 'pricing_change', 'SlotType', str(instance.id),
                   f"Updated pricing for {instance.name}",
                   ip_address=get_client_ip(self.request))


class ParkingSlotViewSet(viewsets.ModelViewSet):
    queryset           = ParkingSlot.objects.select_related('lot', 'slot_type')
    serializer_class   = ParkingSlotSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['lot', 'status', 'slot_type__vehicle_class']
    search_fields      = ['slot_number']

    @action(detail=True, methods=['patch'], permission_classes=[IsAdmin])
    def set_status(self, request, pk=None):
        slot   = self.get_object()
        new_st = request.data.get('status')
        if new_st not in dict(ParkingSlot.STATUS):
            return Response({'error': 'Invalid status'}, status=400)
        old_st = slot.status
        slot.status = new_st
        slot.save(update_fields=['status', 'last_updated'])
        log_action(request.user, 'slot_status', 'ParkingSlot', str(slot.id),
                   f"Slot {slot.slot_number} changed {old_st} → {new_st}",
                   ip_address=get_client_ip(request))
        # Broadcast slot change
        ws_broadcast_lot(str(slot.lot_id), {
            'type': 'slot_update',
            'payload': {
                'slot_id': str(slot.id),
                'slot_number': slot.slot_number,
                'status': new_st,
            },
        })
        return Response(ParkingSlotStatusSerializer(slot).data)


# ─────────────────────────────────────────────────────────────────────────────
# TICKETS
# ─────────────────────────────────────────────────────────────────────────────

class TicketViewSet(viewsets.ModelViewSet):
    queryset           = Ticket.objects.select_related(
                             'lot', 'entrance', 'exit_gate',
                             'assigned_slot__slot_type', 'attendant'
                         )
    permission_classes = [IsAttendant]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['lot', 'status', 'vehicle_type', 'is_service_exempt']
    search_fields      = ['ticket_number', 'license_plate']

    def get_serializer_class(self):
        if self.action == 'create':
            return TicketCreateSerializer
        if self.action == 'checkout':
            return TicketCheckoutSerializer
        return TicketSerializer

    def perform_create(self, serializer):
        lot          = serializer.validated_data['lot']
        vehicle_type = serializer.validated_data.get('vehicle_type', 'car')

        type_to_class = {
            'car':        'car',
            'motorcycle': 'cycle',
            'bicycle':    'cycle',
            'van':        'truck',
            'truck':      'truck',
            'bus':        'truck',
        }
        vehicle_class = type_to_class.get(vehicle_type, 'car')
        slot          = assign_best_slot(lot, vehicle_class)

        ticket_number = generate_ticket_number()
        ticket        = serializer.save(
            ticket_number = ticket_number,
            assigned_slot = slot,
            attendant     = self.request.user,
        )

        # Generate QR code
        barcode = generate_qr_base64(ticket)
        ticket.barcode_data = barcode
        ticket.save(update_fields=['barcode_data'])

        # Mark slot occupied
        if slot:
            slot.status = 'occupied'
            slot.save(update_fields=['status', 'last_updated'])

        # Audit log
        log_action(self.request.user, 'ticket_create', 'Ticket', str(ticket.id),
                   f"Ticket {ticket.ticket_number} created — {vehicle_type} {ticket.license_plate} → Slot {slot.slot_number if slot else 'N/A'}",
                   ip_address=get_client_ip(self.request))

        # WebSocket broadcast to lot group
        ws_broadcast_lot(str(lot.id), {
            'type': 'ticket_created',
            'payload': {
                'ticket_number': ticket.ticket_number,
                'vehicle_type':  vehicle_type,
                'license_plate': ticket.license_plate,
                'slot_number':   slot.slot_number if slot else None,
                'entry_time':    ticket.entry_time.isoformat(),
            },
        })

        # Slot update broadcast
        if slot:
            ws_broadcast_lot(str(lot.id), {
                'type': 'slot_update',
                'payload': {
                    'slot_id':     str(slot.id),
                    'slot_number': slot.slot_number,
                    'status':      'occupied',
                },
            })

        # Lot full alert
        if lot.is_full:
            ws_broadcast_lot(str(lot.id), {
                'type': 'alert',
                'payload': {
                    'alert_type': 'lot_full',
                    'severity': 'high',
                    'message': f"{lot.name} is now at full capacity.",
                },
            })

    @action(detail=True, methods=['post'], permission_classes=[IsAttendant])
    def checkout(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status not in ('active',):
            return Response({'error': 'Ticket already closed.'}, status=400)

        ticket.exit_time      = timezone.now()
        ticket.amount_charged = ticket.calculate_fee()
        ticket.save(update_fields=['exit_time', 'amount_charged'])

        serializer = TicketCheckoutSerializer(ticket, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Transaction record
        if not ticket.is_service_exempt:
            Transaction.objects.create(
                ticket           = ticket,
                amount           = ticket.amount_charged,
                payment_method   = ticket.payment_method,
                mobile_money_ref = request.data.get('mobile_money_ref', ''),
                processed_by     = request.user,
            )

        # Free the slot
        slot = ticket.assigned_slot
        if slot:
            slot.status = 'vacant'
            slot.save(update_fields=['status', 'last_updated'])
            ws_broadcast_lot(str(ticket.lot_id), {
                'type': 'slot_update',
                'payload': {
                    'slot_id':     str(slot.id),
                    'slot_number': slot.slot_number,
                    'status':      'vacant',
                },
            })

        # Open exit gate via ESP32
        if ticket.exit_gate:
            esp32_open_gate(ticket.exit_gate.sensor_id, 'exit')

        log_action(request.user, 'ticket_checkout', 'Ticket', str(ticket.id),
                   f"Checkout {ticket.ticket_number} — UGX {ticket.amount_charged:,} via {ticket.payment_method}",
                   ip_address=get_client_ip(request))

        ws_broadcast_lot(str(ticket.lot_id), {
            'type': 'ticket_closed',
            'payload': {
                'ticket_number': ticket.ticket_number,
                'amount':        float(ticket.amount_charged),
                'payment_method': ticket.payment_method,
            },
        })

        return Response(TicketSerializer(ticket).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAttendant])
    def free_pass(self, request, pk=None):
        ticket        = self.get_object()
        gate_type     = request.data.get('gate_type', 'entrance')
        exempt_reason = request.data.get('exempt_reason', 'Manual Override')

        ticket.is_service_exempt = True
        ticket.exempt_reason     = exempt_reason
        ticket.save(update_fields=['is_service_exempt', 'exempt_reason'])

        if gate_type == 'entrance' and ticket.entrance:
            esp32_open_gate(ticket.entrance.sensor_id, 'entrance')
        elif gate_type == 'exit' and ticket.exit_gate:
            esp32_open_gate(ticket.exit_gate.sensor_id, 'exit')

        log_action(request.user, 'free_pass', 'Ticket', str(ticket.id),
                   f"Free pass issued for {ticket.ticket_number} — {exempt_reason}",
                   ip_address=get_client_ip(request))

        return Response({'status': 'free_pass_granted', 'reason': exempt_reason})

    @action(detail=False, methods=['get'], permission_classes=[IsAttendant])
    def active(self, request):
        lot_id = request.query_params.get('lot')
        qs     = self.get_queryset().filter(status='active')
        if lot_id:
            qs = qs.filter(lot_id=lot_id)
        return Response(TicketSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def void(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = 'void'
        ticket.save(update_fields=['status', 'updated_at'])
        # Free slot if occupied
        slot = ticket.assigned_slot
        if slot and slot.status == 'occupied':
            slot.status = 'vacant'
            slot.save(update_fields=['status', 'last_updated'])
        log_action(request.user, 'ticket_void', 'Ticket', str(ticket.id),
                   f"Voided ticket {ticket.ticket_number}",
                   ip_address=get_client_ip(request))
        return Response(TicketSerializer(ticket).data)


# ─────────────────────────────────────────────────────────────────────────────
# TRANSACTIONS
# ─────────────────────────────────────────────────────────────────────────────

class TransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = Transaction.objects.select_related('ticket', 'processed_by')
    serializer_class   = TransactionSerializer
    permission_classes = [IsAdmin]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['payment_method']


# ─────────────────────────────────────────────────────────────────────────────
# AUDIO CONFIG
# ─────────────────────────────────────────────────────────────────────────────

class AudioConfigViewSet(viewsets.ModelViewSet):
    queryset           = AudioConfig.objects.select_related('lot')
    serializer_class   = AudioConfigSerializer
    permission_classes = [IsAdmin]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['lot', 'trigger_event', 'is_enabled']

    def perform_update(self, serializer):
        instance = serializer.save()
        log_action(self.request.user, 'audio_change', 'AudioConfig', str(instance.id),
                   f"Updated audio config: {instance.trigger_event}",
                   ip_address=get_client_ip(self.request))

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def play_now(self, request, pk=None):
        from .utils import esp32_play_audio
        cfg     = self.get_object()
        # Find the device for this lot
        success = False
        try:
            from device_control.models import Device
            device = Device.objects.filter(
                lot=cfg.lot, device_type='entrance_unit', online_status=True
            ).first()
            if device:
                success = esp32_play_audio(device.device_id, cfg.track_number, cfg.volume)
        except Exception:
            pass
        return Response({'triggered': success})


# ─────────────────────────────────────────────────────────────────────────────
# ALERTS
# ─────────────────────────────────────────────────────────────────────────────

class AlertViewSet(viewsets.ModelViewSet):
    queryset           = Alert.objects.select_related('lot', 'resolved_by')
    serializer_class   = AlertSerializer
    permission_classes = [IsAdmin]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['lot', 'alert_type', 'severity', 'is_resolved']

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        alert             = self.get_object()
        alert.is_resolved = True
        alert.resolved_by = request.user
        alert.resolved_at = timezone.now()
        alert.save(update_fields=['is_resolved', 'resolved_by', 'resolved_at'])
        log_action(request.user, 'alert_resolve', 'Alert', str(alert.id),
                   f"Resolved alert: {alert.alert_type}",
                   ip_address=get_client_ip(request))
        return Response(AlertSerializer(alert).data)


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANT ASSIGNMENTS
# ─────────────────────────────────────────────────────────────────────────────

class AttendantAssignmentViewSet(viewsets.ModelViewSet):
    queryset           = AttendantAssignment.objects.select_related(
                             'attendant', 'lot', 'entrance', 'exit_gate'
                         )
    serializer_class   = AttendantAssignmentSerializer
    permission_classes = [IsAdmin]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['lot', 'is_active']


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOGS
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = AuditLog.objects.select_related('user')
    serializer_class   = AuditLogSerializer
    permission_classes = [IsAdmin]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['action', 'user']
    search_fields      = ['detail', 'target_id', 'user__username']


# ─────────────────────────────────────────────────────────────────────────────
# GATE COMMAND
# ─────────────────────────────────────────────────────────────────────────────

class GateCommandView(APIView):
    permission_classes = [IsAttendant]

    def post(self, request):
        ser = GateCommandSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        gate_type = ser.validated_data['gate_type']
        gate_id   = ser.validated_data['gate_id']
        command   = ser.validated_data['command']

        if gate_type == 'entrance':
            try:
                gate   = Entrance.objects.get(pk=gate_id)
                sensor = gate.sensor_id
                lot_id = str(gate.lot_id)
            except Entrance.DoesNotExist:
                return Response({'error': 'Entrance not found'}, status=404)
        else:
            try:
                gate   = Exit.objects.get(pk=gate_id)
                sensor = gate.sensor_id
                lot_id = str(gate.lot_id)
            except Exit.DoesNotExist:
                return Response({'error': 'Exit not found'}, status=404)

        success = esp32_open_gate(sensor, gate_type) if command == 'open' else False

        log_action(request.user, 'gate_open', gate_type.capitalize(), str(gate_id),
                   f"Gate command '{command}' on {gate_type} {sensor}",
                   ip_address=get_client_ip(request))

        ws_broadcast_lot(lot_id, {
            'type': 'gate_opened',
            'payload': {'gate_type': gate_type, 'command': command},
        })

        return Response({'success': success, 'command': command})
