"""
PyResume - A standalone Python library for parsing resumes.

This library provides tools to extract structured data from resume files
in various formats including PDF, DOCX, and plain text.

Basic usage:
    from pyresume import ResumeParser
    
    parser = ResumeParser()
    resume = parser.parse('resume.pdf')
    
    print(f"Name: {resume.contact_info.name}")
    print(f"Email: {resume.contact_info.email}")
    print(f"Experience: {len(resume.experience)} jobs")
"""

__version__ = "0.1.0"
__author__ = "PyResume Team"
__email__ = "contact@pyresume.dev"

# Main exports
from .parser import ResumeParser
from .intelligent_parser import IntelligentResumeParser
from .models.resume import (
    Resume,
    ContactInfo,
    Experience,
    Education,
    Skill,
    Project,
    Certification
)

# Import providers if available
try:
    from .providers import registry
    from .providers.anthropic_provider import AnthropicProvider
    from .providers.openai_provider import OpenAIProvider
    from .providers.local_provider import LocalLLMProvider
except ImportError:
    pass

# Utility exports
from .utils.dates import DateParser
from .utils.phones import PhoneParser
from .utils.patterns import ResumePatterns

# Extractor exports
from .extractors.pdf import PDFExtractor
from .extractors.docx import DOCXExtractor
from .extractors.text import TextExtractor

__all__ = [
    # Main classes
    'ResumeParser',
    'IntelligentResumeParser',
    
    # Data models
    'Resume',
    'ContactInfo',
    'Experience',
    'Education',
    'Skill',
    'Project',
    'Certification',
    
    # Utilities
    'DateParser',
    'PhoneParser',
    'ResumePatterns',
    
    # Extractors
    'PDFExtractor',
    'DOCXExtractor',
    'TextExtractor',
    
    # Metadata
    '__version__',
    '__author__',
    '__email__',
]


def get_version():
    """Get the current version of pyresume."""
    return __version__


def get_supported_formats():
    """Get list of supported file formats."""
    return ['.pdf', '.docx', '.txt']


def check_dependencies():
    """Check if optional dependencies are available."""
    dependencies = {
        'pdfplumber': False,
        'python-docx': False,
        'phonenumbers': False,
        'chardet': True,  # Usually included
        'pytesseract': False,
        'spacy': False,
    }
    
    try:
        import pdfplumber
        dependencies['pdfplumber'] = True
    except ImportError:
        pass
    
    try:
        import docx
        dependencies['python-docx'] = True
    except ImportError:
        pass
    
    try:
        import phonenumbers
        dependencies['phonenumbers'] = True
    except ImportError:
        pass
    
    try:
        import chardet
        dependencies['chardet'] = True
    except ImportError:
        dependencies['chardet'] = False
    
    try:
        import pytesseract
        dependencies['pytesseract'] = True
    except ImportError:
        pass
    
    try:
        import spacy
        dependencies['spacy'] = True
    except ImportError:
        pass
    
    return dependencies


# Optional CLI module import
try:
    from . import cli
    __all__.append('cli')
except ImportError:
    # CLI module is optional
    pass