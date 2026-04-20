from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .models import AuditEvent, User


@admin.register(User)
class AfyaUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (_("Afya Access"), {"fields": ("role",)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (_("Afya Access"), {"fields": ("role",)}),
    )
    list_display = ("username", "email", "first_name", "last_name", "role", "is_staff", "is_superuser", "is_active")
    list_filter = UserAdmin.list_filter + ("role",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "user", "action", "resource_type", "resource_id", "location", "ip_address")
    list_filter = ("action", "resource_type", "country", "created_at")
    search_fields = (
        "action",
        "resource_type",
        "resource_id",
        "details",
        "ip_address",
        "city",
        "country",
        "region",
        "isp",
        "location",
        "user__username",
        "user__email",
    )
    readonly_fields = (
        "user",
        "action",
        "resource_type",
        "resource_id",
        "details",
        "ip_address",
        "city",
        "country",
        "region",
        "isp",
        "location",
        "user_agent",
        "created_at",
    )

    def has_add_permission(self, request):
        return False
