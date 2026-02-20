"""
Cost monitoring module for tracking API usage and costs
"""
import json
import os
import time
from datetime import datetime
from typing import Dict, List, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CostMonitor:
    def __init__(self, stats_file: str = "cost_stats.json"):
        self.stats_file = stats_file
        self.session_stats = {
            'start_time': time.time(),
            'google_maps_queries': 0,
            'openai_tokens_used': 0,
            'openai_requests': 0,
            'web_scraping_requests': 0,
            'rejestr_requests': 0,
            'total_companies_found': 0,
            'total_companies_processed': 0
        }
        self.load_stats()
    
    def load_stats(self):
        """Load statistics from file"""
        try:
            if os.path.exists(self.stats_file):
                with open(self.stats_file, 'r', encoding='utf-8') as f:
                    self.total_stats = json.load(f)
            else:
                self.total_stats = {
                    'total_google_maps_queries': 0,
                    'total_openai_tokens': 0,
                    'total_openai_requests': 0,
                    'total_web_scraping_requests': 0,
                    'total_rejestr_requests': 0,
                    'total_companies_found': 0,
                    'total_companies_processed': 0,
                    'total_sessions': 0,
                    'total_cost_estimate': 0.0,
                    'sessions': []
                }
        except Exception as e:
            logger.error(f"Error loading stats: {e}")
            self.total_stats = {
                'total_google_maps_queries': 0,
                'total_openai_tokens': 0,
                'total_openai_requests': 0,
                'total_web_scraping_requests': 0,
                'total_rejestr_requests': 0,
                'total_companies_found': 0,
                'total_companies_processed': 0,
                'total_sessions': 0,
                'total_cost_estimate': 0.0,
                'sessions': []
            }
    
    def save_stats(self):
        """Save statistics to file"""
        try:
            with open(self.stats_file, 'w', encoding='utf-8') as f:
                json.dump(self.total_stats, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving stats: {e}")
    
    def record_google_maps_query(self, results_count: int = 0):
        """Record Google Maps API query"""
        self.session_stats['google_maps_queries'] += 1
        self.session_stats['total_companies_found'] += results_count
        self.total_stats['total_google_maps_queries'] += 1
        self.total_stats['total_companies_found'] += results_count
        logger.info(f"Google Maps query recorded: {results_count} results")
    
    def record_openai_usage(self, tokens_used: int, request_type: str = "parsing"):
        """Record OpenAI API usage"""
        self.session_stats['openai_tokens_used'] += tokens_used
        self.session_stats['openai_requests'] += 1
        self.total_stats['total_openai_tokens'] += tokens_used
        self.total_stats['total_openai_requests'] += 1
        logger.info(f"OpenAI usage recorded: {tokens_used} tokens for {request_type}")
    
    def record_web_scraping(self, requests_count: int = 1):
        """Record web scraping requests"""
        self.session_stats['web_scraping_requests'] += requests_count
        self.total_stats['total_web_scraping_requests'] += requests_count
        logger.info(f"Web scraping recorded: {requests_count} requests")
    
    def record_rejestr_requests(self, requests_count: int = 1):
        """Record rejestr.io requests"""
        self.session_stats['rejestr_requests'] += requests_count
        self.total_stats['total_rejestr_requests'] += requests_count
        logger.info(f"Rejestr.io requests recorded: {requests_count} requests")
    
    def record_companies_processed(self, count: int):
        """Record companies processed"""
        self.session_stats['total_companies_processed'] += count
        self.total_stats['total_companies_processed'] += count
        logger.info(f"Companies processed recorded: {count}")
    
    def end_session(self):
        """End current session and save to archive"""
        session_duration = time.time() - self.session_stats['start_time']
        
        # Calculate session cost estimate
        session_cost = self._calculate_session_cost()
        
        # Create session record
        session_record = {
            'timestamp': datetime.now().isoformat(),
            'duration_seconds': session_duration,
            'google_maps_queries': self.session_stats['google_maps_queries'],
            'openai_tokens_used': self.session_stats['openai_tokens_used'],
            'openai_requests': self.session_stats['openai_requests'],
            'web_scraping_requests': self.session_stats['web_scraping_requests'],
            'rejestr_requests': self.session_stats['rejestr_requests'],
            'total_companies_found': self.session_stats['total_companies_found'],
            'total_companies_processed': self.session_stats['total_companies_processed'],
            'estimated_cost': session_cost
        }
        
        # Add to total stats
        self.total_stats['sessions'].append(session_record)
        self.total_stats['total_sessions'] += 1
        self.total_stats['total_cost_estimate'] += session_cost
        
        # Keep only last 50 sessions to avoid file bloat
        if len(self.total_stats['sessions']) > 50:
            self.total_stats['sessions'] = self.total_stats['sessions'][-50:]
        
        # Save stats
        self.save_stats()
        
        logger.info(f"Session ended: {session_duration:.1f}s, cost: ${session_cost:.4f}")
        
        # Reset session stats
        self.session_stats = {
            'start_time': time.time(),
            'google_maps_queries': 0,
            'openai_tokens_used': 0,
            'openai_requests': 0,
            'web_scraping_requests': 0,
            'rejestr_requests': 0,
            'total_companies_found': 0,
            'total_companies_processed': 0
        }
    
    def _calculate_session_cost(self) -> float:
        """Calculate estimated cost for current session"""
        # Google Maps API: $7 per 1000 requests (Places API)
        # Text Search: $32 per 1000 requests (more expensive)
        # Place Details: $17 per 1000 requests (most expensive)
        # We use mostly Text Search, so estimate $20 per 1000 requests average
        google_cost = (self.session_stats['google_maps_queries'] / 1000) * 20.0
        
        # OpenAI GPT-4o-mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens
        # Estimate: 80% input, 20% output
        input_tokens = self.session_stats['openai_tokens_used'] * 0.8
        output_tokens = self.session_stats['openai_tokens_used'] * 0.2
        openai_cost = (input_tokens / 1000000 * 0.15) + (output_tokens / 1000000 * 0.60)
        
        return google_cost + openai_cost
    
    def get_session_stats(self) -> Dict:
        """Get current session statistics"""
        session_duration = time.time() - self.session_stats['start_time']
        session_cost = self._calculate_session_cost()
        
        return {
            'duration_minutes': session_duration / 60,
            'google_maps_queries': self.session_stats['google_maps_queries'],
            'openai_tokens_used': self.session_stats['openai_tokens_used'],
            'openai_requests': self.session_stats['openai_requests'],
            'web_scraping_requests': self.session_stats['web_scraping_requests'],
            'rejestr_requests': self.session_stats['rejestr_requests'],
            'total_companies_found': self.session_stats['total_companies_found'],
            'total_companies_processed': self.session_stats['total_companies_processed'],
            'estimated_cost': session_cost
        }
    
    def get_total_stats(self) -> Dict:
        """Get total statistics"""
        return self.total_stats.copy()
    
    def get_recent_sessions(self, count: int = 10) -> List[Dict]:
        """Get recent sessions"""
        return self.total_stats['sessions'][-count:] if self.total_stats['sessions'] else []

# Global instance
_cost_monitor = None

def get_cost_monitor() -> CostMonitor:
    """Get global cost monitor instance"""
    global _cost_monitor
    if _cost_monitor is None:
        _cost_monitor = CostMonitor()
    return _cost_monitor

# Convenience functions
def record_google_maps_query(results_count: int = 0):
    """Record Google Maps API query"""
    monitor = get_cost_monitor()
    monitor.record_google_maps_query(results_count)

def record_openai_usage(tokens_used: int, request_type: str = "parsing"):
    """Record OpenAI API usage"""
    monitor = get_cost_monitor()
    monitor.record_openai_usage(tokens_used, request_type)

def record_web_scraping(requests_count: int = 1):
    """Record web scraping requests"""
    monitor = get_cost_monitor()
    monitor.record_web_scraping(requests_count)

def record_rejestr_requests(requests_count: int = 1):
    """Record rejestr.io requests"""
    monitor = get_cost_monitor()
    monitor.record_rejestr_requests(requests_count)

def record_companies_processed(count: int):
    """Record companies processed"""
    monitor = get_cost_monitor()
    monitor.record_companies_processed(count)

def end_session():
    """End current session"""
    monitor = get_cost_monitor()
    monitor.end_session()

def get_session_stats() -> Dict:
    """Get current session statistics"""
    monitor = get_cost_monitor()
    return monitor.get_session_stats()

def get_total_stats() -> Dict:
    """Get total statistics"""
    monitor = get_cost_monitor()
    return monitor.get_total_stats()

def get_recent_sessions(count: int = 10) -> List[Dict]:
    """Get recent sessions"""
    monitor = get_cost_monitor()
    return monitor.get_recent_sessions(count)

if __name__ == "__main__":
    # Test the cost monitor
    monitor = CostMonitor()
    
    # Simulate some usage
    monitor.record_google_maps_query(20)
    monitor.record_openai_usage(1500, "parsing")
    monitor.record_web_scraping(5)
    monitor.record_companies_processed(20)
    
    # Show stats
    print("Session stats:", monitor.get_session_stats())
    print("Total stats:", monitor.get_total_stats())
    
    # End session
    monitor.end_session()
    print("Session ended and saved")









