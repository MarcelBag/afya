from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_USER = "user"
    ROLE_ADMIN = "admin"
    ROLE_CHOICES = (
        (ROLE_USER, "Standard User"),
        (ROLE_ADMIN, "Operations Admin"),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_USER)

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    @property
    def role_label(self):
        if self.is_superuser:
            return "Superuser"
        return self.get_role_display()

    @property
    def is_dashboard_admin(self):
        return self.is_active and (self.role == self.ROLE_ADMIN or self.is_staff or self.is_superuser)

    @property
    def is_operations_admin(self):
        return self.is_active and (self.role == self.ROLE_ADMIN or self.is_superuser)


class AuditEvent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=100, blank=True)
    resource_id = models.CharField(max_length=255, blank=True)
    details = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    isp = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Audit Event"
        verbose_name_plural = "Audit Events"

    def __str__(self):
        return f"{self.created_at} - {self.action}"
