"""
Data models for resume information.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import date


@dataclass
class ContactInfo:
    """Contact information from resume."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


@dataclass
class Experience:
    """Work experience entry."""
    title: Optional[str] = None
    company: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    current: bool = False
    description: Optional[str] = None
    responsibilities: List[str] = field(default_factory=list)
    location: Optional[str] = None


@dataclass
class Education:
    """Education entry."""
    degree: Optional[str] = None
    institution: Optional[str] = None
    graduation_date: Optional[date] = None
    gpa: Optional[str] = None
    major: Optional[str] = None
    minor: Optional[str] = None
    location: Optional[str] = None


@dataclass
class Skill:
    """Skill with optional proficiency level."""
    name: str
    category: Optional[str] = None
    proficiency: Optional[str] = None  # e.g., "Expert", "Intermediate", "Beginner"


@dataclass
class Project:
    """Project entry."""
    name: Optional[str] = None
    description: Optional[str] = None
    technologies: List[str] = field(default_factory=list)
    url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


@dataclass
class Certification:
    """Certification entry."""
    name: Optional[str] = None
    issuer: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None


@dataclass
class Resume:
    """Complete resume data structure."""
    contact_info: ContactInfo = field(default_factory=ContactInfo)
    summary: Optional[str] = None
    experience: List[Experience] = field(default_factory=list)
    education: List[Education] = field(default_factory=list)
    skills: List[Skill] = field(default_factory=list)
    projects: List[Project] = field(default_factory=list)
    certifications: List[Certification] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    
    # Metadata
    raw_text: Optional[str] = None
    confidence_scores: Dict[str, float] = field(default_factory=dict)
    extraction_metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert resume to dictionary format."""
        return {
            'contact_info': self.contact_info.__dict__,
            'summary': self.summary,
            'experience': [exp.__dict__ for exp in self.experience],
            'education': [edu.__dict__ for edu in self.education],
            'skills': [skill.__dict__ for skill in self.skills],
            'projects': [proj.__dict__ for proj in self.projects],
            'certifications': [cert.__dict__ for cert in self.certifications],
            'languages': self.languages,
            'confidence_scores': self.confidence_scores,
            'extraction_metadata': self.extraction_metadata
        }
    
    def get_contact_summary(self) -> str:
        """Get a formatted contact summary."""
        parts = []
        if self.contact_info.name:
            parts.append(self.contact_info.name)
        if self.contact_info.email:
            parts.append(self.contact_info.email)
        if self.contact_info.phone:
            parts.append(self.contact_info.phone)
        return ' | '.join(parts)
    
    def get_years_experience(self) -> Optional[float]:
        """Calculate total years of experience."""
        if not self.experience:
            return None
        
        total_days = 0
        for exp in self.experience:
            if exp.start_date:
                end = exp.end_date if exp.end_date else date.today()
                days = (end - exp.start_date).days
                total_days += max(0, days)
        
        return round(total_days / 365.25, 1) if total_days > 0 else None