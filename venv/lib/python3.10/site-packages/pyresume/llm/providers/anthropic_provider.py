"""
Anthropic Claude API provider implementation.
"""
from typing import Optional, Dict, Any, List
import json
import asyncio
from ..base import LLMProvider, LLMResponse, LLMConfig
from ..prompts import PromptTemplates


class AnthropicProvider(LLMProvider):
    """Provider for Anthropic's Claude API."""
    
    def __init__(self, config: LLMConfig):
        """Initialize Anthropic provider."""
        super().__init__(config)
        self._client = None
        self._async_client = None
    
    def _validate_config(self) -> None:
        """Validate Anthropic configuration."""
        if not self.config.api_key:
            raise ValueError("Anthropic provider requires an API key")
        
        # Set default model if not specified
        if not self.config.model_name:
            self.config.model_name = "claude-3-sonnet-20240229"
    
    def _get_client(self):
        """Get or create Anthropic client."""
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.Anthropic(
                    api_key=self.config.api_key,
                    base_url=self.config.api_base_url,
                    timeout=self.config.timeout,
                    max_retries=self.config.retry_attempts
                )
            except ImportError:
                raise ImportError(
                    "anthropic package is required for AnthropicProvider. "
                    "Install with: pip install anthropic"
                )
        return self._client
    
    async def _get_async_client(self):
        """Get or create async Anthropic client."""
        if self._async_client is None:
            try:
                import anthropic
                self._async_client = anthropic.AsyncAnthropic(
                    api_key=self.config.api_key,
                    base_url=self.config.api_base_url,
                    timeout=self.config.timeout,
                    max_retries=self.config.retry_attempts
                )
            except ImportError:
                raise ImportError(
                    "anthropic package is required for AnthropicProvider. "
                    "Install with: pip install anthropic"
                )
        return self._async_client
    
    async def extract_structured(
        self,
        text: str,
        extraction_type: str,
        schema: Optional[Dict[str, Any]] = None,
        examples: Optional[List[Dict[str, Any]]] = None
    ) -> LLMResponse:
        """Extract structured data using Claude."""
        try:
            client = await self._get_async_client()
            
            # Get prompt template
            prompt = PromptTemplates.get_extraction_prompt(
                extraction_type, text, schema, examples
            )
            
            # Prepare messages
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            # Add system message for JSON output
            system_prompt = (
                "You are a resume parsing assistant. Extract structured data from resumes "
                "and return it as valid JSON. Be precise and accurate. "
                "Only extract information that is explicitly stated in the text."
            )
            
            # Make API call
            response = await client.messages.create(
                model=self.config.model_name,
                messages=messages,
                system=system_prompt,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens or 4096,
                **self.config.extra_params
            )
            
            # Extract content
            content = response.content[0].text if response.content else ""
            
            return LLMResponse(
                success=True,
                content=content,
                metadata={
                    'model': self.config.model_name,
                    'usage': {
                        'input_tokens': response.usage.input_tokens,
                        'output_tokens': response.usage.output_tokens
                    }
                }
            )
            
        except Exception as e:
            return LLMResponse(
                success=False,
                error=str(e),
                metadata={'provider': 'anthropic'}
            )
    
    async def enhance_extraction(
        self,
        text: str,
        initial_extraction: Dict[str, Any],
        extraction_type: str
    ) -> LLMResponse:
        """Enhance existing extraction with Claude."""
        try:
            client = await self._get_async_client()
            
            # Get enhancement prompt
            prompt = PromptTemplates.get_enhancement_prompt(
                extraction_type, text, initial_extraction
            )
            
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            system_prompt = (
                "You are a resume parsing assistant. Review and enhance the initial extraction "
                "by filling in missing information and correcting errors. "
                "Return the enhanced data as valid JSON."
            )
            
            response = await client.messages.create(
                model=self.config.model_name,
                messages=messages,
                system=system_prompt,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens or 4096,
                **self.config.extra_params
            )
            
            content = response.content[0].text if response.content else ""
            
            return LLMResponse(
                success=True,
                content=content,
                metadata={
                    'model': self.config.model_name,
                    'usage': {
                        'input_tokens': response.usage.input_tokens,
                        'output_tokens': response.usage.output_tokens
                    }
                }
            )
            
        except Exception as e:
            return LLMResponse(
                success=False,
                error=str(e),
                metadata={'provider': 'anthropic'}
            )
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get Anthropic provider capabilities."""
        return {
            'supports_streaming': True,
            'supports_function_calling': False,  # Not yet, but coming soon
            'supports_json_mode': False,  # Claude is good at JSON without explicit mode
            'max_context_length': 200000,  # Claude 3 context window
            'supports_batch': True,
        }