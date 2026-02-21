"""
Local LLM provider for resume parsing (Ollama, llama.cpp, custom endpoints).
"""
import json
import requests
from typing import Optional, Dict, Any
from . import LLMProvider, ParsedResume


class LocalLLMProvider(LLMProvider):
    """Local LLM provider for intelligent resume parsing."""
    
    def __init__(
        self, 
        endpoint: str = "http://localhost:11434/api/generate",
        model: str = "llama2",
        api_type: str = "ollama",
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 120
    ):
        """
        Initialize local LLM provider.
        
        Args:
            endpoint: API endpoint URL
            model: Model name
            api_type: Type of API ("ollama", "openai", "custom")
            headers: Optional headers for authentication
            timeout: Request timeout in seconds
        """
        self.endpoint = endpoint
        self.model = model
        self.api_type = api_type
        self.headers = headers or {}
        self.timeout = timeout
    
    def is_available(self) -> bool:
        """Check if the local LLM is available."""
        try:
            # Try a simple health check
            if self.api_type == "ollama":
                response = requests.get(
                    self.endpoint.replace("/api/generate", "/api/tags"),
                    timeout=5
                )
                return response.status_code == 200
            elif self.api_type == "openai":
                # OpenAI-compatible endpoints (like llama.cpp server)
                response = requests.get(
                    self.endpoint.replace("/v1/chat/completions", "/v1/models"),
                    headers=self.headers,
                    timeout=5
                )
                return response.status_code == 200
            else:
                # For custom endpoints, just try to reach it
                response = requests.get(self.endpoint, headers=self.headers, timeout=5)
                return response.status_code < 500
        except:
            return False
    
    def parse_resume(self, text: str, job_description: Optional[str] = None) -> ParsedResume:
        """Parse resume using local LLM."""
        if not self.is_available():
            raise RuntimeError(f"Local LLM at {self.endpoint} is not available")
        
        prompt = self.get_prompt(text, job_description)
        
        try:
            if self.api_type == "ollama":
                response = self._call_ollama(prompt)
            elif self.api_type == "openai":
                response = self._call_openai_compatible(prompt)
            else:
                response = self._call_custom(prompt)
            
            # Parse the JSON response
            if isinstance(response, dict):
                data = response
            else:
                # Try to extract JSON from text response
                json_text = self._extract_json(response)
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
                raw_response=str(response),
                confidence=0.85  # Slightly lower confidence for local models
            )
            
        except Exception as e:
            raise RuntimeError(f"Failed to parse resume with local LLM: {str(e)}")
    
    def _call_ollama(self, prompt: str) -> str:
        """Call Ollama API."""
        response = requests.post(
            self.endpoint,
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "temperature": 0.1
            },
            headers=self.headers,
            timeout=self.timeout
        )
        response.raise_for_status()
        return response.json().get("response", "")
    
    def _call_openai_compatible(self, prompt: str) -> str:
        """Call OpenAI-compatible API (like llama.cpp server)."""
        response = requests.post(
            self.endpoint,
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional resume parser. Extract structured information accurately."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.1
            },
            headers={**self.headers, "Content-Type": "application/json"},
            timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    def _call_custom(self, prompt: str) -> Any:
        """Call custom API endpoint."""
        # This is a generic implementation - override for specific APIs
        response = requests.post(
            self.endpoint,
            json={"prompt": prompt, "model": self.model},
            headers=self.headers,
            timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()
    
    def _extract_json(self, text: str) -> str:
        """Extract JSON from text response."""
        # Try to find JSON in the response
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            return text[start:end].strip()
        elif "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            return text[start:end].strip()
        elif "{" in text and "}" in text:
            # Try to extract JSON object
            start = text.find("{")
            end = text.rfind("}") + 1
            return text[start:end]
        else:
            return text