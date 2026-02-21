from typing import Dict, List, Any, Tuple, Type, Optional
from pydantic import BaseModel, Field
from plugins.base import BasePlugin, PluginMetadata, PluginCategory
import logging

class KeywordMatchResult(BaseModel):
    """Model for keyword matching results"""
    matched_keywords: List[str] = Field(
        default_factory=list,
        description="Keywords that were found in the resume"
    )
    missing_keywords: List[str] = Field(
        default_factory=list,
        description="Keywords that were not found in the resume"
    )
    match_score: float = Field(
        0.0,
        description="Match score as a percentage (0-100)"
    )
    category_scores: Dict[str, float] = Field(
        default_factory=dict,
        description="Match scores by category"
    )

class KeywordMatcherPlugin(BasePlugin):
    """Plugin for matching job-specific keywords in resumes"""
    
    # Define default keywords by category
    DEFAULT_KEYWORDS = {
        "technical_skills": [
            "python", "java", "javascript", "react", "node.js", 
            "sql", "aws", "docker", "kubernetes", "machine learning"
        ],
        "soft_skills": [
            "leadership", "communication", "teamwork", "problem solving",
            "time management", "creativity", "adaptability"
        ],
        "certifications": [
            "aws certified", "google cloud", "microsoft certified", 
            "cisco certified", "pmp", "scrum"
        ]
    }
    
    @property
    def metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="keyword_matcher",
            version="1.0.0",
            description="Matches job-specific keywords in resumes and calculates a match score",
            category=PluginCategory.CUSTOM,
            author="Resume Analysis Team"
        )
    
    def initialize(self) -> None:
        """Initialize the plugin."""
        logging.info(f"Initializing {self.metadata.name}")
        self.keywords = self.DEFAULT_KEYWORDS
    
    def get_model(self) -> Type[BaseModel]:
        """Get the Pydantic model for the keyword matcher."""
        return KeywordMatchResult
    
    def process_resume(self, resume: Any, text: str) -> Dict[str, Any]:
        """
        Process a resume to match keywords.
        
        Args:
            resume: The Resume object
            text: The raw text from the resume
            
        Returns:
            Dictionary with keyword matching results
        """
        logging.info(f"Matching keywords for resume: {resume.file_name}")
        
        # Convert text to lowercase for case-insensitive matching
        text_lower = text.lower()
        
        # Track matched and missing keywords by category
        results = {
            "matched_keywords": [],
            "missing_keywords": [],
            "match_score": 0.0,
            "category_scores": {}
        }
        
        total_keywords = 0
        total_matched = 0
        
        # Process each category
        for category, keywords in self.keywords.items():
            category_matched = []
            category_missing = []
            
            for keyword in keywords:
                total_keywords += 1
                if keyword.lower() in text_lower:
                    category_matched.append(keyword)
                    results["matched_keywords"].append(keyword)
                    total_matched += 1
                else:
                    category_missing.append(keyword)
                    results["missing_keywords"].append(keyword)
            
            # Calculate category score
            category_score = 0.0
            if keywords:  # Avoid division by zero
                category_score = (len(category_matched) / len(keywords)) * 100
            
            results["category_scores"][category] = round(category_score, 2)
        
        # Calculate overall match score
        if total_keywords > 0:
            results["match_score"] = round((total_matched / total_keywords) * 100, 2)
        
        logging.info(f"Keyword match score: {results['match_score']}%")
        
        return results 