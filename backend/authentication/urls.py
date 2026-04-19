from django.urls import path

from . import views

app_name = "authentication"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("users/", views.users, name="users"),
    path("recycle-bin/", views.recycle_bin, name="recycle_bin"),
    path("analytics/", views.analytics, name="analytics"),
    path("audit-logs/", views.audit_logs, name="audit_logs"),
]
