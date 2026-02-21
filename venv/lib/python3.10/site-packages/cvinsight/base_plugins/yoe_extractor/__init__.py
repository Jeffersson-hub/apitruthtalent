from typing import Dict, List, Any, Tuple, Type, Optional
from datetime import datetime
from pydantic import BaseModel
from ...models.resume_models import WorkDates
from ...plugins.base import ExtractorPlugin, PluginMetadata, PluginCategory
from ...core.utils.date_utils import calculate_experience
import logging

class YoeExtractorPlugin(ExtractorPlugin):
    """Extractor plugin for years of experience information."""
    
    def __init__(self, llm_service):
        """Initialize the plugin with an LLM service."""
        self.llm_service = llm_service
    
    @property
    def metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="yoe_extractor",
            version="1.1.0",
            description="Calculates years of experience from work dates in experience data",
            category=PluginCategory.BASE,
            author="Resume Analysis Team"
        )
    
    def initialize(self) -> None:
        """Initialize the plugin."""
        logging.info(f"Initializing {self.metadata.name}")
    
    def get_model(self) -> Type[BaseModel]:
        """Get the Pydantic model for the extractor."""
        return WorkDates
    
    def get_prompt_template(self) -> str:
        """
        Get the prompt template for the extractor.
        This is required by the abstract class but not used in our implementation.
        """
        return ""
    
    def get_input_variables(self) -> List[str]:
        """
        Get the input variables for the prompt template.
        This is required by the abstract class but not used in our implementation.
        """
        return []
    
    def prepare_input_data(self, extracted_text: str) -> Dict[str, Any]:
        """
        Prepare the input data for the LLM.
        This is required by the abstract class but not used in our implementation.
        """
        return {}
    
    def extract(self, experience_data: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Calculate years of experience from experience data.
        
        Args:
            experience_data: The experience data extracted by the experience_extractor.
            
        Returns:
            A tuple of (extracted_data, token_usage)
        """
        # Initialize empty token usage since we're not using LLM
        token_usage = {
            "total_tokens": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "extractor": self.metadata.name,
            "source": "calculated"
        }
        
        # Default return if we can't calculate
        default_result = {
            "oldest_working_date": "",
            "newest_working_date": "",
            "YoE": "Unknown"
        }
        
        try:
            # Extract work experiences from the data
            work_experiences = experience_data.get('work_experiences', [])
            
            if not work_experiences:
                logging.warning("No work experiences found in experience data")
                return default_result, token_usage
            
            # Collect all valid dates
            dates = []
            for exp in work_experiences:
                start_date = exp.get('start_date', '')
                end_date = exp.get('end_date', '')
                
                if start_date:
                    dates.append(self.convert_to_date_format(start_date))
                if end_date:
                    dates.append(self.convert_to_date_format(end_date))
            
            # Filter out empty strings
            dates = [date for date in dates if date]
            
            if not dates:
                logging.warning("No valid dates found in work experiences")
                return default_result, token_usage
            
            # Convert dates to datetime objects for comparison
            date_objects = []
            for date_str in dates:
                try:
                    from ...core import config
                    date_obj = datetime.strptime(date_str, config.DATE_FORMAT)
                    date_objects.append((date_str, date_obj))
                except ValueError:
                    logging.debug(f"Could not parse date: {date_str}")
            
            if not date_objects:
                logging.warning("No valid date objects could be created")
                return default_result, token_usage
            
            # Find oldest and newest dates
            oldest_date = min(date_objects, key=lambda x: x[1])
            newest_date = max(date_objects, key=lambda x: x[1])
            
            oldest_working_date = oldest_date[0]
            newest_working_date = newest_date[0]
            
            # Calculate total experience
            total_experience = calculate_experience(oldest_working_date, newest_working_date)
            logging.info(f"Calculated YoE from dates - oldest: {oldest_working_date}, newest: {newest_working_date}, result: {total_experience}")
            
            processed_result = {
                "oldest_working_date": oldest_working_date,
                "newest_working_date": newest_working_date,
                "YoE": total_experience
            }
            
            return processed_result, token_usage
            
        except Exception as e:
            logging.exception(f"Error calculating YoE: {e}")
            return default_result, token_usage

    def convert_to_date_format(self, date_str: str) -> str:
        """
        Convert various date string formats to the standard dd/mm/yyyy format.
        
        Args:
            date_str: The date string to convert
            
        Returns:
            A date string in dd/mm/yyyy format
        """
        import re
        from datetime import datetime
        
        if not date_str:
            return ""
            
        # Check if already in correct format
        date_pattern = r'^\d{1,2}/\d{1,2}/\d{4}$'
        if re.match(date_pattern, date_str):
            return date_str
            
        # Handle "Present" or "Current"
        if date_str.lower() in ["present", "current", "now"]:
            now = datetime.now()
            return now.strftime("%d/%m/%Y")
            
        # Handle month name formats like "October 2020" or "Oct 2020" or "Oct-2020"
        month_pattern = r'(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s\-]*(\d{4})'
        match = re.search(month_pattern, date_str.lower())
        if match:
            # Extract the year
            year = match.group(1)
            
            # Parse the month
            month_map = {
                "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
                "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12"
            }
            
            for month_key, month_num in month_map.items():
                if month_key in date_str.lower():
                    return f"01/{month_num}/{year}"
        
        # Try to extract just year (fallback)
        year_pattern = r'(\d{4})'
        match = re.search(year_pattern, date_str)
        if match:
            year = match.group(1)
            return f"01/01/{year}"
            
        logging.warning(f"Could not convert date string to standard format: {date_str}")
        return "" 