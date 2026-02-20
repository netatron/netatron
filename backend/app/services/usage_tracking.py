"""
Usage tracking service for tenant-level API usage and cost monitoring
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..db import models


def record_openai_usage(
    db: Session,
    tenant_id: str,
    input_tokens: int,
    output_tokens: int,
    module: str = "unknown",
) -> None:
    """Record OpenAI API usage for a tenant"""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get or create today's stats
    stats = db.query(models.TenantUsageStats).filter(
        models.TenantUsageStats.tenant_id == tenant_id,
        models.TenantUsageStats.date == today
    ).first()
    
    if not stats:
        stats = models.TenantUsageStats(
            tenant_id=tenant_id,
            date=today,
            openai_input_tokens=0,
            openai_output_tokens=0,
            openai_requests=0,
            openai_cost=0.0,
            google_maps_queries=0,
            google_maps_cost=0.0,
            web_scraping_requests=0,
            rejestr_requests=0,
            module_usage={},
        )
        db.add(stats)
    
    # Update stats
    stats.openai_input_tokens += input_tokens
    stats.openai_output_tokens += output_tokens
    stats.openai_requests += 1
    
    # Calculate cost: GPT-4o-mini pricing
    # Input: $0.15 per 1M tokens, Output: $0.60 per 1M tokens
    input_cost = (input_tokens / 1_000_000) * 0.15
    output_cost = (output_tokens / 1_000_000) * 0.60
    stats.openai_cost += input_cost + output_cost
    
    # Track per module
    if module not in stats.module_usage:
        stats.module_usage[module] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}
    
    stats.module_usage[module]["input_tokens"] += input_tokens
    stats.module_usage[module]["output_tokens"] += output_tokens
    stats.module_usage[module]["cost"] += input_cost + output_cost
    
    db.commit()


def record_google_maps_usage(
    db: Session,
    tenant_id: str,
    queries: int = 1,
) -> None:
    """Record Google Maps API usage for a tenant"""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get or create today's stats
    stats = db.query(models.TenantUsageStats).filter(
        models.TenantUsageStats.tenant_id == tenant_id,
        models.TenantUsageStats.date == today
    ).first()
    
    if not stats:
        stats = models.TenantUsageStats(
            tenant_id=tenant_id,
            date=today,
            openai_input_tokens=0,
            openai_output_tokens=0,
            openai_requests=0,
            openai_cost=0.0,
            google_maps_queries=0,
            google_maps_cost=0.0,
            web_scraping_requests=0,
            rejestr_requests=0,
            module_usage={},
        )
        db.add(stats)
    
    # Update stats
    stats.google_maps_queries += queries
    # Estimate cost: $20 per 1000 queries (average of Text Search, Place Details, etc.)
    stats.google_maps_cost += (queries / 1000) * 20.0
    
    db.commit()


def get_tenant_usage_period(
    db: Session,
    tenant_id: str,
    start_date: datetime,
    end_date: datetime,
) -> dict:
    """Get aggregated usage stats for a tenant in a date range"""
    stats_list = db.query(models.TenantUsageStats).filter(
        models.TenantUsageStats.tenant_id == tenant_id,
        models.TenantUsageStats.date >= start_date,
        models.TenantUsageStats.date <= end_date
    ).all()
    
    if not stats_list:
        return {
            "openai_input_tokens": 0,
            "openai_output_tokens": 0,
            "openai_requests": 0,
            "openai_cost": 0.0,
            "google_maps_queries": 0,
            "google_maps_cost": 0.0,
            "total_cost": 0.0,
            "module_usage": {},
        }
    
    # Aggregate
    total_input = sum(s.openai_input_tokens for s in stats_list)
    total_output = sum(s.openai_output_tokens for s in stats_list)
    total_requests = sum(s.openai_requests for s in stats_list)
    total_openai_cost = sum(s.openai_cost for s in stats_list)
    total_maps_queries = sum(s.google_maps_queries for s in stats_list)
    total_maps_cost = sum(s.google_maps_cost for s in stats_list)
    
    # Aggregate module usage
    module_usage = {}
    for stats in stats_list:
        for module, usage in stats.module_usage.items():
            if module not in module_usage:
                module_usage[module] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}
            module_usage[module]["input_tokens"] += usage.get("input_tokens", 0)
            module_usage[module]["output_tokens"] += usage.get("output_tokens", 0)
            module_usage[module]["cost"] += usage.get("cost", 0.0)
    
    return {
        "openai_input_tokens": total_input,
        "openai_output_tokens": total_output,
        "openai_requests": total_requests,
        "openai_cost": total_openai_cost,
        "google_maps_queries": total_maps_queries,
        "google_maps_cost": total_maps_cost,
        "total_cost": total_openai_cost + total_maps_cost,
        "module_usage": module_usage,
    }


def get_all_tenants_usage_period(
    db: Session,
    start_date: datetime,
    end_date: datetime,
) -> dict:
    """Get aggregated usage stats for all tenants in a date range"""
    stats_list = db.query(models.TenantUsageStats).filter(
        models.TenantUsageStats.date >= start_date,
        models.TenantUsageStats.date <= end_date
    ).all()
    
    # Group by tenant
    tenant_stats = {}
    for stats in stats_list:
        if stats.tenant_id not in tenant_stats:
            tenant_stats[stats.tenant_id] = {
                "openai_input_tokens": 0,
                "openai_output_tokens": 0,
                "openai_requests": 0,
                "openai_cost": 0.0,
                "google_maps_queries": 0,
                "google_maps_cost": 0.0,
                "module_usage": {},
            }
        
        t = tenant_stats[stats.tenant_id]
        t["openai_input_tokens"] += stats.openai_input_tokens
        t["openai_output_tokens"] += stats.openai_output_tokens
        t["openai_requests"] += stats.openai_requests
        t["openai_cost"] += stats.openai_cost
        t["google_maps_queries"] += stats.google_maps_queries
        t["google_maps_cost"] += stats.google_maps_cost
        
        # Aggregate module usage
        for module, usage in stats.module_usage.items():
            if module not in t["module_usage"]:
                t["module_usage"][module] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}
            t["module_usage"][module]["input_tokens"] += usage.get("input_tokens", 0)
            t["module_usage"][module]["output_tokens"] += usage.get("output_tokens", 0)
            t["module_usage"][module]["cost"] += usage.get("cost", 0.0)
    
    return tenant_stats

