"""add email invoice monitoring and duplicates support

Revision ID: 0008_email_invoice_monitoring
Revises: 0007_tenant_usage_stats
Create Date: 2024-12-20
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_email_invoice_monitoring"
down_revision = "0007_tenant_usage_stats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add monitoring_enabled and total_processed_count to email_invoice_configs
    op.add_column("email_invoice_configs", sa.Column("monitoring_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("email_invoice_configs", sa.Column("total_processed_count", sa.Integer(), nullable=False, server_default="0"))
    
    # Create table for tracking processed PDF hashes (duplicate detection)
    op.create_table(
        "email_invoice_pdf_hashes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("config_id", sa.String(), nullable=False),
        sa.Column("pdf_hash", sa.String(), nullable=False),  # SHA256 hash of PDF content
        sa.Column("filename", sa.String(), nullable=True),
        sa.Column("invoice_number", sa.String(), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("vendor", sa.String(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("storage_path", sa.String(), nullable=False),  # Path where PDF is stored
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["config_id"], ["email_invoice_configs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_invoice_pdf_hashes_tenant_id", "email_invoice_pdf_hashes", ["tenant_id"])
    op.create_index("ix_email_invoice_pdf_hashes_config_id", "email_invoice_pdf_hashes", ["config_id"])
    op.create_index("ix_email_invoice_pdf_hashes_hash", "email_invoice_pdf_hashes", ["pdf_hash"])
    # Unique constraint: same hash cannot be processed twice for same config
    op.create_index("ix_email_invoice_pdf_hashes_unique", "email_invoice_pdf_hashes", ["config_id", "pdf_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_email_invoice_pdf_hashes_unique", table_name="email_invoice_pdf_hashes")
    op.drop_index("ix_email_invoice_pdf_hashes_hash", table_name="email_invoice_pdf_hashes")
    op.drop_index("ix_email_invoice_pdf_hashes_config_id", table_name="email_invoice_pdf_hashes")
    op.drop_index("ix_email_invoice_pdf_hashes_tenant_id", table_name="email_invoice_pdf_hashes")
    op.drop_table("email_invoice_pdf_hashes")
    op.drop_column("email_invoice_configs", "total_processed_count")
    op.drop_column("email_invoice_configs", "monitoring_enabled")

