"""
Base classes and interfaces for LLM providers.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Union
from enum import Enum
import json


class LLMProviderType(Enum):
    """Supported LLM provider types."""
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"
    CUSTOM = "custom"
    REGEX = "regex"  # Fallback regex-based parser


@dataclass
class LLMConfig:
    """Configuration for an LLM provider."""
    provider_type: LLMProviderType
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model_name: Optional[str] = None
    temperature: float = 0.0  # Default to deterministic for parsing
    max_tokens: Optional[int] = None
    timeout: float = 30.0
    retry_attempts: int = 3
    extra_params: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> 'LLMConfig':
        """Create LLMConfig from dictionary."""
        provider_type = config_dict.get('provider_type')
        if isinstance(provider_type, str):
            provider_type = LLMProviderType(provider_type)
        
        return cls(
            provider_type=provider_type,
            api_key=config_dict.get('api_key'),
            api_base_url=config_dict.get('api_base_url'),
            model_name=config_dict.get('model_name'),
            temperature=config_dict.get('temperature', 0.0),
            max_tokens=config_dict.get('max_tokens'),
            timeout=config_dict.get('timeout', 30.0),
            retry_attempts=config_dict.get('retry_attempts', 3),
            extra_params=config_dict.get('extra_params', {})
        )


@dataclass
class LLMResponse:
    """Response from an LLM provider."""
    success: bool
    content: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def get_json(self) -> Optional[Dict[str, Any]]:
        """Extract JSON from content if available."""
        if self.structured_data:
            return self.structured_data
        
        if self.content:
            try:
                # Try to extract JSON from the content
                # Handle common cases where LLMs wrap JSON in markdown blocks
                content = self.content.strip()
                
                # Remove markdown code blocks if present
                if content.startswith('```json'):
                    content = content[7:]
                elif content.startswith('```'):
                    content = content[3:]
                
                if content.endswith('```'):
                    content = content[:-3]
                
                content = content.strip()
                
                # Try to parse as JSON
                return json.loads(content)
            except json.JSONDecodeError:
                # If direct parsing fails, try to find JSON in the content
                import re
                json_pattern = r'\{[^{}]*\}'
                matches = re.findall(json_pattern, content, re.DOTALL)
                for match in matches:
                    try:
                        return json.loads(match)
                    except json.JSONDecodeError:
                        continue
        
        return None


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    def __init__(self, config: LLMConfig):
        """Initialize provider with configuration."""
        self.config = config
        self._validate_config()
    
    @abstractmethod
    def _validate_config(self) -> None:
        """Validate provider-specific configuration."""
        pass
    
    @abstractmethod
    async def extract_structured(
        self,
        text: str,
        extraction_type: str,
        schema: Optional[Dict[str, Any]] = None,
        examples: Optional[List[Dict[str, Any]]] = None
    ) -> LLMResponse:
        """
        Extract structured data from text.
        
        Args:
            text: Input text to parse
            extraction_type: Type of extraction (e.g., 'contact_info', 'experience')
            schema: Optional JSON schema for the expected output
            examples: Optional few-shot examples
            
        Returns:
            LLMResponse with extracted data
        """
        pass
    
    @abstractmethod
    async def enhance_extraction(
        self,
        text: str,
        initial_extraction: Dict[str, Any],
        extraction_type: str
    ) -> LLMResponse:
        """
        Enhance an existing extraction with LLM capabilities.
        
        Args:
            text: Original text
            initial_extraction: Initial extraction from regex parser
            extraction_type: Type of extraction
            
        Returns:
            LLMResponse with enhanced data
        """
        pass
    
    async def batch_extract(
        self,
        texts: List[str],
        extraction_type: str,
        schema: Optional[Dict[str, Any]] = None
    ) -> List[LLMResponse]:
        """
        Batch extraction for multiple texts.
        
        Default implementation processes sequentially.
        Providers can override for parallel processing.
        """
        results = []
        for text in texts:
            result = await self.extract_structured(text, extraction_type, schema)
            results.append(result)
        return results
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get provider capabilities."""
        return {
            'supports_streaming': False,
            'supports_function_calling': False,
            'supports_json_mode': False,
            'max_context_length': None,
            'supports_batch': True,
        }
    
    @property
    def name(self) -> str:
        """Get provider name."""
        return self.config.provider_type.value