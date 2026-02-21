"""
OpenAI provider for resume parsing.
"""
import os
import json
from typing import Optional
from . import LLMProvider, ParsedResume

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False


class OpenAIProvider(LLMProvider):
    """OpenAI provider for intelligent resume parsing."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4-turbo-preview"):
        """
        Initialize OpenAI provider.
        
        Args:
            api_key: OpenAI API key. If not provided, will check OPENAI_API_KEY env var
            model: Model to use (default: gpt-4-turbo-preview)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.client = None
        
        if HAS_OPENAI and self.api_key:
            self.client = OpenAI(api_key=self.api_key)
    
    def is_available(self) -> bool:
        """Check if OpenAI is available and configured."""
        return HAS_OPENAI and self.client is not None
    
    def parse_resume(self, text: str, job_description: Optional[str] = None) -> ParsedResume:
        """Parse resume using OpenAI."""
        if not self.is_available():
            raise RuntimeError("OpenAI provider is not available. Install with: pip install pyresume[openai]")
        
        prompt = self.get_prompt(text, job_description)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional resume parser. Extract structured information from resumes accurately."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,  # Low temperature for consistency
                response_format={"type": "json_object"}  # Force JSON response
            )
            
            # Extract the JSON response
            response_text = response.choices[0].message.content
            
            # Parse the JSON
            data = json.loads(response_text)
            
            # Create ParsedResume object
            return ParsedResume(
                name=data.get("name"),
                email=data.get("email"),
                phone=data.get("phone"),
                location=data.get("location"),
                linkedin=data.get("linkedin"),
                github=data.get("github"),
                website=data.get("website"),
                summary=data.get("summary"),
                experience=data.get("experience", []),
                education=data.get("education", []),
                skills=data.get("skills", []),
                certifications=data.get("certifications", []),
                projects=data.get("projects", []),
                raw_response=response_text,
                confidence=0.95  # GPT-4 typically has high accuracy
            )
            
        except json.JSONDecodeError as e:
            # If JSON parsing fails, return what we can
            return ParsedResume(
                raw_response=response_text if 'response_text' in locals() else str(e),
                confidence=0.0
            )
        except Exception as e:
            raise RuntimeError(f"Failed to parse resume with OpenAI: {str(e)}")