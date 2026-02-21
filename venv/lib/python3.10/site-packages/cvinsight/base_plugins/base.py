"""
Base Plugin for CVInsight

This module defines the BasePlugin abstract class that all plugins must inherit from.
"""
from typing import Any, Dict, List, Optional, Tuple, Type
from abc import ABC, abstractmethod
from pydantic import BaseModel
from ..core.llm_service import LLMService

class BasePlugin(ABC):
    """
    Abstract base class for all CVInsight plugins.
    
    All plugins must inherit from this class and implement its abstract methods.
    """
    
    def __init__(self, llm_service: LLMService):
        """
        Initialize the plugin with a language model service.
        
        Args:
            llm_service: The language model service to use for extraction.
        """
        self.llm_service = llm_service
    
    @property
    @abstractmethod
    def name(self) -> str:
        """
        Get the name of the plugin.
        
        Returns:
            The plugin name.
        """
        pass
    
    @property
    @abstractmethod
    def version(self) -> str:
        """
        Get the version of the plugin.
        
        Returns:
            The plugin version.
        """
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """
        Get the description of the plugin.
        
        Returns:
            The plugin description.
        """
        pass
    
    @property
    @abstractmethod
    def category(self) -> str:
        """
        Get the category of the plugin.
        
        Returns:
            The plugin category.
        """
        pass
    
    @property
    def author(self) -> str:
        """
        Get the author of the plugin.
        
        Returns:
            The plugin author.
        """
        return "CVInsight Team"
    
    @abstractmethod
    def initialize(self) -> None:
        """Initialize the plugin."""
        pass
    
    @abstractmethod
    def get_model(self) -> Type[BaseModel]:
        """
        Get the Pydantic model for the plugin.
        
        Returns:
            The Pydantic model class.
        """
        pass
    
    @abstractmethod
    def get_prompt_template(self) -> str:
        """
        Get the prompt template for the plugin.
        
        Returns:
            The prompt template string.
        """
        pass
    
    @abstractmethod
    def get_input_variables(self) -> List[str]:
        """
        Get the input variables for the prompt template.
        
        Returns:
            The list of input variable names.
        """
        pass
    
    def prepare_input_data(self, extracted_text: str) -> Dict[str, Any]:
        """
        Prepare input data for the prompt template.
        
        Args:
            extracted_text: The text to extract information from.
            
        Returns:
            Dictionary containing the prepared input data.
        """
        return {"text": extracted_text}
    
    def extract(self, extracted_text: str) -> Tuple[Dict[str, Any], Optional[Dict[str, int]]]:
        """
        Extract information from text.
        
        Args:
            extracted_text: The text to extract information from.
            
        Returns:
            Tuple containing:
            - Dictionary with extracted information
            - Optional dictionary with token usage information
        """
        try:
            # Get the model and prompt template
            model = self.get_model()
            prompt_template = self.get_prompt_template()
            input_variables = self.get_input_variables()
            
            # Prepare input data
            input_data = self.prepare_input_data(extracted_text)
            
            # Extract information using LLM
            result, token_usage = self.llm_service.extract_with_llm(
                model,
                prompt_template,
                input_variables,
                input_data
            )
            
            return result, token_usage
            
        except Exception as e:
            print(f"Error extracting information: {e}")
            return {}, None 