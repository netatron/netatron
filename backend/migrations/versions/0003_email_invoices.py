"""email invoices tables

Revision ID: 0003_email_invoices
Revises: 0002_job_result_rows
Create Date: 2025-12-10 12:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_email_invoices"
down_revision: Union[str, None] = "0002_job_result_rows"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Email Invoice Configs table
    op.create_table(
        "email_invoice_configs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("imap_host", sa.String(), nullable=False),
        sa.Column("imap_port", sa.Integer(), nullable=False, server_default="993"),
        sa.Column("imap_user", sa.String(), nullable=False),
        sa.Column("imap_password", sa.String(), nullable=False),
        sa.Column("imap_folder", sa.String(), nullable=False, server_default="INBOX"),
        sa.Column("google_drive_folder_id", sa.String(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("last_check_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    )
    op.create_index(op.f("ix_email_invoice_configs_tenant_id"), "email_invoice_configs", ["tenant_id"], unique=False)

    # Email Invoice Runs table
    op.create_table(
        "email_invoice_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("config_id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("processed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["config_id"], ["email_invoice_configs.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    )
    op.create_index(op.f("ix_email_invoice_runs_config_id"), "email_invoice_runs", ["config_id"], unique=False)
    op.create_index(op.f("ix_email_invoice_runs_tenant_id"), "email_invoice_runs", ["tenant_id"], unique=False)

    # Email Invoice Logs table
    op.create_table(
        "email_invoice_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("level", sa.String(), nullable=False, server_default="info"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["email_invoice_runs.id"]),
    )
    op.create_index(op.f("ix_email_invoice_logs_run_id"), "email_invoice_logs", ["run_id"], unique=False)
    op.create_index(op.f("ix_email_invoice_logs_created_at"), "email_invoice_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_invoice_logs_created_at"), table_name="email_invoice_logs")
    op.drop_index(op.f("ix_email_invoice_logs_run_id"), table_name="email_invoice_logs")
    op.drop_table("email_invoice_logs")
    
    op.drop_index(op.f("ix_email_invoice_runs_tenant_id"), table_name="email_invoice_runs")
    op.drop_index(op.f("ix_email_invoice_runs_config_id"), table_name="email_invoice_runs")
    op.drop_table("email_invoice_runs")
    
    op.drop_index(op.f("ix_email_invoice_configs_tenant_id"), table_name="email_invoice_configs")
    op.drop_table("email_invoice_configs")

