"""
Common regex patterns and text matching utilities for resume parsing.
"""
import re
from typing import List, Dict, Pattern, Optional


class ResumePatterns:
    """Common regex patterns for extracting information from resumes."""
    
    # Email pattern
    EMAIL = re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    )
    
    # Phone patterns
    PHONE = re.compile(
        r'(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})'
    )
    
    # URL patterns
    URL = re.compile(
        r'https?://(?:[-\w.])+(?:[:\d]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?'
    )
    
    GITHUB_URL = re.compile(
        r'(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/?'
    )
    
    LINKEDIN_URL = re.compile(
        r'(?:https?://)?(?:www\.)?linkedin\.com/in/([A-Za-z0-9_.-]+)/?'
    )
    
    # Section headers (case insensitive)
    SECTION_HEADERS = {
        'experience': re.compile(
            r'(?i)^(?:work\s+)?(?:professional\s+)?(?:employment\s+)?experience(?:\s*:)?|work\s+history(?:\s*:)?|employment\s+history(?:\s*:)?|career\s+summary(?:\s*:)?|professional\s+background(?:\s*:)?|work\s+experience(?:\s*:)?|professional\s+experience(?:\s*:)?|relevant\s+experience(?:\s*:)?|career\s+history(?:\s*:)?',
            re.MULTILINE
        ),
        'education': re.compile(
            r'(?i)^education(?:al\s+background)?(?:\s*:)?|academic\s+background(?:\s*:)?|qualifications(?:\s*:)?|academic\s+credentials(?:\s*:)?|academic\s+history(?:\s*:)?',
            re.MULTILINE
        ),
        'skills': re.compile(
            r'(?i)^(?:technical\s+)?skills(?:\s*:)?|competencies(?:\s*:)?|technologies(?:\s*:)?|proficiencies(?:\s*:)?|technical\s+competencies(?:\s*:)?|core\s+skills(?:\s*:)?|key\s+skills(?:\s*:)?|expertise(?:\s*:)?|technical\s+expertise(?:\s*:)?',
            re.MULTILINE
        ),
        'projects': re.compile(
            r'(?i)^projects?(?:\s*:)?|selected\s+projects(?:\s*:)?|key\s+projects(?:\s*:)?|personal\s+projects(?:\s*:)?|professional\s+projects(?:\s*:)?|notable\s+projects(?:\s*:)?',
            re.MULTILINE
        ),
        'certifications': re.compile(
            r'(?i)^certifications?(?:\s*:)?|licenses?(?:\s*:)?|credentials?(?:\s*:)?|professional\s+certifications?(?:\s*:)?|certificates?(?:\s*:)?',
            re.MULTILINE
        ),
        'summary': re.compile(
            r'(?i)^(?:professional\s+)?summary(?:\s*:)?|profile(?:\s*:)?|objective(?:\s*:)?|about\s+me(?:\s*:)?|career\s+objective(?:\s*:)?|professional\s+profile(?:\s*:)?|executive\s+summary(?:\s*:)?|career\s+summary(?:\s*:)?',
            re.MULTILINE
        ),
        'languages': re.compile(
            r'(?i)^languages?(?:\s*:)?|linguistic\s+skills(?:\s*:)?|language\s+proficiency(?:\s*:)?',
            re.MULTILINE
        )
    }
    
    # University/College names pattern
    UNIVERSITY_KEYWORDS = re.compile(
        r'(?i)\b(?:university|college|institute|school|academy|polytechnic)\b'
    )
    
    # Degree patterns
    DEGREE_PATTERNS = re.compile(
        r'(?i)\b(?:bachelor|master|phd|doctorate|associate|diploma|certificate|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|m\.?b\.?a\.?|b\.?tech|m\.?tech)\b'
    )
    
    # GPA pattern
    GPA_PATTERN = re.compile(
        r'(?i)gpa:?\s*(\d+\.?\d*)\s*(?:/\s*(\d+\.?\d*))?'
    )
    
    # Location patterns (City, State format)
    LOCATION_PATTERN = re.compile(
        r'\b([A-Za-z][A-Za-z\s\-\.]+?),\s*([A-Z]{2})\b'
    )
    
    # Additional location patterns
    LOCATION_PATTERNS = [
        re.compile(r'\b([A-Za-z][A-Za-z\s\-\.]+?),\s*([A-Z]{2})\b'),  # City, ST
        re.compile(r'\b([A-Za-z][A-Za-z\s\-\.]+?),\s*([A-Za-z][A-Za-z\s]+?)(?:,\s*([A-Z]{2}))?\b'),  # City, State
        re.compile(r'\b([A-Za-z][A-Za-z\s\-\.]+?)\s*\|\s*([A-Z]{2})\b'),  # City | ST
        re.compile(r'\b([A-Za-z][A-Za-z\s\-\.]+?)\s*•\s*([A-Z]{2})\b'),  # City • ST
    ]
    
    # Job title indicators
    JOB_TITLE_KEYWORDS = re.compile(
        r'(?i)\b(?:engineer|developer|manager|analyst|specialist|coordinator|director|associate|senior|junior|lead|principal|architect|consultant|intern|designer|administrator|executive|officer|technician|supervisor|assistant|representative|advisor|strategist|scientist|researcher|programmer|tester|writer|editor|trainer|instructor|planner|producer|expert|head|chief|vp|vice\s+president|president|ceo|cto|cfo|coo|founder|co-founder|owner|partner)\b'
    )
    
    # Common section headers that should NOT be treated as names
    SECTION_HEADER_KEYWORDS = re.compile(
        r'(?i)^(?:current\s+project|projects?|experience|education|skills?|summary|objective|profile|contact|'
        r'references|certifications?|languages?|awards?|publications?|interests?|hobbies|activities|'
        r'volunteering?|professional\s+development|training|courses?|workshops?|seminars?|conferences?|'
        r'memberships?|affiliations?|associations?|achievements?|accomplishments?|qualifications?|'
        r'competencies|expertise|highlights?|overview|background|history|details?|information|about|'
        r'personal\s+information|work\s+history|employment\s+history|career\s+summary|technical\s+skills|'
        r'core\s+competencies|key\s+achievements|professional\s+summary|executive\s+summary|career\s+objective|'
        r'professional\s+profile|academic\s+background|educational\s+background|relevant\s+experience|'
        r'professional\s+experience|additional\s+information|other\s+information|supplemental\s+information|'
        r'career\s+highlights|notable\s+projects|selected\s+projects|key\s+projects|technical\s+expertise|'
        r'areas\s+of\s+expertise|core\s+skills|key\s+skills|technical\s+proficiencies|professional\s+certifications|'
        r'licenses\s+and\s+certifications|professional\s+development|continuing\s+education|relevant\s+coursework|'
        r'honors\s+and\s+awards|achievements\s+and\s+awards|publications\s+and\s+presentations|research\s+experience|'
        r'teaching\s+experience|leadership\s+experience|volunteer\s+experience|community\s+involvement|'
        r'professional\s+memberships|professional\s+affiliations|board\s+memberships|speaking\s+engagements|'
        r'patents|presentations|conferences\s+attended|training\s+programs|professional\s+training|'
        r'computer\s+skills|software\s+skills|programming\s+languages|tools\s+and\s+technologies|'
        r'personal\s+interests|extracurricular\s+activities|references\s+available|references\s+upon\s+request)s?(?:\s*:)?$'
    )
    
    # Company indicators
    COMPANY_SUFFIXES = re.compile(
        r'(?i)\b(?:inc|llc|corp|corporation|ltd|limited|co|company|group|technologies|tech|systems|solutions|services|consulting|associates|partners|industries|enterprises|holdings|ventures|labs|laboratory|studios|agency|firm|consultancy|institute|foundation|organization|bank|financial|capital|global|international|worldwide)\b'
    )
    
    # Date patterns - ordered from most specific to least specific
    DATE_PATTERNS = [
        # Month Day, Year or Month Year
        re.compile(r'(?i)(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)[a-z]*\.?\s*\d{1,2}?\s*,?\s*\d{4}'),
        # Year - Month (2024 - Present)
        re.compile(r'\d{4}\s*[-–—]\s*(?:present|current|ongoing|now|today)', re.IGNORECASE),
        # Month Year - Month Year
        re.compile(r'(?i)(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)[a-z]*\.?\s*\d{4}\s*[-–—]\s*(?:(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)[a-z]*\.?\s*\d{4}|present|current|ongoing|now|today)'),
        # MM/YYYY or MM-YYYY
        re.compile(r'\d{1,2}[/-]\d{4}'),
        # MM/DD/YYYY or MM-DD-YYYY
        re.compile(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}'),
        # YYYY-MM-DD
        re.compile(r'\d{4}[/-]\d{1,2}[/-]\d{1,2}'),
        # Year range: YYYY - YYYY
        re.compile(r'\d{4}\s*[-–—]\s*\d{4}'),
        # Season Year (Spring 2023)
        re.compile(r'(?i)(spring|summer|fall|autumn|winter)\s+\d{4}'),
        # Just year
        re.compile(r'(?<!\d)\d{4}(?!\d)'),
        # Abbreviated month with period (Jan. 2023)
        re.compile(r'(?i)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*\d{4}'),
        # Present/Current indicators
        re.compile(r'(?i)(?:present|current|ongoing|till\s+date|to\s+date|now|today)'),
    ]
    
    @classmethod
    def find_section_boundaries(cls, text: str) -> Dict[str, tuple]:
        """
        Find section boundaries in resume text using Lever-style detection.
        
        Lever patterns:
        - Section headers must be ALL CAPS
        - Headers must be the only text on the line
        - Headers are typically bold (we can't detect this in plain text)
        
        Args:
            text: Resume text
            
        Returns:
            Dictionary mapping section names to (start, end) positions
        """
        sections = {}
        text_lines = text.split('\n')
        
        # Track line positions in original text
        line_positions = []
        current_pos = 0
        for line in text_lines:
            line_positions.append(current_pos)
            current_pos += len(line) + 1  # +1 for newline
        line_positions.append(len(text))  # Add end position
        
        # Find all section headers with their positions
        found_sections = []
        
        # Lever-style section keywords (must be in ALL CAPS)
        lever_sections = {
            'experience': ['EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE', 
                          'EMPLOYMENT', 'WORK HISTORY', 'CAREER HISTORY'],
            'education': ['EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
                         'ACADEMIC CREDENTIALS', 'DEGREES'],
            'skills': ['SKILLS', 'TECHNICAL SKILLS', 'CORE SKILLS', 'COMPETENCIES',
                      'TECHNOLOGIES', 'EXPERTISE', 'PROFICIENCIES'],
            'projects': ['PROJECTS', 'KEY PROJECTS', 'SELECTED PROJECTS'],
            'certifications': ['CERTIFICATIONS', 'CERTIFICATES', 'LICENSES',
                             'PROFESSIONAL CERTIFICATIONS', 'CREDENTIALS'],
            'summary': ['SUMMARY', 'PROFESSIONAL SUMMARY', 'PROFILE', 'OBJECTIVE',
                       'EXECUTIVE SUMMARY', 'CAREER SUMMARY'],
            'languages': ['LANGUAGES', 'LANGUAGE SKILLS']
        }
        
        for i, line in enumerate(text_lines):
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            # Lever-style: must be ALL CAPS and match known section headers
            if line_stripped.isupper() and len(line_stripped) < 50:
                # Remove trailing colons for matching
                line_clean = line_stripped.rstrip(':')
                
                # Check against known section headers
                for section_name, keywords in lever_sections.items():
                    if line_clean in keywords:
                        # Additional validation for Lever-style:
                        # 1. Should be the only text on the line
                        # 2. Often followed by blank line or content
                        # 3. No other text on the same line
                        
                        # Check if it's truly standalone (no inline content)
                        if ':' not in line_stripped or line_stripped.endswith(':'):
                            start_pos = line_positions[i]
                            # Start after the header line
                            content_start = line_positions[i + 1] if i + 1 < len(line_positions) else start_pos
                            found_sections.append((section_name, i, content_start))
                            break
        
        # Remove duplicate sections (keep first occurrence)
        seen_sections = set()
        unique_sections = []
        for section_name, line_num, start_pos in found_sections:
            if section_name not in seen_sections:
                seen_sections.add(section_name)
                unique_sections.append((section_name, line_num, start_pos))
        
        # Sort by line number
        unique_sections.sort(key=lambda x: x[1])
        
        # Calculate end positions
        result = {}
        for i, (section_name, line_num, start_pos) in enumerate(unique_sections):
            # End position is start of next section or end of text
            if i + 1 < len(unique_sections):
                end_pos = unique_sections[i + 1][2]
            else:
                end_pos = len(text)
            
            result[section_name] = (start_pos, end_pos)
        
        return result
    
    @classmethod
    def extract_emails(cls, text: str) -> List[str]:
        """Extract email addresses from text."""
        return cls.EMAIL.findall(text)
    
    @classmethod
    def extract_urls(cls, text: str) -> List[str]:
        """Extract URLs from text."""
        return cls.URL.findall(text)
    
    @classmethod
    def extract_github_username(cls, text: str) -> Optional[str]:
        """Extract GitHub username from text."""
        match = cls.GITHUB_URL.search(text)
        return match.group(1) if match else None
    
    @classmethod
    def extract_linkedin_username(cls, text: str) -> Optional[str]:
        """Extract LinkedIn username from text."""
        match = cls.LINKEDIN_URL.search(text)
        return match.group(1) if match else None
    
    @classmethod
    def extract_locations(cls, text: str) -> List[tuple]:
        """Extract locations in 'City, State' format."""
        return cls.LOCATION_PATTERN.findall(text)
    
    @classmethod
    def extract_gpa(cls, text: str) -> Optional[tuple]:
        """
        Extract GPA from text.
        
        Returns:
            Tuple of (gpa, scale) or None if not found
        """
        match = cls.GPA_PATTERN.search(text)
        if match:
            gpa = float(match.group(1))
            scale = float(match.group(2)) if match.group(2) else 4.0
            return (gpa, scale)
        return None
    
    @classmethod
    def is_likely_university(cls, text: str) -> bool:
        """Check if text likely contains a university name."""
        return bool(cls.UNIVERSITY_KEYWORDS.search(text))
    
    @classmethod
    def is_likely_degree(cls, text: str) -> bool:
        """Check if text likely contains a degree."""
        # First check basic patterns
        if cls.DEGREE_PATTERNS.search(text):
            return True
        
        # Check for ALL CAPS degree patterns
        text_upper = text.upper()
        degree_keywords = ['BACHELOR', 'MASTER', 'PHD', 'DOCTORATE', 'ASSOCIATE', 
                          'DIPLOMA', 'CERTIFICATE', 'BS', 'MS', 'BA', 'MA', 'MBA',
                          'SCIENCE', 'ARTS', 'ENGINEERING', 'TECHNOLOGY', 'BUSINESS']
        
        return any(keyword in text_upper for keyword in degree_keywords)
    
    @classmethod
    def is_likely_job_title(cls, text: str) -> bool:
        """Check if text likely contains a job title."""
        return bool(cls.JOB_TITLE_KEYWORDS.search(text))
    
    @classmethod
    def is_likely_company(cls, text: str) -> bool:
        """Check if text likely contains a company name."""
        return bool(cls.COMPANY_SUFFIXES.search(text))
    
    @classmethod
    def clean_section_text(cls, text: str) -> str:
        """
        Clean text extracted from a section.
        
        Args:
            text: Raw section text
            
        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove bullet points and common formatting
        text = re.sub(r'^[•▪▫‣⁃]\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[-*]\s*', '', text, flags=re.MULTILINE)
        
        # Remove leading/trailing whitespace
        text = text.strip()
        
        return text
    
    @classmethod
    def extract_name_patterns(cls, text: str) -> List[str]:
        """
        Extract potential names using various patterns.
        
        Args:
            text: Text to search for names
            
        Returns:
            List of potential names
        """
        potential_names = []
        
        # Pattern 1: Two or three capitalized words at the beginning
        name_pattern1 = re.compile(r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s|$)', re.MULTILINE)
        matches = name_pattern1.findall(text[:500])  # Look in first 500 chars
        potential_names.extend(matches)
        
        # Pattern 2: Name after common labels
        name_pattern2 = re.compile(r'(?:Name|Contact):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})', re.IGNORECASE)
        matches = name_pattern2.findall(text[:500])
        potential_names.extend(matches)
        
        # Pattern 3: All caps name (JOHN DOE)
        name_pattern3 = re.compile(r'^([A-Z]{2,}(?:\s+[A-Z]{2,}){1,2})(?:\s|$)', re.MULTILINE)
        matches = name_pattern3.findall(text[:500])
        potential_names.extend([name.title() for name in matches])
        
        return potential_names
    
    @classmethod
    def is_valid_name(cls, name: str) -> bool:
        """Check if a string is likely a valid person's name."""
        if not name or len(name) < 3 or len(name) > 50:
            return False
        
        # First check if it's a section header
        if cls.is_section_header(name):
            return False
        
        # Exclude common resume keywords
        exclude_words = {
            'resume', 'cv', 'curriculum', 'vitae', 'professional', 'profile',
            'summary', 'objective', 'experience', 'education', 'skills',
            'contact', 'information', 'details', 'phone', 'email', 'address',
            'current', 'project', 'projects', 'certifications', 'languages',
            'awards', 'publications', 'interests', 'hobbies', 'activities',
            'references', 'competencies', 'expertise', 'highlights', 'overview',
            'background', 'history', 'achievements', 'accomplishments', 'qualifications'
        }
        
        name_lower = name.lower()
        
        # Exclude if contains common section keywords
        if any(word in name_lower for word in exclude_words):
            return False
        
        # Exclude if matches section header pattern
        if cls.SECTION_HEADER_KEYWORDS.match(name):
            return False
        
        # Check if it has at least one space (first and last name)
        # But allow single word if it's all caps (sometimes just first name is shown)
        if ' ' not in name.strip() and not name.isupper():
            return False
        
        # Check if all parts start with capital letters or are reasonable name components
        parts = name.split()
        
        # Allow common name connectors
        name_connectors = {'de', 'del', 'van', 'von', 'der', 'la', 'le', 'di', 'da', 'dos', 'das'}
        
        for part in parts:
            if part and part.lower() not in name_connectors:
                # Must start with capital or be all caps
                if not part[0].isupper():
                    return False
        
        # Check for reasonable number of parts (1-5 typically, allowing for complex names)
        if len(parts) < 1 or len(parts) > 5:
            return False
        
        # Additional validation: names shouldn't contain certain characters
        if re.search(r'[0-9@#$%^&*()_+=\[\]{};:"\\|<>?/]', name):
            return False
        
        return True
    
    @classmethod
    def extract_bullets(cls, text: str) -> List[str]:
        """Extract bullet points from text."""
        bullet_pattern = re.compile(r'^[•▪▫‣⁃\-\*]\s*(.+)$', re.MULTILINE)
        return bullet_pattern.findall(text)
    
    @classmethod
    def normalize_whitespace(cls, text: str) -> str:
        """Normalize whitespace in text."""
        # Replace multiple spaces (but not newlines) with single space
        lines = text.split('\n')
        normalized_lines = []
        for line in lines:
            # Replace multiple spaces within a line with single space
            normalized_line = re.sub(r' +', ' ', line.strip())
            normalized_lines.append(normalized_line)
        
        # Join lines back together
        text = '\n'.join(normalized_lines)
        
        # Replace multiple consecutive blank lines with double newline
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        return text.strip()
    
    @classmethod
    def merge_split_lines(cls, text: str) -> str:
        """
        Merge lines that appear to be split in the middle of words or sentences.
        Handles cases where PDF extraction splits text incorrectly.
        """
        lines = text.split('\n')
        merged_lines = []
        i = 0
        
        while i < len(lines):
            current_line = lines[i].strip()
            
            if not current_line:
                merged_lines.append('')
                i += 1
                continue
            
            # Check if we should merge with next line
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                
                # Merge if:
                # 1. Current line doesn't end with sentence-ending punctuation
                # 2. Next line starts with lowercase letter (continuation)
                # 3. Current line ends with hyphen (word split)
                # 4. Current line is very short and next line continues text
                should_merge = False
                
                if current_line and next_line:
                    # Don't merge if next line looks like a date
                    if re.search(r'^\d{1,2}/\d{4}|\d{4}\s*[-–]', next_line):
                        should_merge = False
                    # Don't merge if current line has location pattern (City, ST or City | ST)
                    elif re.search(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*[,|]\s*[A-Z]{2}\b', current_line):
                        should_merge = False
                    # Check if line ends mid-sentence
                    elif (not re.search(r'[.!?:]$', current_line) and 
                          not re.match(r'^[•▪▫‣⁃\-\*]', next_line) and
                          not cls.SECTION_HEADERS.get('experience', re.compile('')).match(next_line)):
                        
                        # Check for word continuation
                        if current_line.endswith('-'):
                            # Remove hyphen and merge
                            current_line = current_line[:-1]
                            should_merge = True
                        # Check if next line starts with lowercase
                        elif next_line and next_line[0].islower():
                            should_merge = True
                        # Very conservative merging - only merge if it's clearly a split sentence
                        elif (len(current_line) < 20 and  # Very short line
                              current_line.count(' ') < 3 and  # Few words
                              not re.search(r'[.!?]$', current_line) and
                              not current_line.isupper() and  # Don't merge ALL CAPS lines
                              not cls.is_likely_job_title(current_line) and  # Don't merge job titles
                              not cls.is_likely_company(current_line)):  # Don't merge company names
                            should_merge = True
                
                if should_merge:
                    # Merge lines
                    merged_line = current_line + ' ' + next_line
                    merged_lines.append(merged_line)
                    i += 2  # Skip next line since we merged it
                else:
                    merged_lines.append(current_line)
                    i += 1
            else:
                merged_lines.append(current_line)
                i += 1
        
        return '\n'.join(merged_lines)
    
    @classmethod
    def extract_name_with_context(cls, text: str) -> Optional[str]:
        """
        Extract name using Lever-style patterns.
        
        Lever typically expects:
        - Name at the very top of resume
        - Often in larger font (we can't detect)
        - Usually ALL CAPS or proper case
        - On its own line
        """
        lines = text.split('\n')
        
        # Strategy 1: First non-empty line that looks like a name
        for i, line in enumerate(lines[:5]):
            line = line.strip()
            if not line:
                continue
            
            # Skip URLs, emails, phone numbers
            if '@' in line or 'http' in line or re.search(r'\d{3}.*\d{3}.*\d{4}', line):
                continue
            
            # Skip if it's a known section header
            if cls.SECTION_HEADER_KEYWORDS.match(line):
                continue
            
            # Check if line is ALL CAPS (very common in resumes)
            if line.isupper():
                # Validate it looks like a name
                # Must be 2-4 words, no special chars except spaces
                if re.match(r'^[A-Z\s]+$', line):
                    words = line.split()
                    if 2 <= len(words) <= 4:
                        # Return as title case
                        return line.title()
            
            # Check if it's already in proper name format
            elif re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$', line):
                return line
        
        # Strategy 2: Look for name pattern near contact info
        email_match = cls.EMAIL.search(text[:500])
        if email_match:
            # Get text before email
            before_email = text[:email_match.start()]
            lines_before = before_email.split('\n')
            
            # Check last few lines before email
            for line in reversed(lines_before[-3:]):
                line = line.strip()
                if line and not cls.SECTION_HEADER_KEYWORDS.match(line):
                    # Check if it looks like a name
                    if line.isupper() and ' ' in line:
                        return line.title()
                    elif re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$', line):
                        return line
        
        # Strategy 3: Pattern-based extraction from first 200 chars
        first_part = text[:200]
        # Look for 2-4 capitalized words
        name_pattern = re.compile(r'^([A-Z][A-Z\s]{2,40})$', re.MULTILINE)
        matches = name_pattern.findall(first_part)
        for match in matches:
            words = match.strip().split()
            if 2 <= len(words) <= 4:
                return match.strip().title()
        
        return None
    
    @classmethod
    def is_section_header(cls, text: str) -> bool:
        """Check if text is likely a section header."""
        text = text.strip()
        
        # Check against known section headers
        for pattern in cls.SECTION_HEADERS.values():
            if pattern.match(text):
                return True
        
        # Check against section header keywords
        if cls.SECTION_HEADER_KEYWORDS.match(text):
            return True
        
        # Additional heuristics
        # 1. All caps AND matches common section keywords
        if text.isupper() and len(text) < 30:
            # Only treat as header if it contains section-related words
            section_words = ['EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS',
                           'SUMMARY', 'OBJECTIVE', 'LANGUAGES', 'AWARDS', 'PUBLICATIONS',
                           'INTERESTS', 'ACTIVITIES', 'REFERENCES', 'COMPETENCIES']
            if any(word in text for word in section_words):
                return True
        
        # 2. Ends with colon
        if text.endswith(':') and len(text) < 30:
            return True
        
        return False