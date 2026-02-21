import json
import os
import logging
from typing import Dict, Any, List, Optional

class PluginConfig:
    """Configuration for plugins."""
    
    def __init__(self, config_path: str = "plugin_config.json"):
        self.config_path = config_path
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from file."""
        if os.path.exists(self.config_path):
            with open(self.config_path, 'r') as f:
                return json.load(f)
        # Default configuration
        return {
            "enabled_plugins": [],
            "plugin_settings": {},
            "plugin_priorities": {},
            "disabled_base_plugins": []
        }
    
    def save_config(self) -> None:
        """Save configuration to file."""
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def is_plugin_enabled(self, plugin_name: str) -> bool:
        """Check if a plugin is enabled."""
        # Import here to avoid circular imports
        from plugins.registry import PluginRegistry
        from plugins.base import PluginCategory
        
        plugin_class = PluginRegistry.get_plugin(plugin_name)
        if not plugin_class:
            return False
            
        if plugin_class.metadata.category == PluginCategory.BASE:
            # Base plugins are enabled by default unless explicitly disabled
            return plugin_name not in self.config.get("disabled_base_plugins", [])
        else:
            # Custom plugins must be explicitly enabled
            return plugin_name in self.config.get("enabled_plugins", [])
    
    def enable_plugin(self, plugin_name: str) -> None:
        """Enable a plugin."""
        from plugins.registry import PluginRegistry
        from plugins.base import PluginCategory
        
        plugin_class = PluginRegistry.get_plugin(plugin_name)
        if not plugin_class:
            raise ValueError(f"Plugin {plugin_name} not found")
            
        if plugin_class.metadata.category == PluginCategory.BASE:
            # Remove from disabled list for base plugins
            if "disabled_base_plugins" in self.config:
                if plugin_name in self.config["disabled_base_plugins"]:
                    self.config["disabled_base_plugins"].remove(plugin_name)
                    self.save_config()
        else:
            # Add to enabled list for custom plugins
            if "enabled_plugins" not in self.config:
                self.config["enabled_plugins"] = []
            if plugin_name not in self.config["enabled_plugins"]:
                self.config["enabled_plugins"].append(plugin_name)
                self.save_config()
    
    def disable_plugin(self, plugin_name: str) -> None:
        """Disable a plugin."""
        from plugins.registry import PluginRegistry
        from plugins.base import PluginCategory
        
        plugin_class = PluginRegistry.get_plugin(plugin_name)
        if not plugin_class:
            raise ValueError(f"Plugin {plugin_name} not found")
            
        if plugin_class.metadata.category == PluginCategory.BASE:
            # Add to disabled list for base plugins
            if "disabled_base_plugins" not in self.config:
                self.config["disabled_base_plugins"] = []
            if plugin_name not in self.config["disabled_base_plugins"]:
                self.config["disabled_base_plugins"].append(plugin_name)
                self.save_config()
        else:
            # Remove from enabled list for custom plugins
            if plugin_name in self.config.get("enabled_plugins", []):
                self.config["enabled_plugins"].remove(plugin_name)
                self.save_config()
    
    def get_plugin_settings(self, plugin_name: str) -> Dict[str, Any]:
        """Get settings for a plugin."""
        return self.config.get("plugin_settings", {}).get(plugin_name, {})
    
    def set_plugin_setting(self, plugin_name: str, key: str, value: Any) -> None:
        """Set a setting for a plugin."""
        if "plugin_settings" not in self.config:
            self.config["plugin_settings"] = {}
        if plugin_name not in self.config["plugin_settings"]:
            self.config["plugin_settings"][plugin_name] = {}
        self.config["plugin_settings"][plugin_name][key] = value
        self.save_config()
    
    def get_plugin_priority(self, plugin_name: str) -> int:
        """Get the execution priority for a plugin (lower runs first)."""
        return self.config.get("plugin_priorities", {}).get(plugin_name, 100)
    
    def set_plugin_priority(self, plugin_name: str, priority: int) -> None:
        """Set the execution priority for a plugin."""
        if "plugin_priorities" not in self.config:
            self.config["plugin_priorities"] = {}
        self.config["plugin_priorities"][plugin_name] = priority
        self.save_config() 