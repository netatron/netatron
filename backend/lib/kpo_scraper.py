import logging
import unicodedata
import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("kpo_scraper")

VOIVODESHIPS = [
    "Dolnoslaskie",
    "Kujawsko-Pomorskie",
    "Lubelskie",
    "Lubuskie",
    "Lodzkie",
    "Malopolskie",
    "Mazowieckie",
    "Opolskie",
    "Podkarpackie",
    "Podlaskie",
    "Pomorskie",
    "Slaskie",
    "Swietokrzyskie",
    "Warminsko-Mazurskie",
    "Wielkopolskie",
    "Zachodniopomorskie",
]

_KML_ENDPOINT = "https://www.google.com/maps/d/u/0/kml"
_NS = {"kml": "http://www.opengis.net/kml/2.2"}


def _normalize_key(key: str) -> str:
    normalized = unicodedata.normalize("NFKD", key or "")
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return normalized.strip().lower()


def _parse_description(html: str) -> Tuple[str, Dict[str, str]]:
    soup = BeautifulSoup(html or "", "html.parser")
    text = soup.get_text("\n").strip()
    fields: Dict[str, str] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key_norm = _normalize_key(key)
        fields[key_norm] = value.strip()
    return text, fields


def _canonical_voivodeship(raw: str) -> str:
    norm = _normalize_key(raw)
    for label in VOIVODESHIPS:
        if _normalize_key(label) == norm:
            return label
    return raw or ""


def _extract_coordinates(placemark: ET.Element) -> Tuple[str, str]:
    coords_text = placemark.findtext("kml:Point/kml:coordinates", default="", namespaces=_NS) or ""
    parts = [part.strip() for part in coords_text.split(",") if part.strip()]
    if len(parts) >= 2:
        lon, lat = parts[0], parts[1]
        return lat, lon
    return "", ""


def scrape_my_map(mid: str, category: str = "", url: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Download and parse a public Google My Maps layer referenced by ``mid``.
    Returns a list of dicts ready for enrichment.
    """
    if not mid:
        return []
    params = {"mid": mid, "forcekml": "1"}
    logger.info("Downloading KML for MID=%s", mid)
    response = requests.get(_KML_ENDPOINT, params=params, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    placemarks = root.findall(".//kml:Placemark", _NS)
    records: List[Dict[str, str]] = []
    for placemark in placemarks:
        name = placemark.findtext("kml:name", default="", namespaces=_NS) or ""
        description_html = placemark.findtext("kml:description", default="", namespaces=_NS) or ""
        description_raw, fields = _parse_description(description_html)
        lat, lon = _extract_coordinates(placemark)
        full_address = fields.get("adres", "")
        city_from_address = ""
        if full_address:
            parts = [p.strip() for p in full_address.split(",") if p.strip()]
            if parts:
                city_from_address = parts[-1]
        record: Dict[str, str] = {
            "beneficiary_name": fields.get("beneficjent", name) or name,
            "name": name or fields.get("beneficjent", "") or "",
            "voivodeship": fields.get("wojewodztwo", ""),
            "county": fields.get("powiat", ""),
            "city": fields.get("miejscowosc", "") or city_from_address,
            "postal_code": fields.get("kod pocztowy", ""),
            "street": fields.get("ulica", ""),
            "building_number": fields.get("nr budynku", ""),
            "description_raw": description_raw,
            "kpo_category": category,
            "kpo_discipline": fields.get("dziedzina", ""),
            "kpo_owner": fields.get("oow", ""),
            "kpo_funding": fields.get("dofinansowanie", ""),
            "kpo_launch": fields.get("uruchomienie", ""),
            "kpo_fields": fields,
            "source_mid": mid,
            "source_url": url or f"https://www.google.com/maps/d/u/0/viewer?mid={mid}",
            "latitude": lat,
            "longitude": lon,
        }
        voiv_canonical = _canonical_voivodeship(record["voivodeship"])
        if voiv_canonical:
            record["voivodeship_canonical"] = voiv_canonical
        address_parts = []
        if full_address:
            address_parts.append(full_address)
        else:
            address_parts = [
                record.get("street"),
                record.get("building_number"),
                record.get("postal_code"),
                record.get("city"),
            ]
        record["address"] = ", ".join(part for part in address_parts if part)
        summary_bits = [
            category or record.get("kpo_discipline") or "",
            record.get("beneficiary_name") if record.get("beneficiary_name") != record.get("name") else "",
            record.get("address"),
            record.get("voivodeship_canonical") or record.get("voivodeship"),
        ]
        record["context_summary"] = " | ".join(bit for bit in summary_bits if bit)
        records.append(record)
    logger.info("Parsed %s placemarks for MID=%s", len(records), mid)
    return records
