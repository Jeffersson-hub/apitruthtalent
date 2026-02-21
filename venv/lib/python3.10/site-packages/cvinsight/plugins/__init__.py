"""
Core plugin base classes and interfaces.
"""

from .base import BasePlugin, ExtractorPlugin, PluginMetadata, PluginCategory

__all__ = [
    'BasePlugin',
    'ExtractorPlugin',
    'PluginMetadata',
    'PluginCategory'
]