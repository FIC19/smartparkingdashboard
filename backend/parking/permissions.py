"""
IUIU Smart Parking — Custom RBAC Permission Classes
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    """Only users with role='admin' (or Django superusers) are allowed."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role == 'admin' or request.user.is_superuser)
        )


class IsAttendant(BasePermission):
    """Attendant role or higher (all attendant sub-roles)."""
    ATTENDANT_ROLES = ('admin', 'attendant', 'entrance_attendant', 'exit_attendant')

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in self.ATTENDANT_ROLES
        )


class IsAnyDisplay(BasePermission):
    """Entrance or Exit display panels (read-only token accounts)."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in (
                'admin', 'attendant', 'entrance_attendant', 'exit_attendant',
                'entrance_display', 'exit_display',
            )
        )


class IsAdminOrReadOnly(BasePermission):
    """Admins get full access; others get read-only safe methods."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role == 'admin' or request.user.is_superuser


class IsOwnerOrAdmin(BasePermission):
    """Object-level: user can only access their own objects, admin always can."""
    def has_object_permission(self, request, view, obj):
        if request.user.role == 'admin':
            return True
        # For Ticket / Transaction objects that have an 'attendant' field
        if hasattr(obj, 'attendant'):
            return obj.attendant == request.user
        # For User objects
        if hasattr(obj, 'username'):
            return obj == request.user
        return False
