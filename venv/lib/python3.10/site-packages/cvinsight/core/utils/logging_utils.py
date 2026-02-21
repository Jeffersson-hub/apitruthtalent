import os
import logging
import sys
from .. import config
from logging.handlers import RotatingFileHandler

def setup_logging():
    """Set up logging configuration."""
    log_level = getattr(logging, config.LOG_LEVEL)
    
    # Create logs directory if it doesn't exist
    log_dir = os.path.dirname(config.LOG_FILE)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)
    
    # Configure rotating file handler
    max_log_size = config.LOG_MAX_SIZE_MB * 1024 * 1024  # Convert MB to bytes
    backup_count = config.LOG_BACKUP_COUNT
    
    # Configure logging
    logging.basicConfig(
        level=log_level,
        format=config.LOG_FORMAT,
        handlers=[
            RotatingFileHandler(
                config.LOG_FILE,
                maxBytes=max_log_size,
                backupCount=backup_count
            ),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Log startup information
    logging.info("Resume Analysis application started") 