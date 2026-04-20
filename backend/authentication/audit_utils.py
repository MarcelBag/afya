import ipaddress
import json
from urllib.error import URLError
from urllib.request import urlopen


def get_client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def is_public_ip(ip_address):
    if not ip_address:
        return False
    try:
        parsed_ip = ipaddress.ip_address(ip_address)
    except ValueError:
        return False
    return not (
        parsed_ip.is_private
        or parsed_ip.is_loopback
        or parsed_ip.is_link_local
        or parsed_ip.is_multicast
        or parsed_ip.is_reserved
        or parsed_ip.is_unspecified
    )


def lookup_geoip(ip_address):
    if not is_public_ip(ip_address):
        return {
            "city": "",
            "country": "",
            "region": "",
            "isp": "",
            "location": "Local network" if ip_address else "",
        }

    url = f"http://ip-api.com/json/{ip_address}?fields=status,country,regionName,city,isp"
    try:
        with urlopen(url, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, TimeoutError, json.JSONDecodeError):
        return {
            "city": "",
            "country": "",
            "region": "",
            "isp": "",
            "location": ip_address or "",
        }

    if payload.get("status") != "success":
        return {
            "city": "",
            "country": "",
            "region": "",
            "isp": "",
            "location": ip_address or "",
        }

    city = payload.get("city") or ""
    country = payload.get("country") or ""
    region = payload.get("regionName") or ""
    isp = payload.get("isp") or ""
    location_parts = [part for part in (city, region, country) if part]

    return {
        "city": city,
        "country": country,
        "region": region,
        "isp": isp,
        "location": ", ".join(location_parts) or ip_address or "",
    }


def audit_metadata(request):
    ip_address = get_client_ip(request)
    return {
        "ip_address": ip_address,
        "user_agent": request.META.get("HTTP_USER_AGENT", ""),
        **lookup_geoip(ip_address),
    }
