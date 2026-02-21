"""
CVInsight - AI-powered resume analysis and parsing

A powerful tool for extracting structured information from resumes using Google's Gemini LLM.
"""

__version__ = "0.1.0"

# Export the client class
from .client import CVInsightClient

# Import high-level functions for direct use
from .api import (
    extract_all,
    extract_profile,
    extract_education,
    extract_experience,
    extract_skills,
    extract_years_of_experience,
    analyze_resume,
    list_all_plugins,
    list_plugins_by_category
) 