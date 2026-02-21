"""Main module for CVInsight."""
import os
import sys
import logging
from pathlib import Path
from typing import List, Optional
import click
from dotenv import load_dotenv

# Import internal modules
from .core.llm_service import LLMService
from .base_plugins.plugin_manager import PluginManager
from .core.resume_processor import ResumeProcessor
from .core.utils import setup_logging, cleanup_token_usage_logs
from .core.config import (
    DEFAULT_RESUME_DIR,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_LLM_MODEL,
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS
)

# Load environment variables
load_dotenv()

# Setup logging
setup_logging()

# Global instances
_llm_service = None
_plugin_manager = None
_processor = None

def _get_llm_service():
    """Get or initialize LLM service."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService(
            model_name=DEFAULT_LLM_MODEL,
            temperature=DEFAULT_TEMPERATURE,
            max_tokens=DEFAULT_MAX_TOKENS
        )
    return _llm_service

def _get_plugin_manager():
    """Get or initialize plugin manager."""
    global _plugin_manager
    if _plugin_manager is None:
        _plugin_manager = PluginManager(_get_llm_service())
        _plugin_manager.load_all_plugins()
    return _plugin_manager

def _get_processor():
    """Get or initialize resume processor."""
    global _processor
    if _processor is None:
        _processor = ResumeProcessor(plugin_manager=_get_plugin_manager())
    return _processor

@click.group()
def cli():
    """CVInsight - Resume Analysis Tool"""
    pass

@cli.command()
def list_plugins():
    """List all available plugins."""
    plugin_manager = _get_plugin_manager()
    plugins = plugin_manager.list_plugins()
    
    click.echo("\nAvailable Plugins:")
    for plugin in plugins:
        click.echo(f"\nName: {plugin['name']}")
        click.echo(f"Version: {plugin['version']}")
        click.echo(f"Description: {plugin['description']}")
        click.echo(f"Category: {plugin['category']}")
        click.echo(f"Author: {plugin['author']}")

@cli.command()
@click.argument('resume_path', type=click.Path(exists=True))
@click.option('--output', '-o', type=click.Path(), help='Output file path')
@click.option('--plugins', '-p', multiple=True, help='Specific plugins to use')
def process_resume(resume_path: str, output: Optional[str], plugins: List[str]):
    """Process a resume file."""
    try:
        processor = _get_processor()
        
        # Process the resume
        result = processor.process_resume(resume_path)
        
        if not result:
            click.echo("No information could be extracted from the resume.")
            return
        
        # Format output
        if output:
            # Save to file
            output_path = Path(output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w') as f:
                f.write(str(result))
            click.echo(f"Results saved to {output}")
        else:
            # Print to console
            click.echo("\nExtracted Information:")
            click.echo(f"\nName: {result.get('name', 'Not found')}")
            click.echo(f"Email: {result.get('email', 'Not found')}")
            click.echo(f"Phone: {result.get('phone', 'Not found')}")
            click.echo(f"Location: {result.get('location', 'Not found')}")
            
            if "education" in result:
                click.echo("\nEducation:")
                for edu in result["education"]:
                    click.echo(f"- {edu.get('degree', 'N/A')} from {edu.get('institution', 'N/A')}")
                    click.echo(f"  {edu.get('start_date', 'N/A')} to {edu.get('end_date', 'Present')}")
            
            if "experience" in result:
                click.echo("\nExperience:")
                for exp in result["experience"]:
                    click.echo(f"- {exp.get('title', 'N/A')} at {exp.get('company', 'N/A')}")
                    click.echo(f"  {exp.get('start_date', 'N/A')} to {exp.get('end_date', 'Present')}")
            
            if "skills" in result:
                click.echo("\nSkills:")
                for skill in result["skills"]:
                    click.echo(f"- {skill}")
            
            if "YoE" in result:
                click.echo(f"\nYears of Experience: {result.get('YoE', 'Not found')}")
            elif "years_of_experience" in result:
                click.echo(f"\nYears of Experience: {result.get('years_of_experience', 'Not found')}")
            
            # Print token usage if available
            if "token_usage" in result:
                click.echo("\nToken Usage:")
                click.echo(f"Total Tokens: {result['token_usage'].get('total_tokens', 0)}")
                click.echo(f"Prompt Tokens: {result['token_usage'].get('prompt_tokens', 0)}")
                click.echo(f"Completion Tokens: {result['token_usage'].get('completion_tokens', 0)}")
    
    except Exception as e:
        click.echo(f"Error processing resume: {e}", err=True)
        sys.exit(1)

@cli.command()
def cleanup():
    """Clean up token usage logs."""
    try:
        cleanup_token_usage_logs()
        click.echo("Token usage logs cleaned up successfully.")
    except Exception as e:
        click.echo(f"Error cleaning up logs: {e}", err=True)
        sys.exit(1)

def main():
    """Main entry point."""
    try:
        cli()
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
