from typing import Dict, Type, List, Optional
import importlib
import pkgutil
import inspect
import logging
from .base import BasePlugin, PluginCategory

class PluginRegistry:
    """Registry for plugins."""
    
    _plugins: Dict[str, Type[BasePlugin]] = {}
    
    @classmethod
    def register(cls, plugin_class: Type[BasePlugin]) -> None:
        """Register a plugin class."""
        name = plugin_class.metadata.name
        if name in cls._plugins:
            logging.warning(f"Plugin {name} already registered. Overwriting.")
        cls._plugins[name] = plugin_class
        logging.info(f"Registered plugin: {name} v{plugin_class.metadata.version} [{plugin_class.metadata.category.name}]")
    
    @classmethod
    def get_plugin(cls, name: str) -> Optional[Type[BasePlugin]]:
        """Get a plugin by name."""
        return cls._plugins.get(name)
    
    @classmethod
    def get_all_plugins(cls) -> Dict[str, Type[BasePlugin]]:
        """Get all registered plugins."""
        return cls._plugins.copy()
    
    @classmethod
    def get_plugins_by_category(cls, category: PluginCategory) -> Dict[str, Type[BasePlugin]]:
        """Get plugins by category."""
        return {name: plugin for name, plugin in cls._plugins.items() 
                if plugin.metadata.category == category}
    
    @classmethod
    def discover_plugins(cls, package_names: List[str] = ["base_plugins", "custom_plugins"]) -> None:
        """Discover and register plugins from the given packages."""
        for package_name in package_names:
            try:
                package = importlib.import_module(package_name)
                for _, name, is_pkg in pkgutil.iter_modules(package.__path__, package.__name__ + '.'):
                    if is_pkg:
                        try:
                            module = importlib.import_module(name)
                            for _, obj in inspect.getmembers(module, inspect.isclass):
                                if inspect.isclass(obj) and issubclass(obj, BasePlugin) and obj != BasePlugin:
                                    cls.register(obj)
                        except Exception as e:
                            logging.error(f"Error loading plugin module {name}: {e}")
            except ImportError:
                logging.warning(f"Plugin package {package_name} not found.") 