"""Command-line interface for CVInsight."""
import os
import sys
import json
from typing import Optional, Dict, Any
import click

@click.command(help="CVInsight - AI-powered resume analysis")
@click.option('--resume', type=str, help='Process a single resume file')
@click.option('--output', type=str, help='Output directory for results')
@click.option('--list-plugins', is_flag=True, help='List available plugins')
@click.option('--plugins', type=str, help='Comma-separated list of plugins to use')
@click.option('--json', 'json_output', is_flag=True, help='Output results as JSON')
def main(resume: Optional[str], output: Optional[str], list_plugins: bool, plugins: Optional[str], json_output: bool):
    """Entry point for the CVInsight CLI."""
    # Handle plugin listing
    if list_plugins:
        from cvinsight import list_all_plugins
        plugins_list = list_all_plugins()
        
        if json_output:
            click.echo(json.dumps(plugins_list, indent=2))
        else:
            click.echo("\nAvailable plugins:")
            for plugin in plugins_list:
                click.echo(f"- {plugin['name']} (v{plugin['version']}): {plugin['description']}")
        return
    
    # Handle resume processing
    if resume:
        resume_path = resume
        if not os.path.exists(resume_path):
            click.echo(f"Error: Resume file not found at {resume_path}", err=True)
            sys.exit(1)
        
        # Determine which plugins to use
        plugin_list = None
        if plugins:
            plugin_list = [p.strip() for p in plugins.split(',')]
        
        # Process the resume
        if plugin_list:
            from cvinsight import analyze_resume
            result = analyze_resume(resume_path, plugin_list)
        else:
            from cvinsight import extract_all
            result = extract_all(resume_path)
        
        # Output the results
        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            click.echo("\nResume Analysis Results:")
            if "name" in result:
                click.echo(f"Name: {result.get('name', 'Not found')}")
            if "email" in result:
                click.echo(f"Email: {result.get('email', 'Not found')}")
            if "skills" in result:
                click.echo(f"Skills: {', '.join(result.get('skills', []))}")
            if "educations" in result:
                click.echo("\nEducation:")
                for edu in result.get("educations", []):
                    click.echo(f"- {edu.get('degree')} at {edu.get('institution')}")
            if "work_experiences" in result:
                click.echo("\nExperience:")
                for exp in result.get("work_experiences", []):
                    click.echo(f"- {exp.get('role')} at {exp.get('company')}")
            if "YoE" in result:
                click.echo(f"\nYears of Experience: {result.get('YoE', 'Not found')}")
            elif "years_of_experience" in result:
                click.echo(f"\nYears of Experience: {result.get('years_of_experience', 'Not found')}")
        
        # Save results to file if output directory specified
        if output:
            os.makedirs(output, exist_ok=True)
            output_file = os.path.join(output, f"{os.path.splitext(os.path.basename(resume_path))[0]}.json")
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            click.echo(f"\nResults saved to {output_file}")
    else:
        click.echo(click.get_current_context().get_help())

if __name__ == "__main__":
    main()
