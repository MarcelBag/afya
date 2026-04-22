from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.static import serve
from django.views.generic import RedirectView, TemplateView

from authentication import views as authentication_views


def health(request):
    return JsonResponse({"status": "ok", "service": "afya"})


urlpatterns = [
    path("health", health, name="health"),
    path("health/", health),
    path("", ensure_csrf_cookie(TemplateView.as_view(template_name="index.html")), name="site-home"),
    path("about", ensure_csrf_cookie(TemplateView.as_view(template_name="about.html")), name="site-about"),
    path("about/", ensure_csrf_cookie(TemplateView.as_view(template_name="about.html"))),
    path("contact", ensure_csrf_cookie(TemplateView.as_view(template_name="contact.html")), name="site-contact"),
    path("contact/", ensure_csrf_cookie(TemplateView.as_view(template_name="contact.html"))),
    path("signin", RedirectView.as_view(pattern_name="authentication:login", permanent=False), name="site-signin"),
    path("signin/", RedirectView.as_view(pattern_name="authentication:login", permanent=False)),
    path("signup", ensure_csrf_cookie(TemplateView.as_view(template_name="signup.html")), name="site-signup"),
    path("signup/", ensure_csrf_cookie(TemplateView.as_view(template_name="signup.html"))),
    path("verify-2fa", RedirectView.as_view(pattern_name="authentication:login", permanent=False)),
    path("verify-2fa/", RedirectView.as_view(pattern_name="authentication:login", permanent=False)),
    path("reset-password", RedirectView.as_view(pattern_name="authentication:password_reset", permanent=False)),
    path("reset-password/", RedirectView.as_view(pattern_name="authentication:password_reset", permanent=False)),
    path("home", ensure_csrf_cookie(login_required(TemplateView.as_view(template_name="home.html"))), name="site-home-app"),
    path("home/", ensure_csrf_cookie(login_required(TemplateView.as_view(template_name="home.html")))),
    path("api/contact", csrf_exempt(authentication_views.contact_api), name="contact-api"),
    path("api/signup", csrf_exempt(authentication_views.signup_api), name="signup-api"),
    path("api/upload-image", authentication_views.upload_image_api, name="upload-image-api"),
    path("api/analysis-history", authentication_views.analysis_history_api, name="analysis-history-api"),
    path("api/analysis-history/<int:history_id>", authentication_views.analysis_history_detail_api, name="analysis-history-detail-api"),
    path("api/generate-headers", authentication_views.generate_headers_api, name="generate-headers-api"),
    path("api/header-history", authentication_views.header_history_api, name="header-history-api"),
    path("api/header-history/<int:history_id>", authentication_views.header_history_detail_api, name="header-history-detail-api"),
    path("api/user/profile", authentication_views.user_profile_api, name="user-profile-api"),
    path("forgot-password/", RedirectView.as_view(pattern_name="authentication:password_reset", permanent=False)),
    path("dashboard/", include("authentication.urls")),
    path("django-admin/", admin.site.urls),
    re_path(r"^(?P<path>(?:js|cs|assets)/.*)$", serve, {"document_root": settings.PROJECT_ROOT / "frontend"}),
    re_path(r"^uploads/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
