"""drop google_drive_folder_id from email_invoice_configs

Revision ID: 0005_drop_google_drive
Revises: 0004_add_pause_stop_flags_to_email_invoice_runs
Create Date: 2025-12-17
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_drop_google_drive"
down_revision = "0004_add_pause_stop_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("email_invoice_configs") as batch_op:
        batch_op.drop_column("google_drive_folder_id")


def downgrade() -> None:
    with op.batch_alter_table("email_invoice_configs") as batch_op:
        batch_op.add_column(sa.Column("google_drive_folder_id", sa.String(), nullable=False, server_default=""))
        batch_op.alter_column("google_drive_folder_id", server_default=None)

