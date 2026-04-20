from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy

from . import views

app_name = "authentication"

urlpatterns = [
    path("login/", views.dashboard_login, name="login"),
    path("logout/", views.dashboard_logout, name="logout"),
    path(
        "password-reset/",
        auth_views.PasswordResetView.as_view(
            template_name="authentication/dashboard/password_reset_form.html",
            email_template_name="authentication/dashboard/password_reset_email.txt",
            subject_template_name="authentication/dashboard/password_reset_subject.txt",
            success_url=reverse_lazy("authentication:password_reset_done"),
        ),
        name="password_reset",
    ),
    path(
        "password-reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="authentication/dashboard/password_reset_done.html",
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="authentication/dashboard/password_reset_confirm.html",
            success_url=reverse_lazy("authentication:password_reset_complete"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="authentication/dashboard/password_reset_complete.html",
        ),
        name="password_reset_complete",
    ),
    path("", views.dashboard, name="dashboard"),
    path("profile/", views.profile, name="profile"),
    path("users/", views.users, name="users"),
    path("users/create/", views.user_create, name="user_create"),
    path("users/<int:user_id>/edit/", views.user_edit, name="user_edit"),
    path("users/<int:user_id>/toggle-active/", views.user_toggle_active, name="user_toggle_active"),
    path("recycle-bin/", views.recycle_bin, name="recycle_bin"),
    path("analytics/", views.analytics, name="analytics"),
    path("audit-logs/", views.audit_logs, name="audit_logs"),
]
