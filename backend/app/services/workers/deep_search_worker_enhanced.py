"""
Enhanced Deep Search Worker with Event Streaming
Wrapper around existing deep_search_worker that emits SSE events.
Does not modify the original worker logic.
"""
from __future__ import annotations

import logging
from typing import Dict, List

from app.repos.job_repository import JobRepository
from app.services.event_stream import emit_event
from app.services.storage import StorageClient
from app.services.robots_checker import get_robots_checker
from app.services.workers.deep_search_worker import (
    _build_payload,
    _expand_queries,
    _iter_records,
    run_deep_search_job as original_run_deep_search_job,
)

logger = logging.getLogger(__name__)

# Bot identification
BOT_USER_AGENT = "NetatronBot/1.0 (+https://netatron.ai/bot; contact@netatron.ai)"


def run_deep_search_job(
    repo: JobRepository, 
    job_id: str, 
    storage: StorageClient
) -> None:
    """
    Enhanced deep search worker that emits SSE events.
    Wraps the original worker and adds event emission.
    """
    job = repo.get_job_by_id(job_id)
    if not job:
        return

    params = job.params or {}
    query = (params.get("query") or "").strip()
    if not query:
        repo.set_error(job, "Brak zapytania dla Deep Search.")
        emit_event(job_id, "error", {"error": "Brak zapytania dla Deep Search."})
        return

    desired = params.get("limit") or job.desired_results or 25
    try:
        desired = max(1, min(int(desired), 200))
    except Exception:
        desired = 25

    # Emit search started event
    logger.info(f"[DeepSearch] Emitting search_started event for job {job_id}")
    emit_event(job_id, "search", {
        "query": query,
        "limit": desired,
        "action_description": f"Starting Deep Search for: {query}",
    })

    queries = _expand_queries(query)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Start Deep Search dla '{query}' ({len(queries)} wariantów).")
    repo.update_status(job, "running", progress=0.0)

    leads: List[Dict[str, str]] = []
    for idx, variant in enumerate(queries, start=1):
        repo.refresh(job)
        if job.stop_requested:
            repo.update_status(job, "stopped")
            repo.add_log(job=job, tenant_id=job.tenant_id, message="Zatrzymano na żądanie użytkownika.")
            emit_event(job_id, "error", {"error": "Zatrzymano na żądanie użytkownika."})
            return
        
        while job.pause_requested and not job.stop_requested:
            repo.update_status(job, "paused")
            emit_event(job_id, "progress", {
                "progress": len(leads) / float(desired) if desired else 0,
                "status": "paused",
            })
            import time
            time.sleep(0.5)
            repo.refresh(job)
        
        repo.update_status(job, "running")

        # Emit search variant event
        emit_event(job_id, "search", {
            "query": variant,
            "variant_index": idx,
            "total_variants": len(queries),
            "action_description": f"[{idx}/{len(queries)}] Searching: {variant}",
        })

        repo.add_log(job=job, tenant_id=job.tenant_id, message=f"[{idx}/{len(queries)}] Szukam: {variant}")
        
        from app.services.enrichment import search_web_candidates
        candidates = search_web_candidates(variant, limit=6)
        
        if not candidates:
            repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Brak kandydatów dla '{variant}'.")
            emit_event(job_id, "search", {
                "query": variant,
                "results_count": 0,
                "action_description": f"No candidates found for: {variant}",
            })
            continue

        emit_event(job_id, "search", {
            "query": variant,
            "results_count": len(candidates),
            "action_description": f"Found {len(candidates)} candidates for: {variant}",
        })

        for cand_idx, cand in enumerate(candidates, start=1):
            repo.refresh(job)
            if job.stop_requested:
                break

            url = cand.get("url") or cand.get("website") or ""
            title = cand.get("title") or cand.get("name") or ""
            
            # Emit navigate event
            emit_event(job_id, "navigate", {
                "url": url,
                "title": title,
                "action_description": f"Navigating to candidate {cand_idx}/{len(candidates)}: {url}",
            })

            # Check robots.txt before fetching
            robots_checker = get_robots_checker()
            can_fetch, crawl_delay = robots_checker.can_fetch(url, BOT_USER_AGENT)
            
            if not can_fetch:
                logger.warning(f"robots.txt disallows scraping {url}")
                repo.add_log(job=job, tenant_id=job.tenant_id, message=f"⚠️ robots.txt zabrania scrapowania: {url}")
                emit_event(job_id, "fetch", {
                    "url": url,
                    "html_preview": "",
                    "status_code": 403,
                    "action_description": f"robots.txt disallows scraping: {url}",
                })
                continue  # Skip this URL
            
            # Respect rate limiting and crawl-delay
            robots_checker.wait_for_rate_limit(url, min_delay=crawl_delay)
            
            # Fetch HTML content for visualization
            html_preview = ""
            status_code = 200
            try:
                import requests
                from bs4 import BeautifulSoup
                
                headers = {
                    "User-Agent": BOT_USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
                }
                resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
                status_code = resp.status_code
                
                # Handle 429 Too Many Requests
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get('Retry-After', '60'))
                    logger.warning(f"429 Too Many Requests for {url}, waiting {retry_after}s")
                    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"⚠️ Zbyt wiele requestów dla {url}, czekam {retry_after}s")
                    emit_event(job_id, "fetch", {
                        "url": url,
                        "html_preview": "",
                        "status_code": 429,
                        "action_description": f"429 Too Many Requests, waiting {retry_after}s",
                    })
                    import time
                    time.sleep(retry_after)
                    # Retry once after waiting
                    resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
                    status_code = resp.status_code
                    
                    # Handle 429 on retry as well
                    if resp.status_code == 429:
                        logger.warning(f"429 Too Many Requests for {url} (retry also failed)")
                        repo.add_log(job=job, tenant_id=job.tenant_id, message=f"⚠️ 429 dla {url} - pomijam")
                        emit_event(job_id, "fetch", {
                            "url": url,
                            "html_preview": "",
                            "status_code": 429,
                            "action_description": f"429 Too Many Requests - skipping",
                        })
                        continue  # Skip this URL
                
                if resp.status_code == 200:
                    html_content = resp.text
                    
                    # Parse HTML and inject cookie consent auto-accept script
                    soup = BeautifulSoup(html_content, 'html.parser')
                    
                    # Add base tag to fix relative URLs (CSS, fonts, images)
                    if soup.head:
                        # Remove existing base tag if any
                        existing_base = soup.find('base')
                        if existing_base:
                            existing_base.decompose()
                        
                        # Add base tag with original URL
                        base_tag = soup.new_tag('base', attrs={'href': url})
                        soup.head.insert(0, base_tag)
                        logger.debug(f"Added base tag with URL: {url}")
                    
                    # Inject viewport meta tag if missing
                    if not soup.find('meta', attrs={'name': 'viewport'}):
                        viewport = soup.new_tag('meta', attrs={'name': 'viewport', 'content': 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'})
                        if soup.head:
                            soup.head.insert(1, viewport)  # Insert after base tag
                    
                    # Inject auto-accept cookie consent script
                    cookie_script = soup.new_tag('script')
                    cookie_script.string = """
                    (function() {
                        // Auto-accept cookie consent popups
                        const acceptSelectors = [
                            'button[id*="accept"]', 'button[class*="accept"]',
                            'button[id*="cookie"]', 'button[class*="cookie"]',
                            'button[id*="consent"]', 'button[class*="consent"]',
                            'a[id*="accept"]', 'a[class*="accept"]',
                            '[id*="cookie-accept"]', '[class*="cookie-accept"]',
                            '[id*="consent-accept"]', '[class*="consent-accept"]',
                            '[id*="rodo-accept"]', '[class*="rodo-accept"]',
                            '.cookie-banner button', '.consent-banner button',
                            '#cookieConsent button', '#consentBanner button'
                        ];
                        
                        function acceptCookies() {
                            acceptSelectors.forEach(selector => {
                                try {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        const text = (el.textContent || '').toLowerCase();
                                        if (text.includes('accept') || text.includes('akceptuj') || 
                                            text.includes('zgadzam') || text.includes('ok') ||
                                            text.includes('przejdź') || text.includes('kontynuuj')) {
                                            el.click();
                                        }
                                    });
                                } catch(e) {}
                            });
                            
                            // Also try to find and click common cookie banner buttons
                            const banners = document.querySelectorAll('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"]');
                            banners.forEach(banner => {
                                const buttons = banner.querySelectorAll('button, a');
                                buttons.forEach(btn => {
                                    const text = (btn.textContent || '').toLowerCase();
                                    if (text.includes('accept') || text.includes('akceptuj') || 
                                        text.includes('zgadzam') || text.includes('ok')) {
                                        btn.click();
                                    }
                                });
                            });
                        }
                        
                        // Try immediately and after DOM ready
                        acceptCookies();
                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', acceptCookies);
                        }
                        setTimeout(acceptCookies, 500);
                        setTimeout(acceptCookies, 1500);
                    })();
                    """
                    if soup.head:
                        soup.head.append(cookie_script)
                    
                    # Inject scaling CSS
                    scale_style = soup.new_tag('style')
                    scale_style.string = """
                    body {
                        transform-origin: top left;
                        width: 100% !important;
                        max-width: 100% !important;
                        overflow-x: hidden !important;
                    }
                    * {
                        box-sizing: border-box;
                    }
                    """
                    if soup.head:
                        soup.head.append(scale_style)
                    
                    # Convert relative URLs to absolute URLs for CSS, fonts, and images
                    from urllib.parse import urljoin, urlparse
                    parsed_url = urlparse(url)
                    base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
                    
                    # Fix link tags (CSS, fonts)
                    for link in soup.find_all('link', href=True):
                        href = link.get('href', '')
                        if href and not href.startswith(('http://', 'https://', '//', 'data:', 'javascript:')):
                            link['href'] = urljoin(url, href)
                    
                    # Fix script tags
                    for script in soup.find_all('script', src=True):
                        src = script.get('src', '')
                        if src and not src.startswith(('http://', 'https://', '//', 'data:', 'javascript:')):
                            script['src'] = urljoin(url, src)
                    
                    # Fix img tags
                    for img in soup.find_all('img', src=True):
                        src = img.get('src', '')
                        if src and not src.startswith(('http://', 'https://', '//', 'data:', 'javascript:')):
                            img['src'] = urljoin(url, src)
                    
                    # Fix @import in style tags
                    for style in soup.find_all('style'):
                        if style.string:
                            # Simple regex to find @import url(...)
                            import re
                            def replace_import(match):
                                import_url = match.group(1).strip("'\"")
                                if import_url and not import_url.startswith(('http://', 'https://', '//')):
                                    return f"@import url('{urljoin(url, import_url)}')"
                                return match.group(0)
                            style.string = re.sub(r"@import\s+url\(['\"]?([^'\"]+)['\"]?\)", replace_import, style.string)
                    
                    logger.debug(f"Converted relative URLs to absolute for base: {base_url}")
                    
                    # Get processed HTML (limit to reasonable size for preview)
                    html_preview = str(soup)[:50000]  # Increased limit for better preview
                    logger.debug(f"Fetched and processed HTML preview for {url} ({len(html_preview)} chars)")
            except Exception as e:
                logger.warning(f"Failed to fetch HTML for {url}: {e}")
                status_code = 0
                html_preview = f"<!-- Error fetching HTML: {str(e)[:100]} -->"

            # Emit fetch event with HTML preview
            emit_event(job_id, "fetch", {
                "url": url,
                "html_preview": html_preview,
                "status_code": status_code,
                "action_description": f"Fetched HTML content from: {url} (status: {status_code})",
            })

            payload = _build_payload(variant, cand)
            
            # Emit parse event
            emit_event(job_id, "parse", {
                "url": url,
                "action_description": f"Parsing contact information from: {url}",
            })

            # Emit AI call event
            emit_event(job_id, "ai_call", {
                "url": url,
                "company_name": payload.get("name", ""),
                "action_description": f"Calling AI for data extraction from: {url}",
            })

            from app.services.enrichment import enrich_company_profile
            enriched = enrich_company_profile(payload, {"enhance_with_rejestr": False}, status_callback=None)
            
            leads.append(enriched)
            
            # Emit result event
            emit_event(job_id, "result", {
                "result": enriched,
                "url": url,
                "query": variant,
                "action_description": f"Extracted company data: {enriched.get('name', 'Unknown')}",
            })

            if hasattr(repo, 'add_result_row') and getattr(repo, 'ENABLE_ROW_RESULTS', False):
                from app.config import ENABLE_ROW_RESULTS
                if ENABLE_ROW_RESULTS:
                    repo.add_result_row(job=job, tenant_id=job.tenant_id, payload=enriched)
            
            progress = min(0.95, len(leads) / float(desired))
            repo.update_progress(job, progress)
            
            # Emit progress event
            emit_event(job_id, "progress", {
                "progress": progress,
                "results_count": len(leads),
                "target_count": desired,
            })
            
            if desired and len(leads) >= desired:
                break
        
        if desired and len(leads) >= desired:
            break

    snapshot = _iter_records(leads)
    uri = storage.save_records(job.tenant_id, job.id, snapshot)
    repo.attach_storage(job, uri)
    repo.add_result_metadata(job=job, tenant_id=job.tenant_id, kind="csv", uri=uri, row_count=len(snapshot))
    repo.update_status(job, "completed", progress=1.0)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Deep Search zakończony. Zebrano {len(snapshot)} rekordów.")
    
    # Emit completed event
    emit_event(job_id, "completed", {
        "total": len(snapshot),
        "action_description": f"Deep Search completed. Collected {len(snapshot)} records.",
    })

