"""job result rows table

Revision ID: 0002_job_result_rows
Revises: 0001_initial
Create Date: 2025-12-06 21:45:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_job_result_rows"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_result_rows",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    )
    op.create_index(op.f("ix_job_result_rows_job_id"), "job_result_rows", ["job_id"], unique=False)
    op.create_index(op.f("ix_job_result_rows_tenant_id"), "job_result_rows", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_job_result_rows_tenant_id"), table_name="job_result_rows")
    op.drop_index(op.f("ix_job_result_rows_job_id"), table_name="job_result_rows")
    op.drop_table("job_result_rows")

