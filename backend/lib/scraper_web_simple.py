"""
PROSTY web scraper - bez skomplikowanego kodowania
"""
import requests
import logging
from typing import Dict
from ai_parser import parse_website_intelligently

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def scrape_website(company_name: str, website_url: str) -> Dict[str, str]:
    """
    PROSTY web scraper - bez skomplikowanego kodowania
    """
    logger.info(f"🚀 Starting web scraping for {company_name} at {website_url}")
    
    try:
        # Proste zapytanie HTTP
        response = requests.get(
            website_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout=10
        )
        
        if response.status_code == 200:
            logger.info(f"✅ Successfully scraped {website_url}")
            logger.info(f"📊 Content length: {len(response.text)} characters")
            logger.info(f"📊 Content preview: {response.text[:200]}...")
            
            # Sprawdź czy to HTML
            if not _is_html_content(response.text):
                logger.warning(f"⚠️ Content doesn't look like HTML")
                return {
                    'name': company_name,
                    'address': '',
                    'email': '',
                    'phone': '',
                    'description': '',
                    'website': website_url,
                    'access_status': 'not_html',
                    'access_message': 'Content is not HTML'
                }
            
            # Parse content with AI
            parsed_data = parse_website_intelligently(response.text, company_name, website_url)
            
            if parsed_data:
                logger.info(f"✅ AI parsing successful for {company_name}")
                return {
                    'name': company_name,
                    'address': parsed_data.get('address', ''),
                    'email': parsed_data.get('email', ''),
                    'phone': parsed_data.get('phone', ''),
                    'description': parsed_data.get('description', ''),
                    'website': website_url,
                    'access_status': 'success',
                    'access_message': 'Successfully scraped and parsed'
                }
            else:
                logger.warning(f"⚠️ Failed to parse content with AI for {company_name}")
                return {
                    'name': company_name,
                    'address': '',
                    'email': '',
                    'phone': '',
                    'description': '',
                    'website': website_url,
                    'access_status': 'parse_failed',
                    'access_message': 'Failed to parse content with AI'
                }
        else:
            logger.warning(f"❌ HTTP {response.status_code} for {website_url}")
            return {
                'name': company_name,
                'address': '',
                'email': '',
                'phone': '',
                'description': '',
                'website': website_url,
                'access_status': 'http_error',
                'access_message': f'HTTP {response.status_code}'
            }
            
    except Exception as e:
        logger.warning(f"❌ Scraping failed for {website_url}: {e}")
        return {
            'name': company_name,
            'address': '',
            'email': '',
            'phone': '',
            'description': '',
            'website': website_url,
            'access_status': 'failed',
            'access_message': f'Scraping failed: {str(e)}'
        }

def _is_html_content(content: str) -> bool:
    """Sprawdź czy content to HTML"""
    try:
        # Sprawdź czy zawiera podstawowe tagi HTML
        html_indicators = ['<html', '<!DOCTYPE', '<head', '<body', '<div', '<p', '<h1', '<h2', '<h3']
        content_lower = content.lower()
        
        # Sprawdź czy zawiera przynajmniej 2 wskaźniki HTML
        indicators_found = sum(1 for indicator in html_indicators if indicator in content_lower)
        
        if indicators_found >= 2:
            return True
        
        # Sprawdź czy zawiera dużo tagów HTML
        tag_count = content.count('<')
        if tag_count > 10:  # Jeśli jest więcej niż 10 tagów, prawdopodobnie to HTML
            return True
            
        return False
        
    except Exception:
        return False


