"""
Robots.txt checker with caching and crawl-delay support.
Respects robots.txt rules for ethical web scraping.
"""
import logging
import time
from typing import Dict, Tuple, Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
import requests

logger = logging.getLogger(__name__)


class RobotsChecker:
    """
    Checks robots.txt rules with caching and crawl-delay support.
    """
    
    def __init__(self, cache_ttl: int = 86400):
        """
        Initialize RobotsChecker.
        
        Args:
            cache_ttl: Cache TTL in seconds (default: 24 hours)
        """
        self._cache: Dict[Tuple[str, str], Tuple[RobotFileParser, float]] = {}
        self._rate_limits: Dict[str, float] = {}  # Domain -> last request time
        self._cache_ttl = cache_ttl
        self._default_crawl_delay = 1.0  # Default 1 second delay
        self._default_rate_limit = 1.0  # Default 1 request per second per domain
    
    def can_fetch(self, url: str, user_agent: str = "*") -> Tuple[bool, float]:
        """
        Check if URL can be fetched according to robots.txt.
        
        Args:
            url: URL to check
            user_agent: User agent string (default: "*")
        
        Returns:
            (can_fetch: bool, crawl_delay: float)
        """
        try:
            parsed = urlparse(url)
            if not parsed.netloc:
                logger.warning(f"Invalid URL for robots.txt check: {url}")
                return True, self._default_crawl_delay
            
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            cache_key = (parsed.netloc, user_agent)
            
            # Check cache
            if cache_key in self._cache:
                rp, last_check = self._cache[cache_key]
                # Refresh cache if expired
                if time.time() - last_check < self._cache_ttl:
                    can_fetch = rp.can_fetch(user_agent, url)
                    crawl_delay = rp.crawl_delay(user_agent) or self._default_crawl_delay
                    logger.debug(f"robots.txt cache hit for {parsed.netloc}: can_fetch={can_fetch}, crawl_delay={crawl_delay}")
                    return can_fetch, crawl_delay
            
            # Fetch robots.txt
            try:
                rp = RobotFileParser()
                rp.set_url(robots_url)
                rp.read()
                
                # Cache result
                self._cache[cache_key] = (rp, time.time())
                
                can_fetch = rp.can_fetch(user_agent, url)
                crawl_delay = rp.crawl_delay(user_agent) or self._default_crawl_delay
                
                logger.info(f"robots.txt check for {parsed.netloc}: can_fetch={can_fetch}, crawl_delay={crawl_delay}")
                return can_fetch, crawl_delay
            except Exception as e:
                logger.warning(f"Failed to fetch robots.txt for {parsed.netloc}: {e}")
                # If robots.txt cannot be fetched, allow scraping but with default delay
                return True, self._default_crawl_delay
        except Exception as e:
            logger.error(f"Error checking robots.txt for {url}: {e}", exc_info=True)
            return True, self._default_crawl_delay
    
    def wait_for_rate_limit(self, url: str, min_delay: float = 0.0) -> None:
        """
        Wait if necessary to respect rate limiting per domain.
        
        Args:
            url: URL being requested
            min_delay: Minimum delay from robots.txt crawl-delay
        """
        try:
            parsed = urlparse(url)
            domain = parsed.netloc
            if not domain:
                return
            
            current_time = time.time()
            last_request = self._rate_limits.get(domain, 0)
            
            # Calculate required delay
            required_delay = max(min_delay, self._default_rate_limit)
            time_since_last = current_time - last_request
            
            if time_since_last < required_delay:
                wait_time = required_delay - time_since_last
                logger.debug(f"Rate limiting: waiting {wait_time:.2f}s for domain {domain}")
                time.sleep(wait_time)
            
            # Update last request time
            self._rate_limits[domain] = time.time()
        except Exception as e:
            logger.warning(f"Error in rate limiting for {url}: {e}")
    
    def clear_cache(self, domain: Optional[str] = None) -> None:
        """
        Clear cache for specific domain or all domains.
        
        Args:
            domain: Domain to clear cache for, or None to clear all
        """
        if domain:
            keys_to_remove = [k for k in self._cache.keys() if k[0] == domain]
            for key in keys_to_remove:
                del self._cache[key]
            logger.info(f"Cleared robots.txt cache for {domain}")
        else:
            self._cache.clear()
            logger.info("Cleared all robots.txt cache")


# Global instance
_robots_checker = RobotsChecker()


def get_robots_checker() -> RobotsChecker:
    """Get global RobotsChecker instance."""
    return _robots_checker

