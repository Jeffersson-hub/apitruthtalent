"""
Plugin Manager for Resume Analysis.

This module provides functionality to discover, load and manage plugins.
"""
import os
import inspect
import importlib
import logging
import re
from typing import Dict, Type, List, Any, Optional
from ..plugins.base import BasePlugin, ExtractorPlugin

class PluginManager:
    """
    Manager for handling plugin discovery, loading and management.
    """
    
    def __init__(self, llm_service: Any = None):
        """
        Initialize the PluginManager.
        
        Args:
            llm_service: The LLM service to use for extractors.
        """
        self.llm_service = llm_service
        self.plugins: Dict[str, BasePlugin] = {}
        self.plugin_classes: Dict[str, Type[BasePlugin]] = {}
        self.extractors: Dict[str, ExtractorPlugin] = {}
    
    def discover_plugins(self) -> List[Type[BasePlugin]]:
        """
        Discover all available plugins in the configured directories.
        
        Returns:
            A list of plugin classes.
        """
        discovered_plugins = []
        
        # First load all built-in plugins from base_plugins
        try:
            from . import __all__ as builtin_plugins
            
            logging.debug(f"Found built-in plugins: {builtin_plugins}")
            
            for plugin_name in builtin_plugins:
                try:
                    # Convert CamelCase to snake_case for module name
                    # Example: ProfileExtractorPlugin -> profile_extractor
                    module_base_name = re.sub(r'(?<!^)(?=[A-Z])', '_', plugin_name).lower().replace('_plugin', '')
                    
                    # Import the plugin
                    module_name = f".{module_base_name}"
                    module = importlib.import_module(module_name, package="cvinsight.base_plugins")
                    
                    # Find plugin class
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if (inspect.isclass(attr) and 
                            issubclass(attr, BasePlugin) and 
                            attr != BasePlugin and
                            attr.__module__ == module.__name__):
                            discovered_plugins.append(attr)
                            self.plugin_classes[attr.__name__] = attr
                            logging.debug(f"Discovered built-in plugin: {attr.__name__}")
                except Exception as e:
                    logging.error(f"Error loading built-in plugin {plugin_name}: {e}")
        except Exception as e:
            logging.error(f"Error importing built-in plugins: {e}")
        
        # Check for custom plugins
        custom_plugins_dir = os.path.join(os.getcwd(), 'custom_plugins')
        if os.path.exists(custom_plugins_dir) and os.path.isdir(custom_plugins_dir):
            logging.debug(f"Looking for custom plugins in {custom_plugins_dir}")
            
            # First get the list of enabled custom plugins from __all__
            try:
                from ..custom_plugins import __all__ as enabled_custom_plugins
                logging.debug(f"Enabled custom plugins from __all__: {enabled_custom_plugins}")
                
                for item in os.listdir(custom_plugins_dir):
                    plugin_path = os.path.join(custom_plugins_dir, item)
                    if os.path.isdir(plugin_path) and os.path.exists(os.path.join(plugin_path, '__init__.py')):
                        try:
                            # Import the plugin module
                            module_name = f"..custom_plugins.{item}"
                            module = importlib.import_module(module_name, package="cvinsight.base_plugins")
                            logging.debug(f"Imported custom plugin module: {module_name}")
                            
                            # Find plugin classes in the module that are listed in __all__
                            for attr_name in dir(module):
                                attr = getattr(module, attr_name)
                                if (inspect.isclass(attr) and 
                                    issubclass(attr, BasePlugin) and 
                                    attr != BasePlugin and
                                    attr.__module__ == module.__name__ and
                                    attr.__name__ in enabled_custom_plugins):  # Only load if in __all__
                                    discovered_plugins.append(attr)
                                    self.plugin_classes[attr.__name__] = attr
                                    logging.debug(f"Discovered custom plugin: {attr.__name__}")
                        except Exception as e:
                            logging.error(f"Error loading custom plugin from {item}: {e}")
            except Exception as e:
                logging.error(f"Error loading enabled custom plugins list: {e}")
        
        logging.info(f"Discovered {len(discovered_plugins)} plugins")
        return discovered_plugins
    
    def load_plugin(self, plugin_class: Type[BasePlugin]) -> Optional[BasePlugin]:
        """
        Load a plugin by instantiating the plugin class.
        
        Args:
            plugin_class: The plugin class to instantiate.
            
        Returns:
            An instance of the plugin.
        """
        try:
            # Create an instance of the plugin, passing llm_service if needed
            plugin_init_signature = inspect.signature(plugin_class.__init__)
            if 'llm_service' in plugin_init_signature.parameters:
                plugin_instance = plugin_class(llm_service=self.llm_service)
            else:
                plugin_instance = plugin_class()
            
            # Initialize the plugin
            plugin_instance.initialize()
            
            # Store the plugin instance
            plugin_name = plugin_instance.metadata.name
            self.plugins[plugin_name] = plugin_instance
            
            # If it's an extractor plugin, store it separately
            if isinstance(plugin_instance, ExtractorPlugin):
                self.extractors[plugin_name] = plugin_instance
            
            logging.debug(f"Loaded plugin: {plugin_name}")
            return plugin_instance
        except Exception as e:
            logging.error(f"Error loading plugin {plugin_class.__name__}: {e}")
            return None
    
    def load_all_plugins(self) -> Dict[str, BasePlugin]:
        """
        Load all discovered plugins.
        
        Returns:
            Dictionary of plugin name to plugin instance.
        """
        discovered_plugins = self.discover_plugins()
        
        for plugin_class in discovered_plugins:
            self.load_plugin(plugin_class)
        
        logging.info(f"Loaded {len(self.plugins)} plugins")
        return self.plugins
    
    def get_plugin(self, plugin_name: str) -> Optional[BasePlugin]:
        """
        Get a plugin by name.
        
        Args:
            plugin_name: The name of the plugin to get.
            
        Returns:
            The plugin instance or None if not found.
        """
        return self.plugins.get(plugin_name)
    
    def get_plugins_by_category(self, category: str) -> List[BasePlugin]:
        """
        Get all plugins in a specific category.
        
        Args:
            category: The category to filter by.
            
        Returns:
            List of plugins in the category.
        """
        return [p for p in self.plugins.values() if p.metadata.category.name == category]
    
    def get_extractor_plugins(self) -> Dict[str, ExtractorPlugin]:
        """
        Get all extractor plugins.
        
        Returns:
            Dictionary of extractor name to extractor plugin.
        """
        return self.extractors
    
    def get_plugin_info(self) -> List[Dict[str, str]]:
        """
        Get information about all loaded plugins.
        
        Returns:
            List of dictionaries with plugin information.
        """
        return [
            {
                "name": plugin.metadata.name,
                "version": plugin.metadata.version,
                "description": plugin.metadata.description,
                "category": plugin.metadata.category.name,
                "author": plugin.metadata.author
            }
            for plugin in self.plugins.values()
        ]

    def list_plugins(self) -> List[Dict[str, Any]]:
        """
        List all available plugins.
        
        Returns:
            List of dictionaries containing plugin information.
        """
        return self.get_plugin_info()

    def list_plugins_by_category(self, category: str) -> List[Dict[str, Any]]:
        """
        List plugins by category.
        
        Args:
            category: Category to filter plugins by.
            
        Returns:
            List of dictionaries containing plugin information.
        """
        plugins = self.get_plugins_by_category(category)
        return [
            {
                "name": plugin.metadata.name,
                "version": plugin.metadata.version,
                "description": plugin.metadata.description,
                "category": plugin.metadata.category.name,
                "author": plugin.metadata.author
            }
            for plugin in plugins
        ] 