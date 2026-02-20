"""
Google Maps API scraper for company data
"""
import googlemaps
import logging
import time
import random
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GoogleMapsAPIScraper:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_MAPS_API_KEY not found in environment variables")
        
        self.gmaps = googlemaps.Client(key=self.api_key)
        logger.info("Google Maps API client initialized")
        
        # Cache for place details to avoid duplicate API calls
        self.place_details_cache = {}
        
        # Polish regions and their common variations
        self.region_mappings = {
            'podkarpackie': ['Podkarpackie', 'Podkarpackie, Poland', 'Województwo Podkarpackie'],
            'małopolskie': ['Małopolskie', 'Małopolskie, Poland', 'Województwo Małopolskie'],
            'śląskie': ['Śląskie', 'Śląskie, Poland', 'Województwo Śląskie'],
            'mazowieckie': ['Mazowieckie', 'Mazowieckie, Poland', 'Województwo Mazowieckie'],
            'wielkopolskie': ['Wielkopolskie', 'Wielkopolskie, Poland', 'Województwo Wielkopolskie'],
            'dolnośląskie': ['Dolnośląskie', 'Dolnośląskie, Poland', 'Województwo Dolnośląskie'],
            'lubelskie': ['Lubelskie', 'Lubelskie, Poland', 'Województwo Lubelskie'],
            'łódzkie': ['Łódzkie', 'Łódzkie, Poland', 'Województwo Łódzkie'],
            'pomorskie': ['Pomorskie', 'Pomorskie, Poland', 'Województwo Pomorskie'],
            'zachodniopomorskie': ['Zachodniopomorskie', 'Zachodniopomorskie, Poland', 'Województwo Zachodniopomorskie'],
            'kujawsko-pomorskie': ['Kujawsko-Pomorskie', 'Kujawsko-Pomorskie, Poland', 'Województwo Kujawsko-Pomorskie'],
            'warmińsko-mazurskie': ['Warmińsko-Mazurskie', 'Warmińsko-Mazurskie, Poland', 'Województwo Warmińsko-Mazurskie'],
            'podlaskie': ['Podlaskie', 'Podlaskie, Poland', 'Województwo Podlaskie'],
            'lubuskie': ['Lubuskie', 'Lubuskie, Poland', 'Województwo Lubuskie'],
            'opolskie': ['Opolskie', 'Opolskie, Poland', 'Województwo Opolskie'],
            'świętokrzyskie': ['Świętokrzyskie', 'Świętokrzyskie, Poland', 'Województwo Świętokrzyskie']
        }
    
    def _normalize_location(self, location: str) -> str:
        """
        Normalize location input to improve Google Maps API results
        
        Args:
            location (str): Raw location input
            
        Returns:
            str: Normalized location string
        """
        if not location:
            return ""
        
        location_lower = location.lower().strip()
        
        # Check if it's a Polish region
        for region_key, variations in self.region_mappings.items():
            if region_key in location_lower:
                # Use the most comprehensive variation
                return variations[1]  # "Region, Poland" format
        
        # If it's already a city or specific location, add Poland if not present
        if 'poland' not in location_lower and 'polska' not in location_lower:
            return f"{location}, Poland"
        
        return location
    
    def search_companies(self, query: str, location: str = "", max_results: int = 50, next_page_token: str = None) -> Dict[str, any]:
        """
        Search for companies using Google Maps API with automatic pagination
        
        Args:
            query (str): Search query (e.g., "restaurants", "dentists")
            location (str): Location to search in (e.g., "Warsaw, Poland")
            max_results (int): Maximum number of results to return
            next_page_token (str): Token for pagination (optional, for manual pagination)
            
        Returns:
            Dict containing:
                - companies: List of company data dictionaries
                - next_page_token: Token for next page (if available)
                - has_more: Boolean indicating if more results are available
        """
        all_companies = []
        current_token = next_page_token
        page_count = 0
        max_pages = (max_results // 20) + 2  # Google returns max 20 per page
        
        try:
            # Normalize location
            normalized_location = self._normalize_location(location)
            
            # Construct search query
            search_query = f"{query}"
            if normalized_location:
                search_query += f" in {normalized_location}"
            
            logger.info(f"Searching Google Maps API for: {search_query} (max {max_results} results)")
            if location != normalized_location:
                logger.info(f"Location normalized: '{location}' → '{normalized_location}'")
            
            # Keep fetching pages until we have enough results or no more pages
            while len(all_companies) < max_results and page_count < max_pages:
                page_count += 1
                logger.info(f"Fetching page {page_count} (current results: {len(all_companies)})")
                
                try:
                    # Search for places with pagination
                    search_params = {
                        'query': search_query,
                        'type': 'establishment'
                    }
                    
                    if current_token:
                        search_params['page_token'] = current_token
                        logger.info(f"Using pagination token: {current_token[:20]}...")
                    
                    places_result = self.gmaps.places(**search_params)
                    
                    # Process results from this page
                    page_companies = []
                    for place in places_result.get('results', []):
                        try:
                            company_data = self._extract_company_data(place)
                            if company_data and company_data['name']:
                                page_companies.append(company_data)
                        except Exception as e:
                            logger.warning(f"Error processing place: {e}")
                            continue
                    
                    # Add page results to total
                    all_companies.extend(page_companies)
                    logger.info(f"Page {page_count}: Found {len(page_companies)} companies (Total: {len(all_companies)})")
                    
                    # Check for next page
                    current_token = places_result.get('next_page_token')
                    has_more = current_token is not None
                    
                    # Stop if no more pages or we have enough results
                    if not has_more or not current_token:
                        logger.info(f"No more pages available (has_more: {has_more}, token: {'Yes' if current_token else 'No'})")
                        break
                    
                    # Small delay between pages to avoid rate limiting
                    if page_count < max_pages:
                        time.sleep(random.uniform(0.5, 1.5))
                        
                except Exception as e:
                    logger.error(f"Error fetching page {page_count}: {e}")
                    # If pagination fails, try alternative approach
                    if page_count == 1:
                        # First page failed, re-raise the error
                        raise e
                    else:
                        # Subsequent page failed, try alternative queries
                        logger.warning(f"Pagination failed at page {page_count}, trying alternative approach...")
                        
                        # Try alternative queries to get more results
                        alternative_queries = [
                            f"{query} near {normalized_location}",
                            f"{query} in {normalized_location} center",
                            f"{query} {normalized_location} downtown",
                            f"{query} {normalized_location} city center"
                        ]
                        
                        for alt_query in alternative_queries:
                            try:
                                logger.info(f"Trying alternative query: {alt_query}")
                                alt_result = self.gmaps.places(query=alt_query, type='establishment')
                                
                                alt_companies = []
                                for place in alt_result.get('results', []):
                                    try:
                                        company_data = self._extract_company_data(place)
                                        if company_data and company_data['name']:
                                            # Check if we already have this company
                                            if not any(c.get('place_id') == company_data.get('place_id') for c in all_companies):
                                                alt_companies.append(company_data)
                                    except Exception as e:
                                        logger.warning(f"Error processing alternative place: {e}")
                                        continue
                                
                                if alt_companies:
                                    all_companies.extend(alt_companies)
                                    logger.info(f"Alternative query found {len(alt_companies)} new companies (Total: {len(all_companies)})")
                                    
                                    if len(all_companies) >= max_results:
                                        break
                                    
                                    time.sleep(random.uniform(1, 2))  # Delay between alternative queries
                                
                            except Exception as alt_e:
                                logger.warning(f"Alternative query failed: {alt_e}")
                                continue
                        
                        # Stop trying to paginate
                        break
            
            # Limit to max_results
            final_companies = all_companies[:max_results]
            
            # OPTIMIZATION: Skip additional place details to reduce API calls
            # The basic search already provides most needed data (name, address, rating, etc.)
            # Only get details for companies that are missing critical info
            companies_needing_details = []
            for company in final_companies:
                # Only get details if missing phone or website
                if not company.get('phone') and not company.get('website'):
                    companies_needing_details.append(company)
            
            if companies_needing_details:
                logger.info(f"Getting detailed information for {len(companies_needing_details)} companies missing contact info...")
                for i, company in enumerate(companies_needing_details):
                    try:
                        if company.get('place_id'):
                            detailed_data = self._get_place_details(company['place_id'])
                            if detailed_data:
                                # Merge detailed data
                                company.update(detailed_data)
                    except Exception as e:
                        logger.warning(f"Error getting details for {company.get('name')}: {e}")
                    
                    # Reduced delay - only for companies that need details
                    if i < len(companies_needing_details) - 1:
                        time.sleep(random.uniform(0.05, 0.15))
            else:
                logger.info("All companies already have contact information - skipping place details API calls")
            
            # Check if there are more results available
            has_more = current_token is not None and len(all_companies) >= max_results
            
            logger.info(f"Final results: {len(final_companies)} companies from {page_count} pages, has_more: {has_more}")
            
            return {
                'companies': final_companies,
                'next_page_token': current_token,
                'has_more': has_more
            }
            
        except Exception as e:
            logger.error(f"Error searching companies: {e}")
            return {
                'companies': all_companies,
                'next_page_token': current_token,
                'has_more': False
            }
    
    def _extract_company_data(self, place: Dict) -> Dict[str, str]:
        """Extract company data from Google Places API result"""
        company_data = {
            'name': '',
            'address': '',
            'website': '',
            'phone': '',
            'rating': '',
            'reviews_count': '',
            'place_id': '',
            'business_status': '',
            'types': '',
            'price_level': ''
        }
        
        try:
            # Basic information
            company_data['name'] = place.get('name', '')
            company_data['place_id'] = place.get('place_id', '')
            company_data['business_status'] = place.get('business_status', '')
            company_data['types'] = ', '.join(place.get('types', []))
            company_data['price_level'] = str(place.get('price_level', ''))
            
            # Address
            if 'formatted_address' in place:
                company_data['address'] = place['formatted_address']
            elif 'vicinity' in place:
                company_data['address'] = place['vicinity']
            
            # Rating and reviews
            if 'rating' in place:
                company_data['rating'] = str(place['rating'])
            if 'user_ratings_total' in place:
                company_data['reviews_count'] = str(place['user_ratings_total'])
            
            # Contact information (from place details)
            if 'formatted_phone_number' in place:
                company_data['phone'] = place['formatted_phone_number']
            if 'website' in place:
                company_data['website'] = place['website']
            
        except Exception as e:
            logger.warning(f"Error extracting company data: {e}")
        
        return company_data
    
    def _get_place_details(self, place_id: str) -> Optional[Dict[str, str]]:
        """Get detailed information for a place with caching"""
        # Check cache first
        if place_id in self.place_details_cache:
            logger.info(f"Using cached details for place_id: {place_id[:20]}...")
            return self.place_details_cache[place_id]
        
        try:
            place_details = self.gmaps.place(
                place_id=place_id,
                fields=['formatted_phone_number', 'website', 'opening_hours', 'reviews']
            )
            
            result = place_details.get('result', {})
            details = {}
            
            # Phone number
            if 'formatted_phone_number' in result:
                details['phone'] = result['formatted_phone_number']
            
            # Website
            if 'website' in result:
                details['website'] = result['website']
            
            # Opening hours
            if 'opening_hours' in result:
                opening_hours = result['opening_hours']
                if 'weekday_text' in opening_hours:
                    details['opening_hours'] = '; '.join(opening_hours['weekday_text'])
                if 'open_now' in opening_hours:
                    details['open_now'] = str(opening_hours['open_now'])
            
            # Reviews (first few)
            if 'reviews' in result:
                reviews = result['reviews'][:3]  # First 3 reviews
                review_texts = []
                for review in reviews:
                    if 'text' in review and review['text']:
                        review_texts.append(review['text'][:200] + '...' if len(review['text']) > 200 else review['text'])
            if review_texts:
                details['recent_reviews'] = ' | '.join(review_texts)
            
            # Cache the result
            self.place_details_cache[place_id] = details
            logger.info(f"Cached details for place_id: {place_id[:20]}...")
            
            return details
            
        except Exception as e:
            logger.warning(f"Error getting place details for {place_id}: {e}")
            return None
    
    def _random_sleep(self, min_seconds: float = 0.1, max_seconds: float = 0.3):
        """Random sleep to avoid rate limiting"""
        sleep_time = random.uniform(min_seconds, max_seconds)
        time.sleep(sleep_time)

# Convenience function
def scrape_google_maps_api(query: str, location: str = "", max_results: int = 50, next_page_token: str = None) -> Dict[str, any]:
    """
    Scrape Google Maps using API with pagination support
    
    Args:
        query (str): Search query
        location (str): Location to search in
        max_results (int): Maximum number of results
        next_page_token (str): Token for pagination (optional)
        
    Returns:
        Dict containing companies, next_page_token, and has_more
    """
    scraper = GoogleMapsAPIScraper()
    return scraper.search_companies(query, location, max_results, next_page_token)

# Test function
def test_api_scraper():
    """Test the Google Maps API scraper"""
    try:
        results = scrape_google_maps_api("restaurants", "Warsaw, Poland", 5)
        print(f"Found {len(results)} results:")
        for i, result in enumerate(results, 1):
            print(f"{i}. {result['name']} - {result['address']}")
            if result.get('phone'):
                print(f"   Phone: {result['phone']}")
            if result.get('website'):
                print(f"   Website: {result['website']}")
            print()
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    test_api_scraper()
