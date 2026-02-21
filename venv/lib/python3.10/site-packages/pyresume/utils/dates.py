"""
Date parsing utilities for resume text.
"""
import re
from datetime import date, datetime
from typing import Optional, Tuple
from dateutil import parser as dateutil_parser


class DateParser:
    """Parse various date formats commonly found in resumes."""
    
    # Common date patterns in resumes - ordered by Lever preference
    DATE_PATTERNS = [
        # MM/YYYY format (Lever preferred)
        r'(\d{1,2})/(\d{4})',
        # MM-YYYY format
        r'(\d{1,2})-(\d{4})',
        # Month Year formats
        r'(?i)(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{4})',
        # YYYY only
        r'(\d{4})',
        # Quarter formats
        r'(?i)q([1-4])\s+(\d{4})',
        # Season formats
        r'(?i)(spring|summer|fall|autumn|winter)\s+(\d{4})',
    ]
    
    MONTH_MAPPING = {
        'jan': 1, 'january': 1,
        'feb': 2, 'february': 2,
        'mar': 3, 'march': 3,
        'apr': 4, 'april': 4,
        'may': 5,
        'jun': 6, 'june': 6,
        'jul': 7, 'july': 7,
        'aug': 8, 'august': 8,
        'sep': 9, 'september': 9,
        'oct': 10, 'october': 10,
        'nov': 11, 'november': 11,
        'dec': 12, 'december': 12,
    }
    
    @staticmethod
    def parse_date(date_str: str) -> Optional[date]:
        """
        Parse a date string and return a date object.
        
        Args:
            date_str: String containing a date
            
        Returns:
            Parsed date object or None if parsing fails
        """
        if not date_str or not isinstance(date_str, str):
            return None
        
        date_str = date_str.strip().lower()
        
        # Handle "present", "current", etc.
        if any(word in date_str for word in ['present', 'current', 'now', 'ongoing']):
            return date.today()
        
        # Try dateutil parser first (handles many formats automatically)
        try:
            parsed = dateutil_parser.parse(date_str, fuzzy=True)
            return parsed.date()
        except (ValueError, TypeError):
            pass
        
        # Try custom patterns
        for pattern in DateParser.DATE_PATTERNS:
            match = re.search(pattern, date_str)
            if match:
                try:
                    return DateParser._parse_match(match, pattern)
                except (ValueError, TypeError):
                    continue
        
        return None
    
    @staticmethod
    def _parse_match(match, pattern: str) -> Optional[date]:
        """Parse a regex match based on the pattern used."""
        groups = match.groups()
        
        if 'jan|january' in pattern:  # Month Year format
            month_str, year_str = groups
            month = DateParser.MONTH_MAPPING.get(month_str.lower())
            year = int(year_str)
            if month and 1900 <= year <= 2100:
                return date(year, month, 1)
        
        elif '/' in pattern or '-' in pattern:  # MM/YYYY or MM-YYYY format
            month_str, year_str = groups
            month = int(month_str)
            year = int(year_str)
            if 1 <= month <= 12 and 1900 <= year <= 2100:
                return date(year, month, 1)
        
        elif 'q[1-4]' in pattern:  # Quarter format
            quarter_str, year_str = groups
            quarter = int(quarter_str)
            year = int(year_str)
            month = (quarter - 1) * 3 + 1  # Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct
            if 1900 <= year <= 2100:
                return date(year, month, 1)
        
        elif 'spring|summer' in pattern:  # Season format
            season_str, year_str = groups
            year = int(year_str)
            season_months = {
                'spring': 3, 'summer': 6, 'fall': 9, 'autumn': 9, 'winter': 12
            }
            month = season_months.get(season_str.lower(), 1)
            if 1900 <= year <= 2100:
                return date(year, month, 1)
        
        elif len(groups) == 1:  # Year only
            year = int(groups[0])
            if 1900 <= year <= 2100:
                return date(year, 1, 1)
        
        return None
    
    @staticmethod
    def extract_date_range(text: str) -> Tuple[Optional[date], Optional[date]]:
        """
        Extract start and end dates from text like "01/2020 - 03/2022".
        Lever prefers MM/YYYY format.
        
        Args:
            text: Text containing date range
            
        Returns:
            Tuple of (start_date, end_date)
        """
        # First try to find MM/YYYY - MM/YYYY pattern (Lever preferred)
        mm_yyyy_pattern = r'(\d{1,2}/\d{4})\s*[-–]\s*(\d{1,2}/\d{4}|present|current)'
        match = re.search(mm_yyyy_pattern, text, re.IGNORECASE)
        if match:
            start_date = DateParser.parse_date(match.group(1))
            end_date = DateParser.parse_date(match.group(2))
            return start_date, end_date
        
        # Common date range separators
        separators = [' - ', ' – ', ' to ', ' through ', ' until ']
        
        for sep in separators:
            if sep in text.lower():
                parts = text.lower().split(sep)
                if len(parts) >= 2:
                    start_date = DateParser.parse_date(parts[0].strip())
                    end_date = DateParser.parse_date(parts[1].strip())
                    return start_date, end_date
        
        # If no range separator found, try to parse as single date
        single_date = DateParser.parse_date(text)
        return single_date, None
    
    @staticmethod
    def is_current_position(text: str) -> bool:
        """
        Check if text indicates a current position.
        
        Args:
            text: Text to check
            
        Returns:
            True if position is current
        """
        current_indicators = [
            'present', 'current', 'now', 'ongoing', 'today',
            'currently', 'till date', 'to date'
        ]
        
        return any(indicator in text.lower() for indicator in current_indicators)