"""
Simple password-based authentication for development
Bypasses Google OAuth when DISABLE_GOOGLE_AUTH=true
"""

import os
import hashlib
from typing import Dict, Any

logger = None
try:
    import logging
    logger = logging.getLogger(__name__)
except:
    pass

DEV_PASSWORD = os.getenv("DEV_PASSWORD", "admin1")
DEV_USERNAME = os.getenv("DEV_USERNAME", "admin")
DISABLE_GOOGLE_AUTH = os.getenv("DISABLE_GOOGLE_AUTH", "false").lower() == "true"

def verify_simple_auth(username: str = None, password: str = None, token: str = None, tenant_id: str = None) -> Dict[str, Any]:
    """
    Simple username/password verification for dev mode.
    
    Can accept either:
    - username and password (new way)
    - token as password (old way, for backward compatibility)
    - tenant_id to check tenant-specific credentials
    
    Returns a mock user profile when credentials match.
    
    Note: Simple auth can now be used alongside Google OAuth - it's no longer exclusive.
    """
    # Simple auth is now always available, even when Google OAuth is enabled
    
    # New way: username + password
    if username is not None and password is not None:
        # First check default dev credentials
        if username == DEV_USERNAME and password == DEV_PASSWORD:
            # Return default dev user
            import os
            allowed_emails = os.getenv("ALLOWED_EMAILS", "")
            if allowed_emails:
                email = allowed_emails.split(",")[0].strip()
            else:
                email = "admin@localhost"
            
            return {
                "sub": "dev-user-123",
                "email": email,
                "name": "Dev User",
                "picture": None,
                "email_verified": True,
            }
        
        # Check tenant-specific credentials by searching all tenants
        # We'll iterate through all possible tenant secrets to find a match
        try:
            from google.cloud import secretmanager
            import os
            
            project_id = os.getenv("GOOGLE_PROJECT_ID")
            if project_id:
                secret_client = secretmanager.SecretManagerServiceClient()
                parent = f"projects/{project_id}"
                
                # List all tenant username secrets
                try:
                    secrets = secret_client.list_secrets(request={"parent": parent})
                    for secret in secrets:
                        secret_id = secret.name.split("/")[-1]
                        if secret_id.startswith("tenant-") and secret_id.endswith("-username"):
                            # Extract tenant_id from secret name
                            tenant_id_from_secret = secret_id.replace("tenant-", "").replace("-username", "")
                            
                            try:
                                # Get username
                                username_secret_name = f"{secret.name}/versions/latest"
                                username_response = secret_client.access_secret_version(request={"name": username_secret_name})
                                stored_username = username_response.payload.data.decode("utf-8")
                                
                                # Get password
                                password_secret_id = f"tenant-{tenant_id_from_secret}-password"
                                password_secret_name = f"projects/{project_id}/secrets/{password_secret_id}/versions/latest"
                                password_response = secret_client.access_secret_version(request={"name": password_secret_name})
                                stored_password = password_response.payload.data.decode("utf-8")
                                
                                # Get email
                                email_secret_id = f"tenant-{tenant_id_from_secret}-email"
                                email_secret_name = f"projects/{project_id}/secrets/{email_secret_id}/versions/latest"
                                email_response = secret_client.access_secret_version(request={"name": email_secret_name})
                                stored_email = email_response.payload.data.decode("utf-8")
                                
                                # Verify credentials
                                if username == stored_username and password == stored_password:
                                    # Get tenant info from database
                                    from app.db.session import SessionLocal
                                    from app.db import models
                                    
                                    db = SessionLocal()
                                    try:
                                        tenant = db.get(models.Tenant, tenant_id_from_secret)
                                        if tenant:
                                            return {
                                                "sub": f"tenant-user-{tenant_id_from_secret}",
                                                "email": stored_email,
                                                "name": tenant.company_name or tenant.name,
                                                "picture": None,
                                                "email_verified": True,
                                                "tenant_id": tenant_id_from_secret,
                                            }
                                    finally:
                                        db.close()
                            except Exception as e:
                                if logger:
                                    logger.debug(f"Failed to check tenant {tenant_id_from_secret}: {e}")
                                continue
                except Exception as e:
                    if logger:
                        logger.debug(f"Failed to list tenant secrets: {e}")
        except Exception as e:
            if logger:
                logger.warning(f"Failed to check tenant credentials: {e}")
        
        # If no match found, raise error
        raise ValueError("Invalid username or password")
    
    # Old way: token as password (backward compatibility)
    elif token is not None:
        if token != DEV_PASSWORD:
            raise ValueError("Invalid password")
        
        # Return default dev user
        import os
        allowed_emails = os.getenv("ALLOWED_EMAILS", "")
        if allowed_emails:
            email = allowed_emails.split(",")[0].strip()
        else:
            email = "admin@localhost"
        
        return {
            "sub": "dev-user-123",
            "email": email,
            "name": "Dev User",
            "picture": None,
            "email_verified": True,
        }
    else:
        raise ValueError("Either username/password or token must be provided")

