"""
LLM integration module for pyresume.

This module provides interfaces and implementations for various LLM providers
to enhance resume parsing capabilities.
"""

from .base import LLMProvider, LLMConfig, LLMResponse
from .providers import (
    AnthropicProvider,
    OpenAIProvider,
    OllamaProvider,
    CustomEndpointProvider,
    RegexFallbackProvider
)
from .manager import LLMManager
from .prompts import PromptTemplates

__all__ = [
    # Base classes
    'LLMProvider',
    'LLMConfig',
    'LLMResponse',
    
    # Providers
    'AnthropicProvider',
    'OpenAIProvider',
    'OllamaProvider',
    'CustomEndpointProvider',
    'RegexFallbackProvider',
    
    # Manager
    'LLMManager',
    
    # Prompts
    'PromptTemplates',
]