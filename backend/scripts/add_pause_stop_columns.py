#!/usr/bin/env python3
"""Script to manually add pause_requested and stop_requested columns to email_invoice_runs table"""
import sys
import os

# Add backend to path - script is in backend/scripts/, so go up one level
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
sys.path.insert(0, backend_dir)

# Change to backend directory
os.chdir(backend_dir)

from app.db.session import SessionLocal
from sqlalchemy import text

def main():
    db = SessionLocal()
    try:
        print("[MIGRATE] Adding pause_requested column...")
        db.execute(text("ALTER TABLE email_invoice_runs ADD COLUMN IF NOT EXISTS pause_requested BOOLEAN NOT NULL DEFAULT false"))
        
        print("[MIGRATE] Adding stop_requested column...")
        db.execute(text("ALTER TABLE email_invoice_runs ADD COLUMN IF NOT EXISTS stop_requested BOOLEAN NOT NULL DEFAULT false"))
        
        db.commit()
        print("[MIGRATE] SUCCESS: Columns added successfully")
        
        # Update Alembic version
        print("[MIGRATE] Updating Alembic version...")
        result = db.execute(text("SELECT version_num FROM alembic_version"))
        current_version = result.scalar()
        print(f"[MIGRATE] Current Alembic version: {current_version}")
        
        if current_version == "0003_email_invoices":
            db.execute(text("UPDATE alembic_version SET version_num = '0004_add_pause_stop_flags' WHERE version_num = '0003_email_invoices'"))
            db.commit()
            print("[MIGRATE] SUCCESS: Alembic version updated to 0004_add_pause_stop_flags")
        else:
            print(f"[MIGRATE] WARNING: Current version is {current_version}, not updating Alembic version")
        
    except Exception as e:
        print(f"[MIGRATE] ERROR: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()

