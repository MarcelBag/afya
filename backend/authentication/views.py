from django.shortcuts import render

from .permissions import (
    analytics_required,
    audit_logs_required,
    dashboard_required,
    manage_recycle_bin_required,
    manage_users_required,
)


@dashboard_required
def dashboard(request):
    return render(request, "authentication/dashboard/index.html", {"section": "dashboard"})


@manage_users_required
def users(request):
    return render(request, "authentication/dashboard/index.html", {"section": "users"})


@manage_recycle_bin_required
def recycle_bin(request):
    return render(request, "authentication/dashboard/index.html", {"section": "recycle_bin"})


@analytics_required
def analytics(request):
    return render(request, "authentication/dashboard/index.html", {"section": "analytics"})


@audit_logs_required
def audit_logs(request):
    return render(request, "authentication/dashboard/index.html", {"section": "audit_logs"})
