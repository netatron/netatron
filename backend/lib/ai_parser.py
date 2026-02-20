"""
AI Parser module for extracting company data from HTML using OpenAI API
"""
import json
import logging
import time
import re
from typing import Dict, Optional, List
import openai
from dotenv import load_dotenv
import os
from bs4 import BeautifulSoup
import chardet
import html
import unicodedata

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")

def parse_company_data_with_ai(html: str, company_name: str = "") -> Dict[str, str]:
    """
    Extract company data from HTML using OpenAI API
    
    Args:
        html (str): HTML content of the company website
        company_name (str): Name of the company (optional, for context)
    
    Returns:
        Dict[str, str]: Extracted company data with keys:
            - name: Company name
            - address: Company address
            - email: Email address
            - phone: Phone number
            - description: Short description of what company does
    """
    
    if not openai.api_key:
        logger.error("OpenAI API key not found. Please set OPENAI_API_KEY environment variable.")
        return _get_empty_company_data()
    
    # Truncate HTML if too long (OpenAI has token limits)
    max_html_length = 50000  # Adjust based on your needs
    if len(html) > max_html_length:
        html = html[:max_html_length] + "..."
    
    # Create prompt for OpenAI
    prompt = f"""
    Analyze the following HTML content and extract company information. 
    Return ONLY a valid JSON object with the following structure:
    
    {{
        "name": "Company name",
        "address": "Full address if found",
        "email": "Email address if found",
        "phone": "Phone number if found", 
        "description": "Brief description of what the company does"
    }}
    
    Rules:
    - If information is not found, use empty string ""
    - For email, look for patterns like @domain.com
    - For phone, look for patterns like +48, (0), or common phone formats
    - For address, look for street names, cities, postal codes
    - For description, summarize what the company does in 1-2 sentences
    - Return ONLY the JSON object, no additional text
    
    Company context: {company_name}
    
    HTML content:
    {html}
    """
    
    try:
        # Call OpenAI API with timeout and retry
        max_retries = 2
        for attempt in range(max_retries):
            try:
                response = openai.chat.completions.create(
                    model="gpt-4o-mini",  # Using mini for cost efficiency
                    messages=[
                        {"role": "system", "content": "You are an expert at extracting structured data from HTML content. Always return valid JSON only."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=300,  # Reduced for speed
                    temperature=0.1,  # Low temperature for consistent results
                    timeout=15  # Increased timeout to 15 seconds
                )
                break  # Success, exit retry loop
            except Exception as e:
                if attempt < max_retries - 1 and ("timeout" in str(e).lower() or "connection" in str(e).lower()):
                    logger.warning(f"OpenAI API attempt {attempt + 1} failed, retrying: {e}")
                    time.sleep(1)  # Wait 1 second before retry
                    continue
                else:
                    raise e
        
        # Extract response content
        response_text = response.choices[0].message.content.strip()
        
        # Try to parse JSON response
        try:
            # Remove any markdown formatting if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            company_data = json.loads(response_text)
            
            # Validate and clean the data
            return _validate_company_data(company_data)
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            logger.warning(f"Response was: {response_text}")
            
            # Try to extract JSON from the response
            return _extract_json_from_text(response_text)
    
    except Exception as e:
        if "timeout" in str(e).lower() or "connection" in str(e).lower():
            logger.warning(f"OpenAI API timeout/connection error: {e}")
        else:
            logger.error(f"OpenAI API error: {e}")
        return _get_empty_company_data()

def _validate_company_data(data: Dict) -> Dict[str, str]:
    """Validate and clean company data"""
    required_keys = ["name", "address", "email", "phone", "description"]
    
    validated_data = {}
    for key in required_keys:
        if key in data and isinstance(data[key], str):
            validated_data[key] = data[key].strip()
        else:
            validated_data[key] = ""
    
    # Preserve additional fields like confidence and website
    for key in ["confidence", "website"]:
        if key in data:
            validated_data[key] = str(data[key]) if data[key] is not None else ""
    
    # Debug: Show validation results
    logger.info(f"🔍 Validated data: {validated_data}")
    
    return validated_data

def _extract_json_from_text(text: str) -> Dict[str, str]:
    """Try to extract JSON from text that might contain other content"""
    
    # Look for JSON pattern in the text
    json_pattern = r'\{[^{}]*"name"[^{}]*\}'
    match = re.search(json_pattern, text, re.DOTALL)
    
    if match:
        try:
            json_str = match.group(0)
            data = json.loads(json_str)
            return _validate_company_data(data)
        except:
            pass
    
    # If no JSON found, return empty data
    return _get_empty_company_data()

def _get_empty_company_data() -> Dict[str, str]:
    """Return empty company data structure"""
    return {
        "name": "",
        "address": "",
        "email": "",
        "phone": "",
        "description": "",
        "confidence": "Low"
    }

def test_ai_parser():
    """Test function for AI parser"""
    test_html = """
    <html>
        <head><title>Test Company</title></head>
        <body>
            <h1>Test Company Sp. z o.o.</h1>
            <p>We provide software development services.</p>
            <p>Contact us at: info@testcompany.com</p>
            <p>Phone: +48 123 456 789</p>
            <p>Address: ul. Testowa 123, 00-001 Warszawa</p>
        </body>
    </html>
    """
    
    result = parse_company_data_with_ai(test_html, "Test Company")
    print("Test result:", result)

def categorize_companies_with_ai(companies: List[Dict], chunk_size: int = 100) -> List[Dict]:
    """
    Categorize companies using AI with intelligent grouping
    
    Args:
        companies (List[Dict]): List of company data dictionaries
        chunk_size (int): Number of companies to process at once
        
    Returns:
        List[Dict]: Companies with added 'category' field
    """
    if not companies:
        return []
    
    categorized_companies = []
    
    # Process companies in chunks
    for i in range(0, len(companies), chunk_size):
        chunk = companies[i:i + chunk_size]
        logger.info(f"Processing categorization chunk {i//chunk_size + 1}/{(len(companies) + chunk_size - 1)//chunk_size}")
        
        try:
            categorized_chunk = _categorize_chunk(chunk)
            categorized_companies.extend(categorized_chunk)
            
            # Add delay between chunks to avoid rate limiting
            if i + chunk_size < len(companies):
                time.sleep(1)
                
        except Exception as e:
            logger.error(f"Error categorizing chunk {i//chunk_size + 1}: {e}")
            # Add companies without category if chunk fails
            for company in chunk:
                company['category'] = 'Unknown'
                categorized_companies.append(company)
    
    return categorized_companies

def _categorize_chunk(companies: List[Dict]) -> List[Dict]:
    """
    Categorize a chunk of companies using AI
    
    Args:
        companies (List[Dict]): Chunk of companies to categorize
        
    Returns:
        List[Dict]: Companies with added 'category' field
    """
    # Prepare company data for AI
    company_data = []
    for i, company in enumerate(companies):
        company_info = {
            'id': i,
            'name': company.get('name', ''),
            'description': company.get('description', ''),
            'types': company.get('types', ''),
            'website': company.get('website', '')
        }
        company_data.append(company_info)
    
    prompt = f"""
    Analyze the following companies and categorize them into intelligent, meaningful categories.
    
    Rules:
    1. Create broad, useful categories that group similar businesses
    2. Use clear, descriptive category names (e.g., "Studio Fotograficzne", "Agencja Marketingowa", "Restauracja")
    3. Group similar businesses together (e.g., all photography studios under "Studio Fotograficzne")
    4. Avoid creating too many categories - aim for 5-15 main categories
    5. Use Polish category names when appropriate
    6. If unsure, use a general category like "Usługi" or "Handel"
    
    Companies to categorize:
    {json.dumps(company_data, ensure_ascii=False, indent=2)}
    
    Return a JSON object with:
    - "categories": A list of all unique categories used
    - "company_categories": A list of objects with "id" and "category" for each company
    
    Example format:
    {{
        "categories": ["Studio Fotograficzne", "Agencja Marketingowa", "Restauracja"],
        "company_categories": [
            {{"id": 0, "category": "Studio Fotograficzne"}},
            {{"id": 1, "category": "Agencja Marketingowa"}}
        ]
    }}
    """
    
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant designed to output JSON. You excel at categorizing businesses intelligently. Always respond with valid JSON format."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=4000
        )
        
        content = response.choices[0].message.content.strip()
        
        # Debug logging
        logger.info(f"AI response length: {len(content)}")
        logger.info(f"AI response preview: {content[:200]}...")
        
        if not content:
            logger.error("Empty response from AI")
            raise ValueError("Empty response from AI")
        
        # Remove markdown code blocks if present
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        content = content.strip()
        
        logger.info(f"Cleaned content: {content[:200]}...")
        
        result = json.loads(content)
        
        # Apply categories to companies
        categorized_companies = []
        category_map = {item['id']: item['category'] for item in result.get('company_categories', [])}
        
        for i, company in enumerate(companies):
            company_copy = company.copy()
            company_copy['category'] = category_map.get(i, 'Unknown')
            categorized_companies.append(company_copy)
        
        logger.info(f"Categorized {len(companies)} companies into {len(result.get('categories', []))} categories")
        return categorized_companies
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON from AI categorization: {e}")
        # Return companies with 'Unknown' category
        for company in companies:
            company['category'] = 'Unknown'
        return companies
    except Exception as e:
        logger.error(f"Error during AI categorization: {e}")
        # Return companies with 'Unknown' category
        for company in companies:
            company['category'] = 'Unknown'
        return companies

def parse_website_intelligently(html: str, company_name: str = "", url: str = "") -> Dict[str, str]:
    """
    ULEPSZONA wersja AI parsera z enhanced email extraction
    """
    try:
        # KROK 1: Enhanced email extraction PRZED parsowaniem HTML
        enhanced_emails = _extract_emails_enhanced(html)
        logger.info(f"🔍 Enhanced email extraction found: {enhanced_emails}")
        
        # KROK 2: Proste parsowanie HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # KROK 3: Usuń niepotrzebne elementy
        for element in soup(['script', 'style', 'nav', 'header', 'aside', 'noscript']):
            element.decompose()
        
        # KROK 4: Znajdź sekcje kontaktowe
        contact_sections = []
        contact_selectors = [
            'div[class*="contact"]', 'section[class*="contact"]', 'div[id*="contact"]',
            'div[class*="kontakt"]', 'section[class*="kontakt"]', 'div[id*="kontakt"]',
            'footer', 'div[class*="footer"]', 'div[class*="info"]'
        ]
        
        for selector in contact_selectors:
            try:
                elements = soup.select(selector)
                for element in elements:
                    text = element.get_text(separator=' ', strip=True)
                    if len(text) > 20:
                        contact_sections.append(text)
            except:
                continue
        
        # KROK 5: Wyciągnij cały tekst
        text_content = soup.get_text(separator=' ', strip=True)
        
        # KROK 6: Połącz treści
        if contact_sections:
            all_content = " ".join(contact_sections) + " " + text_content
        else:
            all_content = text_content
        
        # KROK 7: Ogranicz długość
        if len(all_content) > 20000:
            all_content = all_content[:20000]
        
        # KROK 8: Debug - sprawdź emaile
        _debug_simple_email_patterns(all_content)
        
        # KROK 9: AI parsing
        result = _ai_parse_simple(all_content, company_name, url)
        
        # KROK 10: Jeśli AI nie znalazł emaili, użyj enhanced extraction
        if not result.get('email') and enhanced_emails:
            result['email'] = enhanced_emails[0]  # Użyj pierwszego znalezionego emaila
            logger.info(f"✅ Using enhanced email extraction: {enhanced_emails[0]}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in enhanced website parsing: {e}")
        return _get_empty_company_data()

def _fix_encoding_issues(html: str) -> str:
    """Napraw problemy z kodowaniem"""
    try:
        # Sprawdź czy już jest UTF-8
        if isinstance(html, str):
            try:
                # Spróbuj zakodować jako UTF-8 - jeśli się uda, to już jest UTF-8
                html.encode('utf-8')
                # Napraw HTML entities
                html = html.unescape(html)
                # Normalizacja Unicode
                html = unicodedata.normalize('NFKD', html)
                return html
            except UnicodeEncodeError:
                pass
        
        # Jeśli nie UTF-8, spróbuj detekcji
        try:
            # Konwertuj do bytes jeśli to string
            if isinstance(html, str):
                html_bytes = html.encode('utf-8', errors='ignore')
            else:
                html_bytes = html
            
            # Detekcja kodowania
            detected = chardet.detect(html_bytes)
            encoding = detected.get('encoding', 'utf-8')
            
            # Konwersja do UTF-8
            if encoding and encoding.lower() != 'utf-8':
                try:
                    html = html_bytes.decode(encoding).encode('utf-8').decode('utf-8')
                except:
                    # Fallback - użyj UTF-8 z ignorowaniem błędów
                    html = html_bytes.decode('utf-8', errors='ignore')
            else:
                html = html_bytes.decode('utf-8', errors='ignore')
                
        except Exception:
            # Ostateczny fallback - użyj UTF-8 z ignorowaniem błędów
            if isinstance(html, str):
                html = html.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore')
        
        # Napraw HTML entities
        html = html.unescape(html)
        
        # Normalizacja Unicode
        html = unicodedata.normalize('NFKD', html)
        
        return html
        
    except Exception as e:
        logger.warning(f"Encoding fix failed: {e}")
        # Ostateczny fallback - zwróć oryginalny HTML
        return html

def _clean_html_garbage(html: str) -> str:
    """Usuń śmieci z HTML"""
    try:
        # Usuń null bytes i inne śmieci (zachowaj polskie znaki)
        html = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', html)
        
        # Usuń tylko najbardziej problematyczne znaki, zachowaj polskie
        html = re.sub(r'[^\w\s@.,\-+()/ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]', ' ', html)
        
        # Usuń puste tagi
        html = re.sub(r'<[^>]*>\s*</[^>]*>', '', html)
        
        # Usuń nadmiar białych znaków
        html = re.sub(r'\s+', ' ', html)
        
        return html
        
    except Exception as e:
        logger.warning(f"HTML cleaning failed: {e}")
        return html

def _find_contact_sections(soup: BeautifulSoup) -> List[str]:
    """Znajdź sekcje kontaktowe"""
    contact_sections = []
    
    # Selektory dla sekcji kontaktowych
    contact_selectors = [
        'div[class*="contact"]', 'section[class*="contact"]', 'div[id*="contact"]',
        'div[class*="kontakt"]', 'section[class*="kontakt"]', 'div[id*="kontakt"]',
        'div[class*="about"]', 'section[class*="about"]', 'div[id*="about"]',
        'div[class*="o-nas"]', 'section[class*="o-nas"]', 'div[id*="o-nas"]',
        'footer', 'div[class*="footer"]', 'div[class*="info"]',
        'div[class*="header"]', 'div[class*="top"]', 'div[class*="menu"]',
        'div[class*="footer"]', 'div[class*="bottom"]', 'div[class*="end"]'
    ]
    
    for selector in contact_selectors:
        try:
            elements = soup.select(selector)
            for element in elements:
                if element.get_text(strip=True):
                    text = element.get_text(separator='\n', strip=True)
                    if len(text) > 10:  # Tylko znaczące sekcje
                        contact_sections.append(text)
        except:
            continue
    
    return contact_sections

def _extract_clean_text(soup: BeautifulSoup) -> str:
    """Wyciągnij czysty tekst z HTML"""
    try:
        # Usuń wszystkie tagi i wyciągnij tekst
        text = soup.get_text(separator='\n', strip=True)
        
        # Usuń nadmiar białych znaków
        text = re.sub(r'\s+', ' ', text)
        
        # Usuń zniekształcone znaki
        text = re.sub(r'[^\w\s@.,\-+()/ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]', ' ', text)
        
        return text
        
    except Exception as e:
        logger.warning(f"Text extraction failed: {e}")
        return ""

def _combine_content(contact_sections: List[str], text_content: str) -> str:
    """Połącz sekcje kontaktowe z główną treścią"""
    try:
        # Wyczyść sekcje kontaktowe
        clean_contact_sections = []
        for section in contact_sections:
            clean_section = re.sub(r'[^\w\s@.,\-+()/ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]', ' ', section)
            clean_section = re.sub(r'\s+', ' ', clean_section)
            if len(clean_section) > 10:
                clean_contact_sections.append(clean_section)
        
        # Połącz treści
        if clean_contact_sections:
            all_content = "\n\n".join(clean_contact_sections) + "\n\n" + text_content
        else:
            all_content = text_content
        
        # Ogranicz długość
        if len(all_content) > 30000:  # Zwiększone z 25000
            all_content = all_content[:30000] + "..."
        
        return all_content
        
    except Exception as e:
        logger.warning(f"Content combination failed: {e}")
        return text_content

def _extract_emails_enhanced(html: str) -> list:
    """
    Enhanced email extraction that handles various obfuscation methods
    """
    emails = set()
    
    # 1. Basic email pattern
    basic_emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', html)
    emails.update(basic_emails)
    logger.info(f"Basic emails found: {basic_emails}")
    
    # 2. Title attributes (Cloudflare protection)
    title_emails = re.findall(r'title="([^"]*@[^"]*)"', html)
    emails.update(title_emails)
    logger.info(f"Title emails found: {title_emails}")
    
    # 3. Obfuscated emails (at, dot patterns)
    obfuscated_patterns = [
        r'([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})',
        r'([a-zA-Z0-9._%+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+)\s*\(dot\)\s*([a-zA-Z]{2,})',
        r'([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)\s*\.\s*([a-zA-Z]{2,})',
    ]
    
    for pattern in obfuscated_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            if len(match) == 3:
                email = f"{match[0]}@{match[1]}.{match[2]}"
                emails.add(email)
                logger.info(f"Obfuscated email found: {email}")
    
    # 4. JavaScript emails
    js_pattern = r'<script[^>]*>(.*?)</script>'
    js_matches = re.findall(js_pattern, html, re.DOTALL)
    for js in js_matches:
        js_emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', js)
        emails.update(js_emails)
        if js_emails:
            logger.info(f"JavaScript emails found: {js_emails}")
    
    # 5. Data attributes
    data_emails = re.findall(r'data-[^=]*="([^"]*@[^"]*)"', html)
    emails.update(data_emails)
    if data_emails:
        logger.info(f"Data attribute emails found: {data_emails}")
    
    # 6. Meta tags
    meta_emails = re.findall(r'<meta[^>]*content="([^"]*@[^"]*)"[^>]*>', html)
    emails.update(meta_emails)
    if meta_emails:
        logger.info(f"Meta tag emails found: {meta_emails}")
    
    return list(emails)

def _debug_simple_email_patterns(content: str):
    """Proste debugowanie emaili"""
    try:
        # Podstawowe wzorce emaili
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(email_pattern, content)
        
        if emails:
            logger.info(f"🔍 Found {len(emails)} emails: {emails[:3]}")
        else:
            logger.info(f"🔍 No emails found")
            # Sprawdź czy są znaki @
            at_count = content.count('@')
            logger.info(f"🔍 Found {at_count} '@' characters")
            
            # Pokaż fragment contentu
            logger.info(f"🔍 Content preview: {content[:300]}")
            
    except Exception as e:
        logger.warning(f"Email debugging failed: {e}")

def _ai_parse_simple(content: str, company_name: str, url: str) -> Dict[str, str]:
    """Prosty AI parsing"""
    try:
        prompt = f"""
        Extract contact information from this website content.
        
        Company: {company_name}
        URL: {url}
        
        Find:
        - Email addresses (look for @domain.com patterns)
        - Phone numbers (look for +48, 123-456-789, tel: patterns)
        - Addresses (look for ul., street names, cities)
        - Business description
        
        Content:
        {content}
        
        Return JSON only:
        {{
            "name": "company name or empty",
            "email": "email or empty",
            "phone": "phone or empty", 
            "address": "address or empty",
            "description": "description or empty",
            "confidence": "High/Medium/Low"
        }}
        """
        
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert at extracting contact information. Always return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=500,
            timeout=20
        )
        
        content = response.choices[0].message.content.strip()
        logger.info(f"AI response: {content[:200]}...")
        
        # Usuń markdown
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        
        content = content.strip()
        
        try:
            result = json.loads(content)
            logger.info(f"✅ AI parsing successful: {result}")
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parsing failed: {e}")
            return _get_empty_company_data()
        
        # Walidacja
        extracted_data = {
            'name': result.get('name', company_name or ''),
            'email': result.get('email', ''),
            'phone': result.get('phone', ''),
            'address': result.get('address', ''),
            'description': result.get('description', ''),
            'website': url,
            'confidence': result.get('confidence', 'Low')
        }
        
        # Upewnij się, że wszystkie pola są stringami
        for key in extracted_data:
            if extracted_data[key] is None:
                extracted_data[key] = ''
        
        # Wyczyść dane
        extracted_data = _validate_company_data(extracted_data)
        
        # Debug
        logger.info(f"✅ Extracted for {company_name}:")
        logger.info(f"   📧 Email: '{extracted_data['email']}'")
        logger.info(f"   📞 Phone: '{extracted_data['phone']}'")
        logger.info(f"   🏠 Address: '{extracted_data['address']}'")
        logger.info(f"   🎯 Confidence: '{extracted_data['confidence']}'")
        
        return extracted_data
        
    except Exception as e:
        logger.error(f"AI parsing failed: {e}")
        return _get_empty_company_data()

def _ai_parse_content(content: str, company_name: str, url: str) -> Dict[str, str]:
    """AI parsing z ulepszonym promptem"""
    try:
        # Ulepszony prompt
        prompt = f"""
        You are an expert at extracting contact information from websites. 
        Your task is to find email addresses, phone numbers, and addresses.
        
        Website URL: {url}
        Company Name (if known): {company_name}
        
        CRITICAL INSTRUCTIONS:
        1. Look VERY carefully for email addresses - they might be hidden or encoded
        2. Check for Polish email patterns: kontakt@firma.pl, info@company.com
        3. Look for encoded emails: kontakt[at]firma[dot]pl, kontakt(at)firma(dot)pl
        4. Check footer, header, contact sections, about pages
        5. Look for phone numbers: +48 123 456 789, 123-456-789, tel: 123456789
        6. Look for addresses: ul. Nazwa 123, 00-000 Miasto
        7. Be thorough - scan the ENTIRE content
        8. Extract COMPLETE email addresses with domain
        9. Don't extract social media handles like @username
        10. Look for contact forms, JavaScript, hidden elements
        11. Handle Polish characters: ąćęłńóśźżĄĆĘŁŃÓŚŹŻ
        12. Look for emails in different formats and encodings
        13. Be persistent - emails might be in unexpected places
        14. Check for obfuscated emails: kontakt@firma[dot]pl, kontakt@firma.pl
        15. Look for emails in meta tags, comments, or hidden elements
        
        Website Content (contact sections are prioritized):
        {content}
        
        RESPOND WITH VALID JSON ONLY:
        {{
            "name": "company name or empty string",
            "email": "email address or empty string",
            "phone": "phone number or empty string",
            "address": "address or empty string",
            "description": "business description or empty string",
            "confidence": "High/Medium/Low"
        }}
        """
        
        # AI API call z retry
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are an expert at extracting contact information from websites. You MUST always respond with valid JSON in the exact format specified. Never include any text outside the JSON object."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                    max_tokens=1000,  # Zwiększone z 800
                    timeout=25  # Zwiększone z 20
                )
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"OpenAI API attempt {attempt + 1} failed, retrying: {e}")
                    time.sleep(2)  # Zwiększone z 1
                    continue
                else:
                    raise e
        
        content = response.choices[0].message.content.strip()
        logger.info(f"AI website parsing response: {content[:200]}...")
        
        if not content:
            logger.warning("Empty response from AI website parsing")
            return _get_empty_company_data()
        
        # Usuń markdown code blocks
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        
        content = content.strip()
        
        try:
            result = json.loads(content)
            logger.info(f"✅ AI JSON parsing successful: {result}")
        except json.JSONDecodeError as e:
            logger.error(f"❌ AI JSON parsing failed: {e}")
            logger.error(f"Raw AI response: {content}")
            return _get_empty_company_data()
        
        # Walidacja i czyszczenie wyniku
        extracted_data = {
            'name': result.get('name', company_name or ''),
            'email': result.get('email', ''),
            'phone': result.get('phone', ''),
            'address': result.get('address', ''),
            'description': result.get('description', ''),
            'website': result.get('website', url),
            'confidence': result.get('confidence', 'Low')
        }
        
        # Upewnij się, że wszystkie pola są stringami
        for key in extracted_data:
            if extracted_data[key] is None:
                if key == 'confidence':
                    extracted_data[key] = 'Low'
                else:
                    extracted_data[key] = ''
        
        # Upewnij się, że confidence jest zawsze stringiem
        if 'confidence' not in extracted_data or not extracted_data['confidence']:
            extracted_data['confidence'] = 'Low'
        
        # Wyczyść dane
        extracted_data = _validate_company_data(extracted_data)
        
        # Debug: Pokaż co wyciągnęliśmy
        logger.info(f"✅ AI extracted data for {company_name}:")
        logger.info(f"   📧 Email: '{extracted_data['email']}'")
        logger.info(f"   📞 Phone: '{extracted_data['phone']}'")
        logger.info(f"   🏠 Address: '{extracted_data['address']}'")
        logger.info(f"   🎯 Confidence: '{extracted_data['confidence']}'")
        
        return extracted_data
        
    except Exception as e:
        logger.error(f"AI parsing failed: {e}")
        return _get_empty_company_data()

if __name__ == "__main__":
    test_ai_parser()
