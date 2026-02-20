from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Tenant:
    id: str
    name: str


@dataclass
class UserProfile:
    id: str
    tenant_id: str
    google_sub: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class TenancyService:
    """
    Simple in-memory tenancy registry.
    Provides deterministic tenant ids based on email until Cloud SQL is ready.
    """

    def __init__(self, allowed_emails: List[str]):
        self.allowed_emails = {email.lower() for email in allowed_emails}
        self._tenants: Dict[str, Tenant] = {}
        self._users_by_sub: Dict[str, UserProfile] = {}
        self._users_by_email: Dict[str, UserProfile] = {}

    def is_email_allowed(self, email: str) -> bool:
        return email.lower() in self.allowed_emails

    def _tenant_id_for_email(self, email: str) -> str:
        return uuid.uuid5(uuid.NAMESPACE_DNS, email.lower()).hex

    def tenant_id_for_email(self, email: str) -> str:
        """Expose deterministic tenant id generation for integration layers."""
        return self._tenant_id_for_email(email)

    def _get_or_create_tenant(self, email: str) -> Tenant:
        tenant_id = self._tenant_id_for_email(email)
        if tenant_id not in self._tenants:
            name = email.split("@", 1)[-1]
            self._tenants[tenant_id] = Tenant(id=tenant_id, name=name)
        return self._tenants[tenant_id]

    def ensure_user(self, *, google_sub: str, email: str, name: Optional[str], picture: Optional[str]) -> UserProfile:
        lowered = email.lower()
        if not self.is_email_allowed(email):
            raise PermissionError("Email is not allowed.")
        if google_sub in self._users_by_sub:
            user = self._users_by_sub[google_sub]
            user.name = name or user.name
            user.avatar_url = picture or user.avatar_url
            return user

        existing = self._users_by_email.get(lowered)
        if existing:
            self._users_by_sub[google_sub] = existing
            return existing

        tenant = self._get_or_create_tenant(email)
        user = UserProfile(
            id=uuid.uuid4().hex,
            tenant_id=tenant.id,
            google_sub=google_sub,
            email=email,
            name=name,
            avatar_url=picture,
        )
        self._users_by_sub[google_sub] = user
        self._users_by_email[lowered] = user
        return user

    def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        return self._tenants.get(tenant_id)
