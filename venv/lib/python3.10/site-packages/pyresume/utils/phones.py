"""
Phone number parsing and formatting utilities.
"""
import re
from typing import Optional, List

try:
    import phonenumbers
    from phonenumbers import geocoder, carrier
    PHONENUMBERS_AVAILABLE = True
except ImportError:
    phonenumbers = None
    PHONENUMBERS_AVAILABLE = False


class PhoneParser:
    """Parse and format phone numbers from resume text."""
    
    # Regex patterns for phone number detection
    PHONE_PATTERNS = [
        # US formats: (123) 456-7890, 123-456-7890, 123.456.7890
        r'\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})',
        # International format: +1 123 456 7890
        r'\+(\d{1,3})\s?(\d{3})\s?(\d{3})\s?(\d{4})',
        # General international: +XX XXXXXXXXX
        r'\+(\d{1,3})\s?(\d{4,15})',
        # 10-digit numbers: 1234567890
        r'(\d{10})',
    ]
    
    @staticmethod
    def extract_phone_numbers(text: str) -> List[str]:
        """
        Extract phone numbers from text.
        
        Args:
            text: Text to search for phone numbers
            
        Returns:
            List of found phone numbers
        """
        if not text:
            return []
        
        found_numbers = []
        
        for pattern in PhoneParser.PHONE_PATTERNS:
            matches = re.finditer(pattern, text)
            for match in matches:
                # Skip numbers that are too long or short to be valid
                full_match = match.group(0)
                digits_only = re.sub(r'\D', '', full_match)
                
                if 7 <= len(digits_only) <= 15:
                    found_numbers.append(full_match.strip())
        
        # Remove duplicates while preserving order
        unique_numbers = []
        for num in found_numbers:
            if num not in unique_numbers:
                unique_numbers.append(num)
        
        return unique_numbers
    
    @staticmethod
    def format_phone_number(phone: str, default_country: str = 'US') -> Optional[str]:
        """
        Format a phone number into a standard format.
        
        Args:
            phone: Raw phone number string
            default_country: Default country code if not specified
            
        Returns:
            Formatted phone number or None if invalid
        """
        if not phone:
            return None
        
        if PHONENUMBERS_AVAILABLE:
            try:
                # Parse with phonenumbers library
                parsed = phonenumbers.parse(phone, default_country)
                
                if phonenumbers.is_valid_number(parsed):
                    # Format in international format
                    return phonenumbers.format_number(
                        parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL
                    )
            except phonenumbers.NumberParseException:
                pass
        
        # Fallback formatting for US numbers
        digits_only = re.sub(r'\D', '', phone)
        
        if len(digits_only) == 10:
            # Format as (XXX) XXX-XXXX
            return f"({digits_only[:3]}) {digits_only[3:6]}-{digits_only[6:]}"
        elif len(digits_only) == 11 and digits_only.startswith('1'):
            # US number with country code
            return f"+1 ({digits_only[1:4]}) {digits_only[4:7]}-{digits_only[7:]}"
        
        return phone  # Return original if can't format
    
    @staticmethod
    def validate_phone_number(phone: str, country: str = 'US') -> bool:
        """
        Validate if a phone number is valid.
        
        Args:
            phone: Phone number to validate
            country: Country code for validation
            
        Returns:
            True if valid, False otherwise
        """
        if not phone:
            return False
        
        if PHONENUMBERS_AVAILABLE:
            try:
                parsed = phonenumbers.parse(phone, country)
                return phonenumbers.is_valid_number(parsed)
            except phonenumbers.NumberParseException:
                return False
        
        # Basic validation without phonenumbers library
        digits_only = re.sub(r'\D', '', phone)
        
        # Check if it's a reasonable length
        if len(digits_only) < 7 or len(digits_only) > 15:
            return False
        
        # US-specific validation
        if country.upper() == 'US':
            if len(digits_only) == 10:
                # First digit of area code and exchange can't be 0 or 1
                return digits_only[0] not in '01' and digits_only[3] not in '01'
            elif len(digits_only) == 11 and digits_only.startswith('1'):
                # US number with country code
                return digits_only[1] not in '01' and digits_only[4] not in '01'
        
        return True  # Assume valid for international numbers
    
    @staticmethod
    def get_phone_info(phone: str) -> dict:
        """
        Get additional information about a phone number.
        
        Args:
            phone: Phone number to analyze
            
        Returns:
            Dictionary with phone number information
        """
        info = {
            'formatted': PhoneParser.format_phone_number(phone),
            'valid': PhoneParser.validate_phone_number(phone),
            'country': None,
            'carrier': None,
            'type': None
        }
        
        if PHONENUMBERS_AVAILABLE:
            try:
                parsed = phonenumbers.parse(phone, None)
                
                if phonenumbers.is_valid_number(parsed):
                    # Get country
                    country = geocoder.description_for_number(parsed, 'en')
                    if country:
                        info['country'] = country
                    
                    # Get carrier (for mobile numbers)
                    carrier_name = carrier.name_for_number(parsed, 'en')
                    if carrier_name:
                        info['carrier'] = carrier_name
                    
                    # Get number type
                    number_type = phonenumbers.number_type(parsed)
                    type_mapping = {
                        phonenumbers.PhoneNumberType.MOBILE: 'mobile',
                        phonenumbers.PhoneNumberType.FIXED_LINE: 'landline',
                        phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE: 'fixed_or_mobile',
                        phonenumbers.PhoneNumberType.TOLL_FREE: 'toll_free',
                        phonenumbers.PhoneNumberType.VOIP: 'voip',
                    }
                    info['type'] = type_mapping.get(number_type, 'unknown')
                    
            except phonenumbers.NumberParseException:
                pass
        
        return info