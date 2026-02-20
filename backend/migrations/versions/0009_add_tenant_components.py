"""add tenant components

Revision ID: 0009_tenant_components
Revises: 0008_add_email_invoice_monitoring_and_duplicates
Create Date: 2026-01-07 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0009_tenant_components'
down_revision: Union[str, None] = '0008_email_invoice_monitoring'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add enabled_components and company_name to tenants table
    op.add_column('tenants', sa.Column('enabled_components', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('tenants', sa.Column('company_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'company_name')
    op.drop_column('tenants', 'enabled_components')

