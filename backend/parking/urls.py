"""
IUIU Smart Parking — API URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CustomTokenView,
    UserViewSet,
    ParkingLotViewSet,
    EntranceViewSet,
    ExitViewSet,
    SlotTypeViewSet,
    ParkingSlotViewSet,
    TicketViewSet,
    TransactionViewSet,
    AudioConfigViewSet,
    AlertViewSet,
    AttendantAssignmentViewSet,
    AuditLogViewSet,
    GateCommandView,
)

router = DefaultRouter()
router.register(r'users',       UserViewSet,               basename='user')
router.register(r'lots',        ParkingLotViewSet,         basename='lot')
router.register(r'entrances',   EntranceViewSet,           basename='entrance')
router.register(r'exits',       ExitViewSet,               basename='exit')
router.register(r'slot-types',  SlotTypeViewSet,           basename='slottype')
router.register(r'slots',       ParkingSlotViewSet,        basename='slot')
router.register(r'tickets',     TicketViewSet,             basename='ticket')
router.register(r'transactions',TransactionViewSet,        basename='transaction')
router.register(r'audio',       AudioConfigViewSet,        basename='audio')
router.register(r'alerts',      AlertViewSet,              basename='alert')
router.register(r'assignments', AttendantAssignmentViewSet,basename='assignment')
router.register(r'audit-logs',  AuditLogViewSet,           basename='auditlog')

urlpatterns = [
    # JWT Auth
    path('auth/token/',         CustomTokenView.as_view(),  name='token_obtain'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Gate command shortcut
    path('gates/command/', GateCommandView.as_view(), name='gate_command'),

    # All ViewSet routes
    path('', include(router.urls)),
]
