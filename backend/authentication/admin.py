from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "user", "action", "resource_type", "resource_id")
    list_filter = ("action", "resource_type", "created_at")
    search_fields = ("action", "resource_type", "resource_id", "details", "user__username", "user__email")
    readonly_fields = (
        "user",
        "action",
        "resource_type",
        "resource_id",
        "details",
        "ip_address",
        "user_agent",
        "created_at",
    )

    def has_add_permission(self, request):
        return False
