"""
KSEF XML Parser - Mockup for converting PDF invoices to KSEF XML format
KSEF (Krajowy System e-Faktur) - Polish National e-Invoice System (2026)

This is a mockup implementation. In production, this would:
1. Extract structured invoice data from PDF
2. Map to KSEF XML schema (Polish e-invoice standard)
3. Validate against KSEF XSD schema
4. Generate compliant KSEF XML file
"""

from __future__ import annotations

import logging
from typing import Dict, Optional
from xml.etree import ElementTree as ET
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_pdf_to_ksef_xml(invoice_data: Dict[str, str], pdf_text: Optional[str] = None) -> str:
    """
    Convert invoice data extracted from PDF to KSEF XML format (mockup).
    
    Args:
        invoice_data: Dictionary with invoice fields (Typ, Data, Numer, Nabywca/Nadawca, NIP, Netto, VAT, Brutto)
        pdf_text: Optional PDF text content (for future use in parsing)
    
    Returns:
        KSEF XML string (mockup format)
    
    Note:
        This is a mockup implementation. Real KSEF XML generation would require:
        - Full KSEF XML schema compliance
        - Proper namespace declarations
        - XSD validation
        - Correct field mapping based on invoice type (VAT, simplified, etc.)
        - Proper encoding and formatting
    """
    try:
        logger.info(f"[KSEF] Generating KSEF XML mockup for invoice: {invoice_data.get('Numer', 'unknown')}")
        
        # Create root element with KSEF namespace (mockup)
        root = ET.Element("Faktura", xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/")
        
        # Invoice header
        header = ET.SubElement(root, "Naglowek")
        ET.SubElement(header, "WersjaSchemy").text = "1-0E"
        ET.SubElement(header, "WariantFormularza").text = "1"
        ET.SubElement(header, "DataWytworzeniaFa").text = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        
        # Invoice number
        if invoice_data.get("Numer"):
            ET.SubElement(root, "NrFa").text = invoice_data["Numer"]
        
        # Invoice date
        if invoice_data.get("Data"):
            ET.SubElement(root, "DataWystawienia").text = invoice_data["Data"]
        
        # Seller/Vendor information
        sprzedawca = ET.SubElement(root, "Sprzedawca")
        if invoice_data.get("Nabywca/Nadawca"):
            ET.SubElement(sprzedawca, "Nazwa").text = invoice_data["Nabywca/Nadawca"]
        if invoice_data.get("NIP"):
            nip_elem = ET.SubElement(sprzedawca, "NIP")
            # Remove dashes and spaces from NIP
            nip_clean = invoice_data["NIP"].replace("-", "").replace(" ", "")
            ET.SubElement(nip_elem, "NrNIP").text = nip_clean
        
        # Buyer (default - Happy Deal sp. z o.o. - would be replaced with actual buyer data)
        nabywca = ET.SubElement(root, "Nabywca")
        ET.SubElement(nabywca, "Nazwa").text = "Happy Deal sp. z o.o."
        # NIP would be added from config/company data
        
        # Invoice type
        if invoice_data.get("Typ"):
            typ = invoice_data["Typ"].lower()
            if typ == "koszty":
                ET.SubElement(root, "RodzajFaktury").text = "VAT"
            elif typ == "sprzedaż":
                ET.SubElement(root, "RodzajFaktury").text = "VAT"
            else:
                ET.SubElement(root, "RodzajFaktury").text = "VAT"
        
        # Amounts
        if invoice_data.get("Netto"):
            netto = invoice_data["Netto"].replace(",", ".").replace(" ", "")
            try:
                netto_value = float(netto)
                ET.SubElement(root, "P_15").text = f"{netto_value:.2f}"
            except ValueError:
                logger.warning(f"[KSEF] Could not parse Netto value: {invoice_data.get('Netto')}")
        
        if invoice_data.get("VAT"):
            vat = invoice_data["VAT"].replace(",", ".").replace(" ", "")
            try:
                vat_value = float(vat)
                ET.SubElement(root, "P_16").text = f"{vat_value:.2f}"
            except ValueError:
                logger.warning(f"[KSEF] Could not parse VAT value: {invoice_data.get('VAT')}")
        
        if invoice_data.get("Brutto"):
            brutto = invoice_data["Brutto"].replace(",", ".").replace(" ", "")
            try:
                brutto_value = float(brutto)
                ET.SubElement(root, "P_13_7").text = f"{brutto_value:.2f}"
            except ValueError:
                logger.warning(f"[KSEF] Could not parse Brutto value: {invoice_data.get('Brutto')}")
        
        # Note: In real implementation, this would include:
        # - Detailed line items (pozycje faktury)
        # - VAT rates breakdown
        # - Payment information
        # - Additional required KSEF fields
        # - Proper XML namespace declarations
        # - XSD schema validation
        
        # Convert to string
        ET.indent(root, space="  ")
        xml_str = ET.tostring(root, encoding="unicode", xml_declaration=True)
        
        logger.info(f"[KSEF] Generated KSEF XML mockup ({len(xml_str)} characters)")
        return xml_str
        
    except Exception as e:
        logger.error(f"[KSEF] Error generating KSEF XML: {e}", exc_info=True)
        # Return minimal mockup on error
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <WersjaSchemy>1-0E</WersjaSchemy>
    <DataWytworzeniaFa>{datetime.now().strftime("%Y-%m-%dT%H:%M:%S")}</DataWytworzeniaFa>
  </Naglowek>
  <NrFa>{invoice_data.get('Numer', 'MOCKUP')}</NrFa>
  <DataWystawienia>{invoice_data.get('Data', datetime.now().strftime('%Y-%m-%d'))}</DataWystawienia>
  <KodBledu>PARSER_ERROR</KodBledu>
  <OpisBledu>{str(e)}</OpisBledu>
</Faktura>"""

