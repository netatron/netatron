"""add pause stop flags to email invoice runs

Revision ID: 0004_add_pause_stop_flags
Revises: 0003_email_invoices
Create Date: 2025-12-16 14:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_add_pause_stop_flags"
down_revision: Union[str, None] = "0003_email_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add pause_requested and stop_requested columns to email_invoice_runs table
    op.add_column("email_invoice_runs", sa.Column("pause_requested", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("email_invoice_runs", sa.Column("stop_requested", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    # Remove pause_requested and stop_requested columns
    op.drop_column("email_invoice_runs", "stop_requested")
    op.drop_column("email_invoice_runs", "pause_requested")

