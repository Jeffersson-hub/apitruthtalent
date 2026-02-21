"""
Anthropic Claude provider for resume parsing.
"""
import os
import json
from typing import Optional
from . import LLMProvider, ParsedResume

try:
    from anthropic import Anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider for intelligent resume parsing."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-3-sonnet-20240229"):
        """
        Initialize Anthropic provider.
        
        Args:
            api_key: Anthropic API key. If not provided, will check ANTHROPIC_API_KEY env var
            model: Model to use (default: claude-3-sonnet-20240229)
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model = model
        self.client = None
        
        if HAS_ANTHROPIC and self.api_key:
            self.client = Anthropic(api_key=self.api_key)
    
    def is_available(self) -> bool:
        """Check if Anthropic is available and configured."""
        return HAS_ANTHROPIC and self.client is not None
    
    def parse_resume(self, text: str, job_description: Optional[str] = None) -> ParsedResume:
        """Parse resume using Claude."""
        if not self.is_available():
            raise RuntimeError("Anthropic provider is not available. Install with: pip install pyresume[anthropic]")
        
        prompt = self.get_prompt(text, job_description)
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                temperature=0.1,  # Low temperature for consistency
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            # Extract the JSON response
            response_text = response.content[0].text
            
            # Try to parse JSON from the response
            # Claude might wrap it in markdown code blocks
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                json_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                json_text = response_text[json_start:json_end].strip()
            else:
                json_text = response_text
            
            # Parse the JSON
            data = json.loads(json_text)
            
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
                confidence=0.95  # Claude typically has high accuracy
            )
            
        except json.JSONDecodeError as e:
            # If JSON parsing fails, return what we can
            return ParsedResume(
                raw_response=response_text if 'response_text' in locals() else str(e),
                confidence=0.0
            )
        except Exception as e:
            raise RuntimeError(f"Failed to parse resume with Anthropic: {str(e)}")