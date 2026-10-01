
"""APEX enterprise contracts: tenant isolation, audit/evidence and AI action policy.
This module is intentionally dependency-light so the existing local engine remains usable."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

ActionMode = Literal["advisory","controlled","disabled"]

@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    user_id: str
    roles: tuple[str,...]
    scopes: tuple[str,...]

@dataclass(frozen=True)
class EvidenceRef:
    evidence_id: str
    source_type: str
    source_id: str
    captured_at: str
    content_hash: str

def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def ai_action_allowed(ctx: TenantContext, action: str, mode: ActionMode) -> bool:
    """High-impact actions are never approved solely by an AI agent."""
    high_impact = {"approve_change_order","approve_payment","publish_contract","delete_project","accept_survey"}
    if action in high_impact:
        return False
    return mode in ("advisory","controlled")
