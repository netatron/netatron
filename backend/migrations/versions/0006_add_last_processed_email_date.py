"""add last_processed_email_date to email_invoice_configs

Revision ID: 0006_last_email_date
Revises: 0005_drop_google_drive
Create Date: 2025-12-19
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_last_email_date"
down_revision = "0005_drop_google_drive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("email_invoice_configs") as batch_op:
        batch_op.add_column(sa.Column("last_processed_email_date", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("email_invoice_configs") as batch_op:
        batch_op.drop_column("last_processed_email_date")

