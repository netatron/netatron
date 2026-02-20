"""
Utility functions for the maps scraper application
"""
import pandas as pd
import logging
from typing import List, Dict, Optional, Tuple
from rapidfuzz import fuzz, process
import os
import json
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def save_to_csv(data: List[Dict], filename: str = None) -> str:
    """
    Save data to CSV file
    
    Args:
        data (List[Dict]): List of company data dictionaries
        filename (str): Optional filename, if None generates timestamp-based name
        
    Returns:
        str: Path to saved file
    """
    if not data:
        logger.warning("No data to save")
        return ""
    
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"companies_{timestamp}.csv"
    
    try:
        df = pd.DataFrame(data)
        df.to_csv(filename, index=False, encoding='utf-8-sig')
        logger.info(f"Data saved to {filename}")
        return filename
    except Exception as e:
        logger.error(f"Error saving to CSV: {e}")
        return ""

def save_to_excel(data: List[Dict], filename: str = None) -> str:
    """
    Save data to Excel file
    
    Args:
        data (List[Dict]): List of company data dictionaries
        filename (str): Optional filename, if None generates timestamp-based name
        
    Returns:
        str: Path to saved file
    """
    if not data:
        logger.warning("No data to save")
        return ""
    
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"companies_{timestamp}.xlsx"
    
    try:
        df = pd.DataFrame(data)
        df.to_excel(filename, index=False, engine='openpyxl')
        logger.info(f"Data saved to {filename}")
        return filename
    except Exception as e:
        logger.error(f"Error saving to Excel: {e}")
        return ""

def fuzzy_match_company_name(name1: str, name2: str, threshold: int = 80) -> bool:
    """
    Check if two company names are similar using fuzzy matching
    
    Args:
        name1 (str): First company name
        name2 (str): Second company name
        threshold (int): Similarity threshold (0-100)
        
    Returns:
        bool: True if names are similar enough
    """
    if not name1 or not name2:
        return False
    
    # Clean names for better matching
    clean_name1 = _clean_company_name(name1)
    clean_name2 = _clean_company_name(name2)
    
    # Calculate similarity
    similarity = fuzz.ratio(clean_name1, clean_name2)
    
    return similarity >= threshold

def find_best_match(target_name: str, candidates: List[str], threshold: int = 80) -> Optional[str]:
    """
    Find the best matching company name from a list of candidates
    
    Args:
        target_name (str): Target company name
        candidates (List[str]): List of candidate names
        threshold (int): Minimum similarity threshold
        
    Returns:
        Optional[str]: Best matching name or None if no good match
    """
    if not target_name or not candidates:
        return None
    
    # Use rapidfuzz process to find best match
    result = process.extractOne(target_name, candidates, scorer=fuzz.ratio)
    
    if result and result[1] >= threshold:
        return result[0]
    
    return None

def merge_company_data(google_data: Dict, web_data: Dict, rejestr_data: Dict) -> Dict:
    """
    Merge company data from different sources, prioritizing completeness
    
    Args:
        google_data (Dict): Data from Google Maps
        web_data (Dict): Data from company website
        rejestr_data (Dict): Data from rejestr.io
        
    Returns:
        Dict: Merged company data
    """
    merged = {
        'name': '',
        'address': '',
        'email': '',
        'phone': '',
        'description': '',
        'website': '',
        'rating': '',
        'reviews_count': '',
        'nip': '',
        'krs': '',
        'source': 'merged'
    }
    
    # Priority order: web_data > rejestr_data > google_data
    
    # Name - prefer web/rejestr over Google
    merged['name'] = (
        web_data.get('name', '') or 
        rejestr_data.get('name', '') or 
        google_data.get('name', '')
    )
    
    # Address - prefer web/rejestr over Google
    merged['address'] = (
        web_data.get('address', '') or 
        rejestr_data.get('address', '') or 
        google_data.get('address', '')
    )
    
    # Email - prefer web over rejestr
    merged['email'] = (
        web_data.get('email', '') or 
        rejestr_data.get('email', '')
    )
    
    # Phone - prefer web over rejestr
    merged['phone'] = (
        web_data.get('phone', '') or 
        rejestr_data.get('phone', '') or 
        google_data.get('phone', '')
    )
    
    # Description - prefer web over rejestr
    merged['description'] = (
        web_data.get('description', '') or 
        rejestr_data.get('description', '')
    )
    
    # Website - only from Google Maps
    merged['website'] = google_data.get('website', '')
    
    # Rating and reviews - only from Google Maps
    merged['rating'] = google_data.get('rating', '')
    merged['reviews_count'] = google_data.get('reviews_count', '')
    
    # NIP and KRS - only from rejestr.io
    merged['nip'] = rejestr_data.get('nip', '')
    merged['krs'] = rejestr_data.get('krs', '')
    
    return merged

def _clean_company_name(name: str) -> str:
    """
    Clean company name for better fuzzy matching
    
    Args:
        name (str): Company name to clean
        
    Returns:
        str: Cleaned company name
    """
    if not name:
        return ""
    
    # Convert to lowercase
    cleaned = name.lower()
    
    # Remove common suffixes and prefixes
    suffixes_to_remove = [
        'sp. z o.o.', 'sp. z o. o.', 'sp z o.o.', 'sp z o. o.',
        's.a.', 'sa', 'ltd', 'llc', 'inc', 'corp',
        'sp. j.', 'sp. k.', 'p.p.h.', 'f.h.u.',
        'spółka z ograniczoną odpowiedzialnością',
        'spółka akcyjna'
    ]
    
    for suffix in suffixes_to_remove:
        cleaned = cleaned.replace(suffix, '').strip()
    
    # Remove extra spaces and special characters
    cleaned = ' '.join(cleaned.split())
    
    return cleaned

def validate_company_data(data: Dict) -> Dict:
    """
    Validate and clean company data
    
    Args:
        data (Dict): Company data to validate
        
    Returns:
        Dict: Validated and cleaned data
    """
    validated = {}
    
    # Required fields
    required_fields = ['name', 'address', 'email', 'phone', 'description']
    
    for field in required_fields:
        value = data.get(field, '')
        if isinstance(value, str):
            validated[field] = value.strip()
        else:
            validated[field] = str(value).strip() if value else ''
    
    # Optional fields
    optional_fields = ['website', 'rating', 'reviews_count', 'nip', 'krs', 'source', 'access_status', 'access_message']
    
    for field in optional_fields:
        value = data.get(field, '')
        if isinstance(value, str):
            validated[field] = value.strip()
        else:
            validated[field] = str(value).strip() if value else ''
    
    return validated

def filter_complete_companies(data: List[Dict], min_required_fields: int = 3) -> List[Dict]:
    """
    Filter companies that have minimum required information
    
    Args:
        data (List[Dict]): List of company data
        min_required_fields (int): Minimum number of required fields that must be filled
        
    Returns:
        List[Dict]: Filtered list of companies
    """
    required_fields = ['name', 'address', 'email', 'phone', 'description']
    
    filtered = []
    for company in data:
        filled_fields = sum(1 for field in required_fields if company.get(field, '').strip())
        if filled_fields >= min_required_fields:
            filtered.append(company)
    
    return filtered

def get_export_filename(format_type: str, prefix: str = "companies") -> str:
    """
    Generate export filename with timestamp
    
    Args:
        format_type (str): File format ('csv' or 'xlsx')
        prefix (str): Filename prefix
        
    Returns:
        str: Generated filename
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    extension = 'csv' if format_type.lower() == 'csv' else 'xlsx'
    return f"{prefix}_{timestamp}.{extension}"

def _is_valid_string(value) -> bool:
    """
    Check if value is a valid non-empty string
    
    Args:
        value: Value to check
        
    Returns:
        bool: True if value is a non-empty string
    """
    if not isinstance(value, str):
        return False
    return bool(value.strip())

def create_summary_stats(data: List[Dict]) -> Dict:
    """
    Create summary statistics for the scraped data
    
    Args:
        data (List[Dict]): List of company data
        
    Returns:
        Dict: Summary statistics
    """
    if not data:
        return {
            'total_companies': 0,
            'with_email': 0,
            'with_phone': 0,
            'with_website': 0,
            'with_description': 0,
            'complete_profiles': 0
        }
    
    total = len(data)
    
    with_email = sum(1 for company in data if _is_valid_string(company.get('email', '')))
    with_phone = sum(1 for company in data if _is_valid_string(company.get('phone', '')))
    with_website = sum(1 for company in data if _is_valid_string(company.get('website', '')))
    with_description = sum(1 for company in data if _is_valid_string(company.get('description', '')))
    
    # Complete profile: has name, address, and at least email or phone
    complete_profiles = sum(1 for company in data 
                          if _is_valid_string(company.get('name', '')) and 
                          _is_valid_string(company.get('address', '')) and 
                          (_is_valid_string(company.get('email', '')) or _is_valid_string(company.get('phone', ''))))
    
    return {
        'total_companies': total,
        'with_email': with_email,
        'with_phone': with_phone,
        'with_website': with_website,
        'with_description': with_description,
        'complete_profiles': complete_profiles,
        'email_percentage': round((with_email / total) * 100, 1) if total > 0 else 0,
        'phone_percentage': round((with_phone / total) * 100, 1) if total > 0 else 0,
        'complete_percentage': round((complete_profiles / total) * 100, 1) if total > 0 else 0
    }

# ===== DATA CLEANUP FUNCTIONS =====

def remove_duplicates(data: List[Dict], key_fields: List[str] = None) -> Tuple[List[Dict], int]:
    """
    Remove duplicate companies based on key fields
    
    Args:
        data (List[Dict]): List of company data
        key_fields (List[str]): Fields to use for duplicate detection
        
    Returns:
        Tuple[List[Dict], int]: (cleaned_data, duplicates_removed)
    """
    if not data:
        return [], 0
    
    if key_fields is None:
        key_fields = ['name', 'address', 'email', 'phone']
    
    seen = set()
    cleaned = []
    duplicates_removed = 0
    
    for company in data:
        # Create a key from specified fields
        key_parts = []
        for field in key_fields:
            value = company.get(field, '')
            if _is_valid_string(value):
                value = value.strip().lower()
            else:
                value = ''
            key_parts.append(value)
        
        key = '|'.join(key_parts)
        
        if key not in seen and key.strip('|'):  # Don't add empty keys
            seen.add(key)
            cleaned.append(company)
        else:
            duplicates_removed += 1
    
    return cleaned, duplicates_removed

def filter_by_email(data: List[Dict], has_email: bool = True) -> Tuple[List[Dict], int]:
    """
    Filter companies by email presence
    
    Args:
        data (List[Dict]): List of company data
        has_email (bool): True to keep only companies with email, False to remove them
        
    Returns:
        Tuple[List[Dict], int]: (filtered_data, removed_count)
    """
    if not data:
        return [], 0
    
    filtered = []
    removed_count = 0
    
    for company in data:
        email = company.get('email', '')
        if _is_valid_string(email):
            email = email.strip()
        else:
            email = ''
        has_valid_email = bool(email and '@' in email)
        
        if (has_email and has_valid_email) or (not has_email and not has_valid_email):
            filtered.append(company)
        else:
            removed_count += 1
    
    return filtered, removed_count

def filter_by_phone(data: List[Dict], has_phone: bool = True) -> Tuple[List[Dict], int]:
    """
    Filter companies by phone presence
    
    Args:
        data (List[Dict]): List of company data
        has_phone (bool): True to keep only companies with phone, False to remove them
        
    Returns:
        Tuple[List[Dict], int]: (filtered_data, removed_count)
    """
    if not data:
        return [], 0
    
    filtered = []
    removed_count = 0
    
    for company in data:
        phone = company.get('phone', '')
        if _is_valid_string(phone):
            phone = phone.strip()
        else:
            phone = ''
        has_valid_phone = bool(phone and len(phone) >= 9)  # Minimum phone length
        
        if (has_phone and has_valid_phone) or (not has_phone and not has_valid_phone):
            filtered.append(company)
        else:
            removed_count += 1
    
    return filtered, removed_count

def filter_by_website(data: List[Dict], has_website: bool = True) -> Tuple[List[Dict], int]:
    """
    Filter companies by website presence
    
    Args:
        data (List[Dict]): List of company data
        has_website (bool): True to keep only companies with website, False to remove them
        
    Returns:
        Tuple[List[Dict], int]: (filtered_data, removed_count)
    """
    if not data:
        return [], 0
    
    filtered = []
    removed_count = 0
    
    for company in data:
        website = company.get('website', '')
        if _is_valid_string(website):
            website = website.strip()
        else:
            website = ''
        has_valid_website = bool(website and website.startswith(('http://', 'https://')))
        
        if (has_website and has_valid_website) or (not has_website and not has_valid_website):
            filtered.append(company)
        else:
            removed_count += 1
    
    return filtered, removed_count

def filter_by_access_status(data: List[Dict], allowed_statuses: List[str] = None) -> Tuple[List[Dict], int]:
    """
    Filter companies by access status
    
    Args:
        data (List[Dict]): List of company data
        allowed_statuses (List[str]): List of allowed access statuses
        
    Returns:
        Tuple[List[Dict], int]: (filtered_data, removed_count)
    """
    if not data:
        return [], 0
    
    if allowed_statuses is None:
        allowed_statuses = ['success', 'no_robots']
    
    filtered = []
    removed_count = 0
    
    for company in data:
        status = company.get('access_status', '')
        if _is_valid_string(status):
            status = status.strip()
        else:
            status = ''
        
        if status in allowed_statuses:
            filtered.append(company)
        else:
            removed_count += 1
    
    return filtered, removed_count

def filter_by_completeness(data: List[Dict], min_fields: int = 3) -> Tuple[List[Dict], int]:
    """
    Filter companies by data completeness
    
    Args:
        data (List[Dict]): List of company data
        min_fields (int): Minimum number of filled fields required
        
    Returns:
        Tuple[List[Dict], int]: (filtered_data, removed_count)
    """
    if not data:
        return [], 0
    
    filtered = []
    removed_count = 0
    
    for company in data:
        filled_fields = sum(1 for field in ['name', 'address', 'email', 'phone', 'description', 'website'] 
                           if _is_valid_string(company.get(field, '')))
        
        if filled_fields >= min_fields:
            filtered.append(company)
        else:
            removed_count += 1
    
    return filtered, removed_count

def clean_company_names(data: List[Dict]) -> Tuple[List[Dict], int]:
    """
    Clean and standardize company names
    
    Args:
        data (List[Dict]): List of company data
        
    Returns:
        Tuple[List[Dict], int]: (cleaned_data, cleaned_count)
    """
    if not data:
        return [], 0
    
    cleaned = []
    cleaned_count = 0
    
    for company in data:
        name = company.get('name', '')
        if _is_valid_string(name):
            name = name.strip()
        else:
            name = ''
        if name:
            # Remove extra spaces
            cleaned_name = ' '.join(name.split())
            
            # Remove common suffixes that might cause duplicates
            suffixes_to_remove = [
                'sp. z o.o.', 'sp. z o. o.', 'sp z o.o.', 'sp z o. o.',
                's.a.', 'sa', 'ltd', 'llc', 'inc', 'corp'
            ]
            
            for suffix in suffixes_to_remove:
                if cleaned_name.lower().endswith(suffix.lower()):
                    cleaned_name = cleaned_name[:-len(suffix)].strip()
                    cleaned_count += 1
            
            company['name'] = cleaned_name
        
        cleaned.append(company)
    
    return cleaned, cleaned_count

def validate_emails(data: List[Dict]) -> Tuple[List[Dict], int]:
    """
    Validate and clean email addresses
    
    Args:
        data (List[Dict]): List of company data
        
    Returns:
        Tuple[List[Dict], int]: (cleaned_data, invalid_emails_removed)
    """
    if not data:
        return [], 0
    
    import re
    
    cleaned = []
    invalid_removed = 0
    
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    for company in data:
        email = company.get('email', '')
        if _is_valid_string(email):
            email = email.strip()
        else:
            email = ''
        
        if email:
            if re.match(email_pattern, email):
                # Convert to lowercase
                company['email'] = email.lower()
            else:
                # Remove invalid email
                company['email'] = ''
                invalid_removed += 1
        
        cleaned.append(company)
    
    return cleaned, invalid_removed

def get_cleanup_suggestions(data: List[Dict]) -> Dict[str, any]:
    """
    Get suggestions for data cleanup
    
    Args:
        data (List[Dict]): List of company data
        
    Returns:
        Dict[str, any]: Cleanup suggestions and statistics
    """
    if not data:
        return {}
    
    total = len(data)
    
    # Count issues
    no_email = sum(1 for company in data if not _is_valid_string(company.get('email', '')))
    no_phone = sum(1 for company in data if not _is_valid_string(company.get('phone', '')))
    no_website = sum(1 for company in data if not _is_valid_string(company.get('website', '')))
    no_address = sum(1 for company in data if not _is_valid_string(company.get('address', '')))
    
    # Check for potential duplicates
    names = [_is_valid_string(company.get('name', '')) and company.get('name', '').strip().lower() or '' for company in data]
    unique_names = len(set(names))
    potential_duplicates = total - unique_names
    
    # Check access status issues
    blocked_count = sum(1 for company in data if company.get('access_status') in ['403_forbidden', 'robots_disallowed'])
    
    return {
        'total_companies': total,
        'no_email': no_email,
        'no_phone': no_phone,
        'no_website': no_website,
        'no_address': no_address,
        'potential_duplicates': potential_duplicates,
        'blocked_websites': blocked_count,
        'suggestions': [
            f"Remove {no_email} companies without email" if no_email > 0 else None,
            f"Remove {no_phone} companies without phone" if no_phone > 0 else None,
            f"Remove {blocked_count} companies with blocked websites" if blocked_count > 0 else None,
            f"Remove {potential_duplicates} potential duplicates" if potential_duplicates > 0 else None,
        ]
    }

# Test functions
def test_fuzzy_matching():
    """Test fuzzy matching functionality"""
    test_cases = [
        ("Google Sp. z o.o.", "Google", True),
        ("Microsoft Corporation", "Microsoft Corp", True),
        ("Allegro Sp. z o.o.", "Allegro", True),
        ("Apple Inc", "Microsoft Corp", False)
    ]
    
    for name1, name2, expected in test_cases:
        result = fuzzy_match_company_name(name1, name2)
        print(f"'{name1}' vs '{name2}': {result} (expected: {expected})")

def test_data_merging():
    """Test data merging functionality"""
    google_data = {
        'name': 'Test Company',
        'address': 'Google Address',
        'website': 'https://test.com',
        'rating': '4.5'
    }
    
    web_data = {
        'name': 'Test Company Sp. z o.o.',
        'address': 'Web Address',
        'email': 'test@test.com',
        'phone': '+48 123 456 789',
        'description': 'Web description'
    }
    
    rejestr_data = {
        'name': 'Test Company',
        'address': 'Rejestr Address',
        'nip': '1234567890',
        'description': 'Rejestr description'
    }
    
    merged = merge_company_data(google_data, web_data, rejestr_data)
    print("Merged data:", merged)

def save_search_state(queries: List[str], location: str, current_results: List[Dict], next_page_tokens: Dict[str, str], filename: str = "search_state.json"):
    """
    Save search state for continuation
    
    Args:
        queries (List[str]): List of search queries
        location (str): Search location
        current_results (List[Dict]): Current results
        next_page_tokens (Dict[str, str]): Next page tokens for each query
        filename (str): Filename to save state
    """
    try:
        state = {
            'queries': queries,
            'location': location,
            'results': current_results,
            'next_page_tokens': next_page_tokens,
            'timestamp': datetime.now().isoformat(),
            'total_results': len(current_results)
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Search state saved to {filename}")
        
    except Exception as e:
        logger.error(f"Error saving search state: {e}")

def load_search_state(filename: str = "search_state.json") -> Dict:
    """
    Load search state for continuation
    
    Args:
        filename (str): Filename to load state from
        
    Returns:
        Dict: Search state or empty dict if not found
    """
    try:
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                state = json.load(f)
            logger.info(f"Search state loaded from {filename}")
            return state
        else:
            logger.info(f"No search state file found: {filename}")
            return {}
    except Exception as e:
        logger.error(f"Error loading search state: {e}")
        return {}

def get_continuation_queries(queries: List[str], next_page_tokens: Dict[str, str]) -> List[Dict]:
    """
    Get queries that can be continued (have next page tokens)
    
    Args:
        queries (List[str]): Original queries
        next_page_tokens (Dict[str, str]): Next page tokens
        
    Returns:
        List[Dict]: Queries with continuation info
    """
    continuation_queries = []
    
    for query in queries:
        if query in next_page_tokens and next_page_tokens[query]:
            continuation_queries.append({
                'query': query,
                'next_page_token': next_page_tokens[query],
                'can_continue': True
            })
        else:
            continuation_queries.append({
                'query': query,
                'next_page_token': None,
                'can_continue': False
            })
    
    return continuation_queries

def merge_search_results(existing_results: List[Dict], new_results: List[Dict]) -> List[Dict]:
    """
    Merge new search results with existing ones, avoiding duplicates
    
    Args:
        existing_results (List[Dict]): Existing results
        new_results (List[Dict]): New results to merge
        
    Returns:
        List[Dict]: Merged results without duplicates
    """
    if not existing_results:
        return new_results
    
    if not new_results:
        return existing_results
    
    # Combine all results
    all_results = existing_results + new_results
    
    # Remove duplicates based on name and address
    merged_results, _ = remove_duplicates(all_results, key_fields=['name', 'address'])
    
    logger.info(f"Merged {len(existing_results)} existing + {len(new_results)} new = {len(merged_results)} total results")
    
    return merged_results

def import_results_from_csv(filename: str) -> List[Dict]:
    """
    Import results from CSV file
    
    Args:
        filename (str): Path to CSV file
        
    Returns:
        List[Dict]: Imported results
    """
    try:
        if not os.path.exists(filename):
            logger.error(f"File not found: {filename}")
            return []
        
        # Read CSV file
        df = pd.read_csv(filename, encoding='utf-8-sig')
        
        # Convert to list of dictionaries
        results = df.to_dict('records')
        
        # Clean up any NaN values
        for result in results:
            for key, value in result.items():
                if pd.isna(value):
                    result[key] = ''
                elif isinstance(value, (int, float)) and pd.isna(value):
                    result[key] = ''
        
        logger.info(f"Imported {len(results)} results from {filename}")
        return results
        
    except Exception as e:
        logger.error(f"Error importing results from {filename}: {e}")
        return []

def import_results_from_excel(filename: str) -> List[Dict]:
    """
    Import results from Excel file
    
    Args:
        filename (str): Path to Excel file
        
    Returns:
        List[Dict]: Imported results
    """
    try:
        if not os.path.exists(filename):
            logger.error(f"File not found: {filename}")
            return []
        
        # Read Excel file
        df = pd.read_excel(filename, engine='openpyxl')
        
        # Convert to list of dictionaries
        results = df.to_dict('records')
        
        # Clean up any NaN values
        for result in results:
            for key, value in result.items():
                if pd.isna(value):
                    result[key] = ''
                elif isinstance(value, (int, float)) and pd.isna(value):
                    result[key] = ''
        
        logger.info(f"Imported {len(results)} results from {filename}")
        return results
        
    except Exception as e:
        logger.error(f"Error importing results from {filename}: {e}")
        return []

def get_existing_company_names(results: List[Dict]) -> set:
    """
    Get set of existing company names for duplicate checking
    
    Args:
        results (List[Dict]): List of company results
        
    Returns:
        set: Set of normalized company names
    """
    existing_names = set()
    
    for result in results:
        name = result.get('name', '').strip()
        if name:
            # Normalize name for comparison
            normalized_name = _clean_company_name(name)
            existing_names.add(normalized_name)
    
    return existing_names

def filter_new_companies(new_results: List[Dict], existing_names: set) -> List[Dict]:
    """
    Filter out companies that already exist in imported results
    
    Args:
        new_results (List[Dict]): New search results
        existing_names (set): Set of existing company names
        
    Returns:
        List[Dict]: Filtered results with only new companies
    """
    filtered_results = []
    
    for result in new_results:
        name = result.get('name', '').strip()
        if name:
            normalized_name = _clean_company_name(name)
            if normalized_name not in existing_names:
                filtered_results.append(result)
            else:
                logger.info(f"Skipping duplicate company: {name}")
    
    logger.info(f"Filtered {len(new_results)} new results to {len(filtered_results)} unique companies")
    return filtered_results

if __name__ == "__main__":
    test_fuzzy_matching()
    print("\n" + "="*50 + "\n")
    test_data_merging()
