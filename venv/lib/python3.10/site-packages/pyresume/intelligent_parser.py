"""
Intelligent resume parser using LLM providers.
"""
from typing import Optional, Dict, Any, Union
from pathlib import Path

from .parser import ResumeParser as RegexParser
from .models.resume import Resume, ContactInfo, Experience, Education, Skill, Project, Certification
from .providers import registry, ParsedResume, LLMProvider
from .utils.dates import DateParser

# Create a date parser instance
date_parser = DateParser()


class IntelligentResumeParser:
    """
    Resume parser that uses LLMs for intelligent parsing with fallback to regex.
    
    This parser can work with:
    - Anthropic Claude API
    - OpenAI API
    - Local LLMs (Ollama, llama.cpp, custom endpoints)
    - Fallback to regex-based parsing
    """
    
    def __init__(
        self,
        provider: Optional[Union[str, LLMProvider]] = None,
        use_llm: bool = True,
        fallback_to_regex: bool = True,
        **provider_kwargs
    ):
        """
        Initialize intelligent parser.
        
        Args:
            provider: Provider name ("anthropic", "openai", "local") or LLMProvider instance
            use_llm: Whether to use LLM parsing (default: True)
            fallback_to_regex: Whether to fallback to regex if LLM fails (default: True)
            **provider_kwargs: Additional arguments for provider initialization
        """
        self.use_llm = use_llm
        self.fallback_to_regex = fallback_to_regex
        self.regex_parser = RegexParser()
        
        # Initialize LLM provider
        self.llm_provider = None
        if use_llm:
            if isinstance(provider, str):
                self.llm_provider = self._create_provider(provider, **provider_kwargs)
            elif isinstance(provider, LLMProvider):
                self.llm_provider = provider
            else:
                # Try to get from registry
                self.llm_provider = registry.get()
    
    def _create_provider(self, provider_type: str, **kwargs) -> Optional[LLMProvider]:
        """Create a provider instance."""
        if provider_type == "anthropic":
            from .providers.anthropic_provider import AnthropicProvider
            provider = AnthropicProvider(**kwargs)
            registry.register("anthropic", provider)
            return provider
        elif provider_type == "openai":
            from .providers.openai_provider import OpenAIProvider
            provider = OpenAIProvider(**kwargs)
            registry.register("openai", provider)
            return provider
        elif provider_type == "local":
            from .providers.local_provider import LocalLLMProvider
            provider = LocalLLMProvider(**kwargs)
            registry.register("local", provider)
            return provider
        else:
            return registry.get(provider_type)
    
    def parse(
        self, 
        file_path: str,
        job_description: Optional[str] = None,
        use_llm: Optional[bool] = None
    ) -> Resume:
        """
        Parse a resume file.
        
        Args:
            file_path: Path to resume file
            job_description: Optional job description for context
            use_llm: Override the default use_llm setting
            
        Returns:
            Resume object with parsed data
        """
        # Extract text using existing extractors
        text = self._extract_text(file_path)
        
        # Determine whether to use LLM
        should_use_llm = use_llm if use_llm is not None else self.use_llm
        
        # Try LLM parsing first
        if should_use_llm and self.llm_provider and self.llm_provider.is_available():
            try:
                parsed = self.llm_provider.parse_resume(text, job_description)
                return self._convert_to_resume(parsed, file_path)
            except Exception as e:
# LLM parsing failed, fall back to regex if enabled
                if not self.fallback_to_regex:
                    raise
        
        # Fallback to regex parsing
        if self.fallback_to_regex or not should_use_llm:
            return self.regex_parser.parse(file_path)
        
        raise RuntimeError("No parsing method available")
    
    def parse_text(
        self,
        text: str,
        job_description: Optional[str] = None,
        use_llm: Optional[bool] = None
    ) -> Resume:
        """Parse resume from raw text."""
        should_use_llm = use_llm if use_llm is not None else self.use_llm
        
        if should_use_llm and self.llm_provider and self.llm_provider.is_available():
            try:
                parsed = self.llm_provider.parse_resume(text, job_description)
                return self._convert_to_resume(parsed, None)
            except Exception as e:
# LLM parsing failed, fall back to regex if enabled
                if not self.fallback_to_regex:
                    raise
        
        if self.fallback_to_regex or not should_use_llm:
            return self.regex_parser.parse_text(text)
        
        raise RuntimeError("No parsing method available")
    
    def _extract_text(self, file_path: str) -> str:
        """Extract text from file using existing extractors."""
        path = Path(file_path)
        extension = path.suffix.lower()
        
        if extension not in self.regex_parser.extractors:
            raise ValueError(f"Unsupported file format: {extension}")
        
        extractor = self.regex_parser.extractors[extension]
        return extractor.extract_text(file_path)
    
    def _convert_to_resume(self, parsed: ParsedResume, file_path: Optional[str]) -> Resume:
        """Convert ParsedResume to Resume model."""
        # Create contact info
        contact_info = ContactInfo(
            name=parsed.name,
            email=parsed.email,
            phone=parsed.phone,
            address=parsed.location,
            linkedin=parsed.linkedin,
            github=parsed.github,
            website=parsed.website
        )
        
        # Convert experience
        experiences = []
        for exp in parsed.experience:
            start_date = date_parser.parse(exp.get("start_date")) if exp.get("start_date") else None
            end_date = date_parser.parse(exp.get("end_date")) if exp.get("end_date") and exp.get("end_date") != "Present" else None
            
            experiences.append(Experience(
                title=exp.get("title"),
                company=exp.get("company"),
                location=exp.get("location"),
                start_date=start_date,
                end_date=end_date,
                current=exp.get("end_date") == "Present",
                description=exp.get("description"),
                responsibilities=exp.get("responsibilities", [])
            ))
        
        # Convert education
        educations = []
        for edu in parsed.education:
            grad_date = date_parser.parse(edu.get("graduation_date")) if edu.get("graduation_date") else None
            
            educations.append(Education(
                degree=edu.get("degree"),
                institution=edu.get("institution"),
                location=edu.get("location"),
                graduation_date=grad_date,
                gpa=edu.get("gpa"),
                major=edu.get("field"),
                minor=edu.get("minor")
            ))
        
        # Convert skills
        skills = [Skill(name=skill, category=self._categorize_skill(skill)) for skill in parsed.skills]
        
        # Convert projects
        projects = []
        for proj in parsed.projects:
            projects.append(Project(
                name=proj.get("name"),
                description=proj.get("description"),
                technologies=proj.get("technologies", []),
                url=proj.get("url")
            ))
        
        # Convert certifications
        certifications = []
        for cert in parsed.certifications:
            certifications.append(Certification(
                name=cert.get("name"),
                issuer=cert.get("issuer"),
                issue_date=date_parser.parse(cert.get("date")) if cert.get("date") else None,
                expiry_date=date_parser.parse(cert.get("expiry")) if cert.get("expiry") else None
            ))
        
        # Create confidence scores
        confidence_scores = {
            "contact_info": parsed.confidence,
            "experience": parsed.confidence,
            "education": parsed.confidence,
            "skills": parsed.confidence,
            "overall": parsed.confidence
        }
        
        # Create Resume object
        return Resume(
            contact_info=contact_info,
            summary=parsed.summary,
            experience=experiences,
            education=educations,
            skills=skills,
            projects=projects,
            certifications=certifications,
            raw_text=parsed.raw_response or "",
            confidence_scores=confidence_scores
        )
    
    def _categorize_skill(self, skill: str) -> str:
        """Categorize a skill."""
        skill_lower = skill.lower()
        
        programming_keywords = ["python", "java", "javascript", "c++", "c#", "ruby", "go", "rust", "swift", "kotlin"]
        web_keywords = ["html", "css", "react", "angular", "vue", "node", "django", "flask", "rails"]
        database_keywords = ["sql", "mysql", "postgresql", "mongodb", "redis", "oracle", "sqlite"]
        
        if any(keyword in skill_lower for keyword in programming_keywords):
            return "programming"
        elif any(keyword in skill_lower for keyword in web_keywords):
            return "web"
        elif any(keyword in skill_lower for keyword in database_keywords):
            return "database"
        else:
            return "other"