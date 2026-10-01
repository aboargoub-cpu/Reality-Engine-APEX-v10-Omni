"""Optional production security layer for Reality Engine.

Enabled with PMS_AUTH_REQUIRED=true. Uses PBKDF2-HMAC-SHA256 for passwords and
signed bearer tokens. For a larger deployment, replace the local user store with
OIDC/Entra ID/Keycloak and keep the same role/permission claims contract.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, time
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
AUTH_FILE = BASE / "data" / "auth_users.json"
SECRET = os.getenv("PMS_AUTH_SECRET", "change-this-secret-before-production").encode()
TOKEN_TTL = int(os.getenv("PMS_TOKEN_TTL_SECONDS", "28800"))
AUTH_REQUIRED = os.getenv("PMS_AUTH_REQUIRED", "false").lower() == "true"


def _load():
    if not AUTH_FILE.exists():
        return {}
    try: return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save(data):
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUTH_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 310_000).hex()
    return salt, digest

def verify_password(password: str, salt: str, digest: str):
    _, got = hash_password(password, salt)
    return hmac.compare_digest(got, digest)

def seed_admin():
    data = _load()
    if data: return data
    username = os.getenv("PMS_BOOTSTRAP_ADMIN", "admin")
    password = os.getenv("PMS_BOOTSTRAP_PASSWORD", "change-me-now")
    salt, digest = hash_password(password)
    data[username] = {"username": username, "role": "مدير عام", "salt": salt, "passwordHash": digest, "active": True}
    _save(data)
    return data

def _b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()).rstrip(b"=").decode()

def issue_token(user: dict[str, Any]):
    now = int(time.time())
    header = _b64({"alg":"HS256","typ":"JWT"})
    payload = _b64({"sub":user["username"],"role":user["role"],"iat":now,"exp":now+TOKEN_TTL})
    msg = f"{header}.{payload}".encode()
    sig = base64.urlsafe_b64encode(hmac.new(SECRET, msg, hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{header}.{payload}.{sig}"

def decode_token(token: str):
    try:
        header, payload, sig = token.split(".")
        expected = base64.urlsafe_b64encode(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
        if not hmac.compare_digest(sig, expected): return None
        raw = base64.urlsafe_b64decode(payload + "===")
        data = json.loads(raw)
        if int(data.get("exp", 0)) < int(time.time()): return None
        return data
    except Exception:
        return None


# Server-side RBAC contract. The UI may hide controls, but these permissions are
# authoritative at the API boundary and must be checked before sensitive actions.
ROLE_PERMISSIONS = {
    "مدير عام": {"apex.commander", "apex.forecast", "apex.ai", "reality.control"},
    "مالك الشركة": {"apex.commander", "apex.forecast", "apex.ai", "reality.control"},
    "مدير PMO": {"apex.commander", "apex.forecast", "apex.ai", "reality.control"},
    "مدير المشروع": {"apex.forecast", "apex.ai", "reality.control"},
    "PM1": {"reality.control"},
    "Executive": {"apex.commander", "apex.forecast", "apex.ai", "reality.control"},
    "APEX Commander": {"apex.commander", "apex.forecast", "apex.ai", "reality.control"},
}

def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(str(role or ""), set())

def permissions_for(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(str(role or ""), set()))
