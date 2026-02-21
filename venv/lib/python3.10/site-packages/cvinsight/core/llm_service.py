"""LLM service for CVInsight."""
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from functools import lru_cache
from . import config
from typing import Type, Any, Dict, Tuple, Optional
from pydantic import BaseModel
import logging
import os

class LLMService:
    """Service for interacting with LLM API."""
    
    def __init__(self, model_name=None, api_key=None):
        """
        Initialize the LLM service.
        
        Args:
            model_name: The name of the model to use. Defaults to config.DEFAULT_LLM_MODEL.
            api_key: The API key to use. If None, will use config.GOOGLE_API_KEY
        """
        self.model_name = model_name or config.DEFAULT_LLM_MODEL
        self.api_key = api_key or config.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")
        
        if not self.api_key:
            raise ValueError("Google API key is required. Either provide it directly to LLMService or set the GOOGLE_API_KEY environment variable.")
            
        self.llm = self._get_llm()
    
    def _get_llm(self):
        """
        Get a LLM instance.
        
        Returns:
            A ChatGoogleGenerativeAI instance.
        """
        return ChatGoogleGenerativeAI(api_key=self.api_key, model=self.model_name)
    
    def create_extraction_chain(self, pydantic_model: Type[BaseModel], prompt_template: str, input_variables: list):
        """
        Create a chain for extracting information using a language model.
        
        Args:
            pydantic_model: The Pydantic model to use for parsing the output.
            prompt_template: The prompt template to use.
            input_variables: The list of input variables for the prompt template.
            
        Returns:
            A chain that can be used to extract information.
        """
        parser = JsonOutputParser(pydantic_object=pydantic_model)
        
        prompt = PromptTemplate(
            template=prompt_template,
            input_variables=input_variables,
            partial_variables={"format_instructions": parser.get_format_instructions()}
        )
        
        return prompt | self.llm | parser
    
    def extract_with_llm(self, pydantic_model: Type[BaseModel], prompt_template: str, 
                        input_variables: list, input_data: dict) -> Tuple[Any, Dict[str, int]]:
        """
        Extract information from text using a language model.
        
        Args:
            pydantic_model: The Pydantic model to use for parsing the output.
            prompt_template: The prompt template to use.
            input_variables: The list of input variables for the prompt template.
            input_data: The input data to pass to the prompt template.
            
        Returns:
            A tuple containing:
            - The extracted information as a dictionary
            - A dictionary with token usage information
        """
        try:
            # Initialize token usage
            token_usage = {
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0
            }
            
            # Create a custom callback handler to track token usage
            from langchain.callbacks.base import BaseCallbackHandler
            from langchain.schema import LLMResult
            
            class TokenUsageCallbackHandler(BaseCallbackHandler):
                def __init__(self):
                    super().__init__()
                    self.token_usage = {
                        "total_tokens": 0,
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "source": "not_set"
                    }
                    
                def on_llm_end(self, response: LLMResult, **kwargs) -> None:
                    """Extract token usage from the LLM response."""
                    # First check for usage_metadata in the generations (specific to Gemini via langchain_google_genai)
                    token_found = False
                    if hasattr(response, "generations") and response.generations:
                        for gen_list in response.generations:
                            for gen in gen_list:
                                # Check for usage_metadata (Gemini's specific location for token info)
                                if hasattr(gen, "usage_metadata") and gen.usage_metadata:
                                    usage = gen.usage_metadata
                                    self.token_usage["total_tokens"] = usage.get("total_tokens", 0)
                                    self.token_usage["prompt_tokens"] = usage.get("input_tokens", 0)  # Gemini uses input_tokens
                                    self.token_usage["completion_tokens"] = usage.get("output_tokens", 0)  # Gemini uses output_tokens
                                    self.token_usage["source"] = "usage_metadata"
                                    token_found = True
                                    logging.info(f"Token usage found in usage_metadata: {usage}")
                                    return
                                
                                # Check for usage_metadata in generation's message (alternate location)
                                if hasattr(gen, "message") and hasattr(gen.message, "usage_metadata") and gen.message.usage_metadata:
                                    usage = gen.message.usage_metadata
                                    self.token_usage["total_tokens"] = usage.get("total_tokens", 0)
                                    self.token_usage["prompt_tokens"] = usage.get("input_tokens", 0)
                                    self.token_usage["completion_tokens"] = usage.get("output_tokens", 0)
                                    self.token_usage["source"] = "message_usage_metadata"
                                    token_found = True
                                    logging.info(f"Token usage found in message usage_metadata: {usage}")
                                    return
                                    
                                # Fall back to checking in generation_info
                                if hasattr(gen, "generation_info") and gen.generation_info:
                                    usage = gen.generation_info.get("token_usage", {})
                                    if usage:
                                        self.token_usage["total_tokens"] += usage.get("total_tokens", 0)
                                        self.token_usage["prompt_tokens"] += usage.get("prompt_tokens", 0) 
                                        self.token_usage["completion_tokens"] += usage.get("completion_tokens", 0)
                                        self.token_usage["source"] = "generation_info"
                                        token_found = True
                    
                    # Check for token usage in llm_output (standard location)
                    if not token_found and hasattr(response, "llm_output") and response.llm_output:
                        usage = response.llm_output.get("token_usage", {})
                        if usage:
                            self.token_usage["total_tokens"] += usage.get("total_tokens", 0)
                            self.token_usage["prompt_tokens"] += usage.get("prompt_tokens", 0)
                            self.token_usage["completion_tokens"] += usage.get("completion_tokens", 0)
                            self.token_usage["source"] = "llm_output"
            
            # Use the custom callback to track token usage
            callback_handler = TokenUsageCallbackHandler()
            
            # Create the chain and include our callback
            chain = self.create_extraction_chain(pydantic_model, prompt_template, input_variables)
            
            # Invoke the chain with our custom callback
            from langchain.callbacks.manager import CallbackManager
            result = chain.invoke(input_data, config={"callbacks": [callback_handler]})
            
            # Get token usage from callback
            token_usage = callback_handler.token_usage
            
            # Estimate tokens if we couldn't get accurate counts
            if token_usage["total_tokens"] == 0:
                # Estimate based on text length
                prompt_text = prompt_template.format(**input_data)
                # Rough estimate: 4 chars per token
                estimated_prompt_tokens = len(prompt_text) // 4
                estimated_completion_tokens = len(str(result)) // 4
                
                token_usage["prompt_tokens"] = estimated_prompt_tokens
                token_usage["completion_tokens"] = estimated_completion_tokens
                token_usage["total_tokens"] = estimated_prompt_tokens + estimated_completion_tokens
                token_usage["is_estimated"] = True
                token_usage["source"] = "estimation"
                logging.info(f"Token counts are estimated. No token information provided by API.")
            
            # Convert Pydantic model to dictionary (for consistency)
            if isinstance(result, pydantic_model):
                return result.model_dump(), token_usage
            elif isinstance(result, dict):
                return result, token_usage
            elif hasattr(result, "__dict__"):
                return result.__dict__, token_usage
                
            # If we got here, something unexpected happened. Return an empty dict.
            return {}, token_usage
            
        except Exception as e:
            print(f"Error extracting information with LLM: {e}")
            # Return an empty dictionary and empty token usage
            empty_token_usage = {"total_tokens": 0, "prompt_tokens": 0, "completion_tokens": 0, "source": "error"}
            return {}, empty_token_usage 