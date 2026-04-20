from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied


ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_SUPERUSER = "superuser"

PERMISSION_VIEW_DASHBOARD = "view_dashboard"
PERMISSION_MANAGE_USERS = "manage_users"
PERMISSION_MANAGE_RECYCLE_BIN = "manage_recycle_bin"
PERMISSION_VIEW_ANALYTICS = "view_analytics"
PERMISSION_VIEW_AUDIT_LOGS = "view_audit_logs"
PERMISSION_ACCESS_DJANGO_ADMIN = "access_django_admin"

ROLE_PERMISSIONS = {
    ROLE_USER: set(),
    ROLE_ADMIN: {
        PERMISSION_VIEW_DASHBOARD,
        PERMISSION_MANAGE_USERS,
        PERMISSION_MANAGE_RECYCLE_BIN,
        PERMISSION_VIEW_ANALYTICS,
        PERMISSION_VIEW_AUDIT_LOGS,
    },
    ROLE_SUPERUSER: {
        PERMISSION_VIEW_DASHBOARD,
        PERMISSION_MANAGE_USERS,
        PERMISSION_MANAGE_RECYCLE_BIN,
        PERMISSION_VIEW_ANALYTICS,
        PERMISSION_VIEW_AUDIT_LOGS,
        PERMISSION_ACCESS_DJANGO_ADMIN,
    },
}


def get_user_role(user):
    if getattr(user, "is_superuser", False):
        return ROLE_SUPERUSER
    if getattr(user, "is_staff", False):
        return ROLE_ADMIN
    return getattr(user, "role", ROLE_USER)


def user_has_permission(user, permission):
    if not getattr(user, "is_authenticated", False):
        return False
    if not getattr(user, "is_active", False):
        return False
    return permission in ROLE_PERMISSIONS.get(get_user_role(user), set())


def get_user_permissions(user):
    return ROLE_PERMISSIONS.get(get_user_role(user), set())


def permission_required(permission):
    def decorator(view_func):
        @login_required
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not user_has_permission(request.user, permission):
                raise PermissionDenied
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator


dashboard_required = permission_required(PERMISSION_VIEW_DASHBOARD)
manage_users_required = permission_required(PERMISSION_MANAGE_USERS)
manage_recycle_bin_required = permission_required(PERMISSION_MANAGE_RECYCLE_BIN)
analytics_required = permission_required(PERMISSION_VIEW_ANALYTICS)
audit_logs_required = permission_required(PERMISSION_VIEW_AUDIT_LOGS)
