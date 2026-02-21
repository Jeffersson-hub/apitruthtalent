import logging
from typing import Dict, Any, Type, List, Optional
from .base import BasePlugin, ExtractorPlugin
from .registry import PluginRegistry
from .config import PluginConfig

class PluginLoader:
    """Loader for plugins."""
    
    def __init__(self, config: Optional[PluginConfig] = None):
        self.config = config or PluginConfig()
        self.loaded_plugins: Dict[str, BasePlugin] = {}
    
    def discover_plugins(self) -> None:
        """Discover available plugins."""
        PluginRegistry.discover_plugins()
    
    def load_all_enabled_plugins(self) -> Dict[str, BasePlugin]:
        """Load all enabled plugins."""
        self.loaded_plugins = {}
        
        # Get all registered plugin classes
        plugin_classes = PluginRegistry.get_all_plugins()
        
        # Filter and sort by priority
        enabled_plugins = []
        for name, plugin_class in plugin_classes.items():
            if self.config.is_plugin_enabled(name):
                priority = self.config.get_plugin_priority(name)
                enabled_plugins.append((name, plugin_class, priority))
        
        # Sort by priority (lower first)
        enabled_plugins.sort(key=lambda x: x[2])
        
        # Load plugins
        for name, plugin_class, _ in enabled_plugins:
            self.load_plugin(name)
        
        return self.loaded_plugins
    
    def load_plugin(self, plugin_name: str) -> Optional[BasePlugin]:
        """Load a specific plugin."""
        if plugin_name in self.loaded_plugins:
            return self.loaded_plugins[plugin_name]
            
        plugin_class = PluginRegistry.get_plugin(plugin_name)
        if not plugin_class:
            logging.error(f"Plugin {plugin_name} not found")
            return None
            
        if not self.config.is_plugin_enabled(plugin_name):
            logging.warning(f"Plugin {plugin_name} is disabled")
            return None
            
        try:
            # Get plugin settings
            settings = self.config.get_plugin_settings(plugin_name)
            
            # Instantiate plugin
            plugin = plugin_class()
            
            # Initialize plugin
            plugin.initialize()
            
            # Save loaded plugin
            self.loaded_plugins[plugin_name] = plugin
            
            logging.info(f"Loaded plugin: {plugin_name}")
            return plugin
        except Exception as e:
            logging.error(f"Failed to load plugin {plugin_name}: {e}")
            return None
    
    def get_extractor_plugins(self) -> Dict[str, ExtractorPlugin]:
        """Get all loaded extractor plugins."""
        return {name: plugin for name, plugin in self.loaded_plugins.items() 
               if isinstance(plugin, ExtractorPlugin)} 