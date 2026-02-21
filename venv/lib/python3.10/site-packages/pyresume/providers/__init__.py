"""
LLM Provider abstraction for intelligent resume parsing.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import json


@dataclass
class ParsedResume:
    """Structured resume data returned by LLM providers."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    
    summary: Optional[str] = None
    
    experience: List[Dict[str, Any]] = None
    education: List[Dict[str, Any]] = None
    skills: List[str] = None
    certifications: List[Dict[str, Any]] = None
    projects: List[Dict[str, Any]] = None
    
    raw_response: Optional[str] = None
    confidence: float = 0.0
    
    def __post_init__(self):
        # Initialize empty lists if None
        self.experience = self.experience or []
        self.education = self.education or []
        self.skills = self.skills or []
        self.certifications = self.certifications or []
        self.projects = self.projects or []


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def parse_resume(self, text: str, job_description: Optional[str] = None) -> ParsedResume:
        """
        Parse resume text using the LLM.
        
        Args:
            text: Raw resume text
            job_description: Optional job description for better context
            
        Returns:
            ParsedResume object with structured data
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the provider is available and configured."""
        pass
    
    def get_prompt(self, text: str, job_description: Optional[str] = None) -> str:
        """
        Generate the prompt for resume parsing.
        
        This can be overridden by specific providers if needed.
        """
        prompt = f"""Extract structured information from the following resume. Be as accurate as possible and extract all relevant information.

Resume Text:
{text}

"""
        
        if job_description:
            prompt += f"""Job Description (for context):
{job_description}

"""
        
        prompt += """Please extract and return the following information in JSON format:
{
    "name": "Full name of the candidate",
    "email": "Email address",
    "phone": "Phone number",
    "location": "City, State/Country",
    "linkedin": "LinkedIn URL if present",
    "github": "GitHub URL if present", 
    "website": "Personal website if present",
    "summary": "Professional summary or objective",
    "experience": [
        {
            "title": "Job title",
            "company": "Company name",
            "location": "Job location",
            "start_date": "Start date (any format)",
            "end_date": "End date or 'Present'",
            "description": "Job description",
            "responsibilities": ["List of key responsibilities or achievements"]
        }
    ],
    "education": [
        {
            "degree": "Degree type (e.g., BS, MS, PhD)",
            "field": "Field of study/Major",
            "institution": "School/University name",
            "location": "School location",
            "graduation_date": "Graduation date or expected date",
            "gpa": "GPA if mentioned",
            "honors": "Any honors or distinctions"
        }
    ],
    "skills": ["List of technical and soft skills"],
    "certifications": [
        {
            "name": "Certification name",
            "issuer": "Issuing organization",
            "date": "Date obtained",
            "expiry": "Expiry date if applicable"
        }
    ],
    "projects": [
        {
            "name": "Project name",
            "description": "Project description",
            "technologies": ["Technologies used"],
            "date": "Project date or duration",
            "url": "Project URL if available"
        }
    ]
}

Important:
- Extract the actual name of the person, not section headers
- For dates, preserve the original format
- If information is not found, use null
- For skills, include both technical skills and tools
- Extract ALL work experiences and education entries
"""
        
        return prompt


class ProviderRegistry:
    """Registry for managing LLM providers."""
    
    def __init__(self):
        self._providers: Dict[str, LLMProvider] = {}
        self._default_provider: Optional[str] = None
    
    def register(self, name: str, provider: LLMProvider):
        """Register a new provider."""
        self._providers[name] = provider
        if not self._default_provider and provider.is_available():
            self._default_provider = name
    
    def get(self, name: Optional[str] = None) -> Optional[LLMProvider]:
        """Get a provider by name or the default provider."""
        if name:
            return self._providers.get(name)
        elif self._default_provider:
            return self._providers.get(self._default_provider)
        
        # Try to find any available provider
        for provider_name, provider in self._providers.items():
            if provider.is_available():
                return provider
        
        return None
    
    def list_providers(self) -> List[str]:
        """List all registered providers."""
        return list(self._providers.keys())
    
    def set_default(self, name: str):
        """Set the default provider."""
        if name in self._providers:
            self._default_provider = name
        else:
            raise ValueError(f"Provider '{name}' not found")


# Global registry instance
registry = ProviderRegistry()