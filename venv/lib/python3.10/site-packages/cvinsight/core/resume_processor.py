import os
import logging
import concurrent.futures
import json
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from ..models.resume_models import Resume
from ..plugins.base import PluginMetadata, PluginCategory
from . import config
from . import constants

class PluginResumeProcessor:
    """
    Class for processing resumes using the plugin system.
    """
    
    def __init__(self, resume_dir: str = "./Resumes", output_dir: str = "./Results", 
                 log_dir: str = "./logs/token_usage", plugin_manager: Optional[Any] = None):
        """
        Initialize the PluginResumeProcessor.
        
        Args:
            resume_dir: Directory containing resume files to process
            output_dir: Directory to save processed results
            log_dir: Directory to save token usage logs
            plugin_manager: The plugin manager to use, or None to create a new one
        """
        self.resume_dir = resume_dir
        self.output_dir = output_dir
        self.log_dir = log_dir
        self.plugin_manager = plugin_manager
        
        # Ensure output directories exist
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.log_dir, exist_ok=True)
    
    def get_resume_files(self) -> List[str]:
        """
        Get all resume files in the resume directory.
        
        Returns:
            A list of resume file names
        """
        if not os.path.exists(self.resume_dir):
            logging.error(f"Error: Directory not found at {self.resume_dir}")
            return []
        
        # Get all PDF files in the directory
        return [f for f in os.listdir(self.resume_dir) 
                if os.path.splitext(f)[1].lower() in config.ALLOWED_FILE_EXTENSIONS]
    
    def process_resume(self, pdf_file_path: str) -> Optional[Resume]:
        """
        Process a single resume file using plugins.
        
        Args:
            pdf_file_path: Path to the PDF resume file.
            
        Returns:
            A Resume object with extracted information or None if processing failed.
        """
        from .utils.file_utils import read_file, validate_file
        
        file_basename = os.path.basename(pdf_file_path)
        
        # Validate the file
        is_valid, message = validate_file(pdf_file_path)
        if not is_valid:
            logging.error(f"Validation failed for {file_basename}: {message}")
            return None
        
        try:
            logging.info(f"Extracting text from {file_basename}")
            # Extract text from the resume
            extracted_text = read_file(pdf_file_path)
            
            logging.info(f"Extracting information using plugins from {file_basename}")
            
            # Initialize token usage dictionary
            total_token_usage = {
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "by_extractor": {},
                "source": "plugins"
            }
            
            # Get all extractor plugins
            extractor_plugins = self.plugin_manager.get_extractor_plugins()
            
            # Log which plugins we're using
            logging.info(f"Using {len(extractor_plugins)} extractor plugins: {', '.join(extractor_plugins.keys())}")
            
            # Specifically get the plugins we need
            profile_plugin = self.plugin_manager.get_plugin("profile_extractor")
            skills_plugin = self.plugin_manager.get_plugin("skills_extractor")
            education_plugin = self.plugin_manager.get_plugin("education_extractor")
            experience_plugin = self.plugin_manager.get_plugin("experience_extractor")
            yoe_plugin = self.plugin_manager.get_plugin("yoe_extractor")
            
            # Extract information concurrently using plugins (except for experience and YoE)
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_profile = executor.submit(profile_plugin.extract, extracted_text) if profile_plugin else None
                future_skills = executor.submit(skills_plugin.extract, extracted_text) if skills_plugin else None
                future_education = executor.submit(education_plugin.extract, extracted_text) if education_plugin else None
                
                # Get results and token usage for profile, skills, and education
                profile, profile_token_usage = future_profile.result() if future_profile else ({}, {})
                skills, skills_token_usage = future_skills.result() if future_skills else ({}, {})
                education, education_token_usage = future_education.result() if future_education else ({}, {})
            
            # Run experience extractor first
            experience, experience_token_usage = experience_plugin.extract(extracted_text) if experience_plugin else ({}, {})
            
            # Then run YoE extractor with experience data
            yoe, yoe_token_usage = yoe_plugin.extract(experience) if yoe_plugin else ({}, {})
            
            logging.debug(f"Extraction completed for {file_basename}")
            
            # Aggregate token usage
            for extractor_name, extractor_usage in [
                ("profile", profile_token_usage),
                ("skills", skills_token_usage),
                ("education", education_token_usage),
                ("experience", experience_token_usage),
                ("yoe", yoe_token_usage)
            ]:
                if extractor_usage:
                    total_token_usage["total_tokens"] += extractor_usage.get("total_tokens", 0)
                    total_token_usage["prompt_tokens"] += extractor_usage.get("prompt_tokens", 0)
                    total_token_usage["completion_tokens"] += extractor_usage.get("completion_tokens", 0)
                    
                    # Store by extractor for detailed breakdown
                    total_token_usage["by_extractor"][extractor_name] = {
                        "total_tokens": extractor_usage.get("total_tokens", 0),
                        "prompt_tokens": extractor_usage.get("prompt_tokens", 0),
                        "completion_tokens": extractor_usage.get("completion_tokens", 0),
                        "source": extractor_usage.get("source", "plugin")
                    }
            
            logging.info(f"Total tokens used for {file_basename}: {total_token_usage['total_tokens']}")
            
            # Create a Resume object from the extracted information
            resume = Resume.from_extractors_output(
                profile, skills, education, experience, yoe, pdf_file_path, total_token_usage
            )
            
            # Process any custom plugins
            custom_plugins = [p for p in self.plugin_manager.plugins.values() 
                             if p.metadata.category == PluginCategory.CUSTOM]
            
            for plugin in custom_plugins:
                try:
                    if hasattr(plugin, 'process_resume'):
                        plugin_data = plugin.process_resume(resume, extracted_text)
                        if plugin_data:
                            resume.add_plugin_data(plugin.metadata.name, plugin_data)
                except Exception as e:
                    logging.error(f"Error processing custom plugin {plugin.metadata.name}: {e}")
            
            return resume
            
        except Exception as e:
            logging.exception(f"Error processing resume {file_basename}: {e}")
            return None
    
    def process_all_resumes(self) -> Tuple[int, int]:
        """
        Process all resumes in the resume directory.
        
        Returns:
            A tuple of (number of processed resumes, number of errors)
        """
        resume_files = self.get_resume_files()
        processed_count = 0
        error_count = 0
        
        for resume_file in resume_files:
            try:
                file_path = os.path.join(self.resume_dir, resume_file)
                logging.info(f"Processing {resume_file}")
                
                resume = self.process_resume(file_path)
                
                if resume:
                    self.save_resume(resume)
                    processed_count += 1
                else:
                    error_count += 1
            except Exception as e:
                logging.exception(f"Error processing {resume_file}: {e}")
                error_count += 1
        
        return processed_count, error_count
    
    def save_resume(self, resume: Resume) -> None:
        """
        Save a processed resume to the output directory.
        
        Args:
            resume: The processed Resume object.
        """
        try:
            # Get the base name without extension
            base_name = os.path.splitext(os.path.basename(resume.file_path))[0]
            
            # Create the output file path
            output_file = os.path.join(self.output_dir, f"{base_name}.json")
            
            # Convert Resume object to dictionary, excluding file_path and token_usage
            resume_dict = resume.model_dump(exclude={'file_path', 'token_usage'})
            
            # Save to JSON file
            with open(output_file, 'w') as f:
                json.dump(resume_dict, f, indent=2)
            
            # Log token usage if available
            if resume.token_usage:
                timestamp = datetime.now().strftime(constants.TOKEN_USAGE_TIMESTAMP_FORMAT)
                log_file_name = constants.TOKEN_USAGE_FILENAME_FORMAT.format(
                    resume_name=base_name,
                    timestamp=timestamp
                )
                log_file_path = os.path.join(self.log_dir, log_file_name)
                
                with open(log_file_path, 'w') as f:
                    json.dump({"token_usage": resume.token_usage}, f, indent=2)
                
                logging.info(f"Token usage logged to {log_file_path}")
            
            logging.info(f"Saved processed resume to {output_file}")
        except Exception as e:
            logging.exception(f"Error saving resume: {e}")
    
    def print_token_usage_report(self, resume: Resume, log_file: str = None) -> None:
        """
        Print a token usage report for a resume.
        
        Args:
            resume: The Resume object.
            log_file: Optional path to the token usage log file.
        """
        if not resume.token_usage:
            print("\nNo token usage information available.")
            return
        
        token_usage = resume.token_usage
        
        print("\n===== Token Usage Report =====")
        print(f"Resume: {resume.file_name}")
        if log_file:
            print(f"Log file: {log_file}")
        
        print(f"\nTotal tokens used: {token_usage.get('total_tokens', 0)}")
        print(f"Prompt tokens: {token_usage.get('prompt_tokens', 0)}")
        print(f"Completion tokens: {token_usage.get('completion_tokens', 0)}")
        
        # If we have detailed breakdown by extractor
        if "by_extractor" in token_usage:
            print("\nBreakdown by extractor:")
            for extractor, usage in token_usage["by_extractor"].items():
                print(f"  {extractor}:")
                print(f"    Total: {usage.get('total_tokens', 0)}")
                print(f"    Prompt: {usage.get('prompt_tokens', 0)}")
                print(f"    Completion: {usage.get('completion_tokens', 0)}")
        
        # If token usage is estimated
        if token_usage.get("is_estimated", False):
            print("\nNote: Token usage is estimated and may not be accurate.") 