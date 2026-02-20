"""add tenant_usage_stats table

Revision ID: 0007_tenant_usage_stats
Revises: 0006_last_email_date
Create Date: 2024-12-19
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_tenant_usage_stats"
down_revision = "0006_last_email_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_usage_stats",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("openai_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("openai_output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("openai_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("openai_cost", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("google_maps_queries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("google_maps_cost", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("web_scraping_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejestr_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("module_usage", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_usage_stats_tenant_id", "tenant_usage_stats", ["tenant_id"])
    op.create_index("ix_tenant_usage_stats_date", "tenant_usage_stats", ["date"])


def downgrade() -> None:
    op.drop_index("ix_tenant_usage_stats_date", table_name="tenant_usage_stats")
    op.drop_index("ix_tenant_usage_stats_tenant_id", table_name="tenant_usage_stats")
    op.drop_table("tenant_usage_stats")

