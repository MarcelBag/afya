from django.contrib.auth import get_user_model
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib import messages
from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.core.mail import send_mail
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST
from django.utils import timezone
import json
import logging
import mimetypes
import os
import uuid

from .forms import (
    DashboardAuthenticationForm,
    DashboardPasswordChangeForm,
    DashboardProfileForm,
    DashboardUserCreateForm,
    DashboardUserUpdateForm,
)
from .audit_utils import audit_metadata
from .permissions import (
    PERMISSION_ACCESS_DJANGO_ADMIN,
    PERMISSION_MANAGE_RECYCLE_BIN,
    PERMISSION_MANAGE_USERS,
    PERMISSION_VIEW_ANALYTICS,
    PERMISSION_VIEW_AUDIT_LOGS,
    PERMISSION_VIEW_DASHBOARD,
    analytics_required,
    audit_logs_required,
    dashboard_required,
    get_user_permissions,
    manage_recycle_bin_required,
    manage_users_required,
    user_has_permission,
)
from .models import AnalysisHistory, AuditEvent, HeaderHistory
import requests
from django.core.files.storage import default_storage


User = get_user_model()
logger = logging.getLogger(__name__)


def json_login_required(view_func):
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"message": "Authentication required."}, status=401)
        if not request.user.is_active:
            return JsonResponse({"message": "Account deactivated."}, status=403)
        return view_func(request, *args, **kwargs)

    return wrapped


def flask_backend_url():
    return getattr(settings, "FLASK_BACKEND_URL", "http://localhost:5002").rstrip("/")


def analysis_history_payload(item):
    return {
        "_id": str(item.pk),
        "imagePath": item.image_path,
        "prediction": item.prediction,
        "confidence": item.confidence,
        "analysisType": item.analysis_type or item.prediction,
        "createdAt": item.created_at.isoformat(),
    }


def header_history_payload(item):
    return {
        "_id": str(item.pk),
        "title": item.title,
        "imageUrl": item.image_url,
        "createdAt": item.created_at.isoformat(),
    }


@require_POST
def contact_api(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid request payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    message = str(payload.get("message", "")).strip()

    if not name or not email or not message:
        return JsonResponse({"message": "Name, email, and message are required."}, status=400)

    subject = f"New Contact Message from {name}"
    body = f"Name: {name}\nEmail: {email}\n\n{message}"
    recipient = getattr(settings, "CONTACT_EMAIL", "") or getattr(settings, "EMAIL_HOST_USER", "")
    if not recipient:
        return JsonResponse({"message": "Contact email is not configured."}, status=503)

    try:
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [recipient],
            fail_silently=False,
        )
    except Exception:
        return JsonResponse({"message": "Failed to send message."}, status=500)

    return JsonResponse({"message": "Message sent!"})


@require_POST
def signup_api(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid request payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", "")).strip()

    if not name or not email or not password:
        return JsonResponse({"message": "Name, email, and password are required."}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({"message": "User already exists."}, status=400)

    username_base = email.split("@", 1)[0] or "user"
    username = username_base
    suffix = 1
    while User.objects.filter(username__iexact=username).exists():
        suffix += 1
        username = f"{username_base}{suffix}"

    first_name, _, last_name = name.partition(" ")
    User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        role=User.ROLE_USER,
        is_active=True,
    )
    return JsonResponse({"message": "User created successfully!"}, status=201)


@require_POST
@json_login_required
def upload_image_api(request):
    image = request.FILES.get("image")
    if not image:
        return JsonResponse({"message": "No image uploaded."}, status=400)

    extension = os.path.splitext(image.name)[1].lower()
    if extension not in (".png", ".jpg", ".jpeg", ".webp"):
        return JsonResponse({"message": "Invalid file format"}, status=400)

    filename = f"{uuid.uuid4().hex}{extension}"
    storage_path = default_storage.save(f"analysis_uploads/{filename}", image)
    image_path = f"{settings.MEDIA_URL}{storage_path}"

    try:
        with default_storage.open(storage_path, "rb") as file_obj:
            content_type = image.content_type or mimetypes.guess_type(image.name)[0] or "application/octet-stream"
            response = requests.post(
                f"{flask_backend_url()}/api/predict",
                files={"image": (image.name, file_obj, content_type)},
                timeout=90,
            )
    except requests.RequestException:
        logger.exception("Image analysis service request failed.")
        return JsonResponse(
            {"message": "Image analysis is temporarily unavailable. Please try again in a few minutes."},
            status=502,
        )

    try:
        data = response.json()
    except ValueError:
        logger.exception("Image analysis service returned non-JSON response.")
        return JsonResponse(
            {"message": "Image analysis is temporarily unavailable. Please try again in a few minutes."},
            status=502,
        )

    if not response.ok:
        return JsonResponse(data, status=response.status_code)

    item = AnalysisHistory.objects.create(
        user=request.user,
        image_path=image_path,
        prediction=data.get("prediction", "Unknown"),
        confidence=float(data.get("confidence") or 0),
        analysis_type=data.get("analysisType") or data.get("prediction", ""),
    )
    log_audit(
        request,
        "ANALYSIS_CREATE",
        resource_type="AnalysisHistory",
        resource_id=item.pk,
        details=f"Created {item.analysis_type or item.prediction} analysis result.",
    )

    payload = analysis_history_payload(item)
    payload.update(data)
    payload["imagePath"] = image_path
    return JsonResponse(payload)


@json_login_required
def analysis_history_api(request):
    if request.method != "GET":
        return JsonResponse({"message": "Method not allowed."}, status=405)
    items = AnalysisHistory.objects.filter(user=request.user)
    return JsonResponse([analysis_history_payload(item) for item in items], safe=False)


@json_login_required
def analysis_history_detail_api(request, history_id):
    item = get_object_or_404(AnalysisHistory, pk=history_id, user=request.user)
    if request.method != "DELETE":
        return JsonResponse({"message": "Method not allowed."}, status=405)
    item.delete()
    log_audit(
        request,
        "ANALYSIS_HISTORY_DELETE",
        resource_type="AnalysisHistory",
        resource_id=history_id,
        details="Deleted analysis history item.",
    )
    return JsonResponse({"message": "Analysis deleted successfully"})


@require_POST
@json_login_required
def generate_headers_api(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid request payload."}, status=400)

    titles = payload.get("titles")
    if not isinstance(titles, list) or not titles:
        return JsonResponse({"message": "No titles provided"}, status=400)

    try:
        response = requests.post(
            f"{flask_backend_url()}/api/generate-headers",
            json={"titles": titles},
            timeout=180,
        )
    except requests.RequestException:
        logger.exception("Header generation service request failed.")
        return JsonResponse(
            {"message": "Header generation is temporarily unavailable. Please try again in a few minutes."},
            status=502,
        )

    try:
        data = response.json()
    except ValueError:
        logger.exception("Header generation service returned non-JSON response.")
        return JsonResponse(
            {"message": "Header generation is temporarily unavailable. Please try again in a few minutes."},
            status=502,
        )

    if not response.ok:
        return JsonResponse(data, status=response.status_code)

    successful_items = []
    for result in data.get("results", []):
        if result.get("image") and not result.get("error"):
            successful_items.append(
                HeaderHistory.objects.create(
                    user=request.user,
                    title=result.get("title", "Generated header"),
                    image_url=result["image"],
                )
            )

    if successful_items:
        log_audit(
            request,
            "HEADER_GENERATION_CREATE",
            resource_type="HeaderHistory",
            resource_id=",".join(str(item.pk) for item in successful_items),
            details=f"Generated {len(successful_items)} header image(s).",
        )

    return JsonResponse(data)


@json_login_required
def header_history_api(request):
    if request.method != "GET":
        return JsonResponse({"message": "Method not allowed."}, status=405)
    items = HeaderHistory.objects.filter(user=request.user)
    return JsonResponse([header_history_payload(item) for item in items], safe=False)


@json_login_required
def header_history_detail_api(request, history_id):
    item = get_object_or_404(HeaderHistory, pk=history_id, user=request.user)
    if request.method != "DELETE":
        return JsonResponse({"message": "Method not allowed."}, status=405)
    item.delete()
    log_audit(
        request,
        "HEADER_HISTORY_DELETE",
        resource_type="HeaderHistory",
        resource_id=history_id,
        details="Deleted generated header history item.",
    )
    return JsonResponse({"message": "Deleted"})


@json_login_required
def user_profile_api(request):
    if request.method != "PATCH":
        return JsonResponse({"message": "Method not allowed."}, status=405)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid request payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    password = str(payload.get("password", "")).strip()
    user = request.user

    if name:
        parts = name.split(" ", 1)
        user.first_name = parts[0]
        user.last_name = parts[1] if len(parts) > 1 else ""
    if password:
        user.set_password(password)
    if not name and not password:
        return JsonResponse({"message": "No changes provided."}, status=400)

    user.save()
    if password:
        update_session_auth_hash(request, user)
    log_audit(
        request,
        "PROFILE_UPDATE",
        resource_type="User",
        resource_id=user.pk,
        details=f"Updated profile for {user.username}.",
    )
    display_name = user.get_full_name() or user.get_username()
    return JsonResponse({"message": "Updated", "name": display_name})


DASHBOARD_NAV = (
    {
        "key": "dashboard",
        "label": "Dashboard",
        "url_name": "authentication:dashboard",
        "permission": PERMISSION_VIEW_DASHBOARD,
    },
    {
        "key": "users",
        "label": "Users",
        "url_name": "authentication:users",
        "permission": PERMISSION_MANAGE_USERS,
    },
    {
        "key": "recycle_bin",
        "label": "Recycle Bin",
        "url_name": "authentication:recycle_bin",
        "permission": PERMISSION_MANAGE_RECYCLE_BIN,
    },
    {
        "key": "analytics",
        "label": "Analytics",
        "url_name": "authentication:analytics",
        "permission": PERMISSION_VIEW_ANALYTICS,
    },
    {
        "key": "audit_logs",
        "label": "Audit Logs",
        "url_name": "authentication:audit_logs",
        "permission": PERMISSION_VIEW_AUDIT_LOGS,
    },
    {
        "key": "django_admin",
        "label": "Django Admin",
        "url_name": "admin:index",
        "permission": PERMISSION_ACCESS_DJANGO_ADMIN,
        "external": True,
    },
)


def dashboard_context(request, section):
    permissions = get_user_permissions(request.user)
    nav_items = [item for item in DASHBOARD_NAV if item["permission"] in permissions]
    return {
        "section": section,
        "nav_items": nav_items,
        "role_label": getattr(request.user, "role_label", "User"),
        "profile_form": DashboardProfileForm(instance=request.user),
        "password_form": DashboardPasswordChangeForm(request.user),
    }


def querystring_without_page(request):
    params = request.GET.copy()
    params.pop("page", None)
    return params.urlencode()


def log_audit(request, action, resource_type="", resource_id="", details="", target_user=None):
    AuditEvent.objects.create(
        user=request.user if request.user.is_authenticated else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id or ""),
        details=details,
        **audit_metadata(request),
    )


def safe_next_url(request, fallback="authentication:dashboard"):
    next_url = request.POST.get("next") or request.GET.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return next_url
    return reverse(fallback)


def dashboard_login(request):
    if request.user.is_authenticated:
        if request.GET.get("next"):
            return redirect(safe_next_url(request))
        if user_has_permission(request.user, PERMISSION_VIEW_DASHBOARD):
            return redirect("authentication:dashboard")
        return redirect("site-home-app")

    if request.method == "POST":
        form = DashboardAuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            auth_login(request, user)

            log_audit(
                request,
                "LOGIN",
                resource_type="User",
                resource_id=user.pk,
                details=f"Dashboard login for {user.username}.",
            )
            if not user_has_permission(user, PERMISSION_VIEW_DASHBOARD):
                return redirect("site-home-app")
            return redirect(safe_next_url(request))

        username = request.POST.get("username", "").strip()
        AuditEvent.objects.create(
            user=None,
            action="LOGIN_FAILED",
            resource_type="User",
            resource_id=username,
            details=f"Failed dashboard login attempt for {username or 'unknown user'}.",
            **audit_metadata(request),
        )
        messages.error(request, "Invalid username/email or password.")
    else:
        form = DashboardAuthenticationForm(request)

    return render(
        request,
        "authentication/dashboard/login.html",
        {
            "form": form,
            "next": request.GET.get("next", ""),
        },
    )


@require_POST
def dashboard_logout(request):
    if request.user.is_authenticated:
        username = request.user.get_username()
        user_id = request.user.pk
        log_audit(
            request,
            "LOGOUT",
            resource_type="User",
            resource_id=user_id,
            details=f"Dashboard logout for {username}.",
        )
    auth_logout(request)
    messages.success(request, "You have been signed out.")
    return redirect("authentication:login")


def can_modify_user(actor, target_user, form_data=None):
    if actor.is_superuser:
        if actor.pk == target_user.pk and form_data:
            if not form_data.get("is_active", True):
                return False
            if not form_data.get("is_staff", True):
                return False
        return True
    if target_user.is_superuser:
        return False
    return True


def user_change_summary(before, after):
    changes = []
    for field in ("email", "first_name", "last_name", "role", "is_staff", "is_active"):
        if before.get(field) != getattr(after, field):
            changes.append(f"{field}: {before.get(field)} -> {getattr(after, field)}")
    return "; ".join(changes) or "No field changes"


@dashboard_required
def dashboard(request):
    context = dashboard_context(request, "dashboard")
    context["stats"] = {
        "total_users": User.objects.count(),
        "active_users": User.objects.filter(is_active=True).count(),
        "staff_users": User.objects.filter(is_staff=True).count(),
        "audit_events": AuditEvent.objects.count(),
    }
    context["recent_events"] = AuditEvent.objects.select_related("user")[:5]
    return render(request, "authentication/dashboard/index.html", context)


@dashboard_required
def profile(request):
    profile_form = DashboardProfileForm(instance=request.user)
    password_form = DashboardPasswordChangeForm(request.user)

    if request.method == "POST":
        if request.POST.get("form_name") == "profile":
            before = {
                "email": request.user.email,
                "first_name": request.user.first_name,
                "last_name": request.user.last_name,
            }
            profile_form = DashboardProfileForm(request.POST, instance=request.user)
            if profile_form.is_valid():
                user = profile_form.save()
                changes = []
                for field in ("email", "first_name", "last_name"):
                    if before[field] != getattr(user, field):
                        changes.append(f"{field}: {before[field]} -> {getattr(user, field)}")
                log_audit(
                    request,
                    "PROFILE_UPDATE",
                    resource_type="User",
                    resource_id=user.pk,
                    details="; ".join(changes) or "No profile field changes",
                )
                messages.success(request, "Profile updated.")
                return redirect(safe_next_url(request, fallback="authentication:profile"))
            messages.error(request, "Profile could not be updated. Check the form fields.")
        elif request.POST.get("form_name") == "password":
            password_form = DashboardPasswordChangeForm(request.user, request.POST)
            if password_form.is_valid():
                user = password_form.save()
                update_session_auth_hash(request, user)
                log_audit(
                    request,
                    "PASSWORD_CHANGE",
                    resource_type="User",
                    resource_id=user.pk,
                    details=f"Dashboard password changed for {user.username}.",
                )
                messages.success(request, "Password updated.")
                return redirect(safe_next_url(request, fallback="authentication:profile"))
            messages.error(request, "Password could not be updated. Check the form fields.")

    context = dashboard_context(request, "profile")
    context["profile_form"] = profile_form
    context["password_form"] = password_form
    return render(request, "authentication/dashboard/profile.html", context)


@manage_users_required
def users(request):
    context = dashboard_context(request, "users")
    context["users"] = User.objects.order_by("-date_joined")[:100]
    context["create_form"] = DashboardUserCreateForm()
    return render(request, "authentication/dashboard/users.html", context)


@manage_users_required
def user_create(request):
    if request.method != "POST":
        return redirect("authentication:users")

    form = DashboardUserCreateForm(request.POST)
    if not form.is_valid():
        context = dashboard_context(request, "users")
        context["users"] = User.objects.order_by("-date_joined")[:100]
        context["create_form"] = form
        messages.error(request, "User could not be created. Check the form fields.")
        return render(request, "authentication/dashboard/users.html", context, status=400)

    user = form.save()
    log_audit(
        request,
        "USER_CREATE",
        resource_type="User",
        resource_id=user.pk,
        details=f"Created Django user {user.username} with role {user.role_label}.",
    )
    messages.success(request, f"Created user {user.username}.")
    return redirect("authentication:users")


@manage_users_required
def user_edit(request, user_id):
    user = get_object_or_404(User, pk=user_id)
    if not can_modify_user(request.user, user):
        raise PermissionDenied

    if request.method == "POST":
        before = {
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "is_staff": user.is_staff,
            "is_active": user.is_active,
        }
        form = DashboardUserUpdateForm(request.POST, instance=user)
        if form.is_valid():
            candidate = form.save(commit=False)
            if not can_modify_user(request.user, user, form.cleaned_data):
                raise PermissionDenied
            candidate.save()
            log_audit(
                request,
                "USER_UPDATE",
                resource_type="User",
                resource_id=user.pk,
                details=f"Updated Django user {user.username}. {user_change_summary(before, candidate)}",
            )
            messages.success(request, f"Updated user {user.username}.")
            return redirect("authentication:users")
        messages.error(request, "User could not be updated. Check the form fields.")
    else:
        form = DashboardUserUpdateForm(instance=user)

    context = dashboard_context(request, "users")
    context["target_user"] = user
    context["form"] = form
    return render(request, "authentication/dashboard/user_form.html", context)


@require_POST
@manage_users_required
def user_toggle_active(request, user_id):
    user = get_object_or_404(User, pk=user_id)
    if not can_modify_user(request.user, user):
        raise PermissionDenied
    if request.user.pk == user.pk and user.is_active:
        messages.error(request, "You cannot deactivate your own account.")
        return redirect("authentication:users")

    user.is_active = not user.is_active
    user.save(update_fields=["is_active"])
    log_audit(
        request,
        "USER_STATUS_TOGGLE",
        resource_type="User",
        resource_id=user.pk,
        details=f"Set Django user {user.username} active={user.is_active}.",
    )
    messages.success(request, f"{'Activated' if user.is_active else 'Deactivated'} user {user.username}.")
    return redirect("authentication:users")


@manage_recycle_bin_required
def recycle_bin(request):
    context = dashboard_context(request, "recycle_bin")
    context["inactive_users"] = User.objects.filter(is_active=False).order_by("-date_joined")[:100]
    return render(request, "authentication/dashboard/recycle_bin.html", context)


@analytics_required
def analytics(request):
    context = dashboard_context(request, "analytics")
    analysis_items = [
        {
            "user": item.user,
            "type": "Image Analysis",
            "title": f"{item.analysis_type or item.prediction}: {item.prediction}",
            "url": item.image_path,
            "created_at": item.created_at,
        }
        for item in AnalysisHistory.objects.select_related("user")
    ]
    header_items = [
        {
            "user": item.user,
            "type": "Blog Header",
            "title": item.title,
            "url": item.image_url,
            "created_at": item.created_at,
        }
        for item in HeaderHistory.objects.select_related("user")
    ]
    ai_history = sorted(
        [*analysis_items, *header_items],
        key=lambda item: item["created_at"],
        reverse=True,
    )
    context["stats"] = {
        "total_users": User.objects.count(),
        "active_users": User.objects.filter(is_active=True).count(),
        "new_users_today": User.objects.filter(date_joined__date=timezone.localdate()).count(),
        "ai_results": len(ai_history),
        "image_analyses": len(analysis_items),
        "header_generations": len(header_items),
        "audit_events": AuditEvent.objects.count(),
    }
    context["ai_history"] = ai_history[:200]
    return render(request, "authentication/dashboard/analytics.html", context)


@audit_logs_required
def audit_logs(request):
    context = dashboard_context(request, "audit_logs")
    events = AuditEvent.objects.select_related("user")
    query = request.GET.get("q", "").strip()
    action = request.GET.get("action", "").strip()
    start = request.GET.get("start", "").strip()
    end = request.GET.get("end", "").strip()

    if query:
        events = events.filter(
            Q(action__icontains=query)
            | Q(user__username__icontains=query)
            | Q(user__email__icontains=query)
            | Q(resource_type__icontains=query)
            | Q(resource_id__icontains=query)
            | Q(details__icontains=query)
            | Q(ip_address__icontains=query)
            | Q(city__icontains=query)
            | Q(country__icontains=query)
            | Q(region__icontains=query)
            | Q(isp__icontains=query)
            | Q(location__icontains=query)
            | Q(user_agent__icontains=query)
        )
    if action:
        events = events.filter(action=action)
    if start:
        events = events.filter(created_at__date__gte=start)
    if end:
        events = events.filter(created_at__date__lte=end)

    paginator = Paginator(events, 25)
    page_obj = paginator.get_page(request.GET.get("page"))

    context["events"] = page_obj
    context["page_obj"] = page_obj
    context["total_events"] = paginator.count
    context["audit_actions"] = AuditEvent.objects.order_by("action").values_list("action", flat=True).distinct()
    context["filters"] = {
        "q": query,
        "action": action,
        "start": start,
        "end": end,
    }
    context["querystring"] = querystring_without_page(request)
    return render(request, "authentication/dashboard/audit_logs.html", context)
