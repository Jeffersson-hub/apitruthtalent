import os
import datetime
import logging
from .. import config
from .. import constants
from typing import List, Tuple

def cleanup_token_usage_logs(log_dir: str = None) -> Tuple[int, List[str]]:
    """
    Clean up token usage logs older than the retention period specified in config.
    
    Args:
        log_dir: Directory containing token usage logs. Defaults to config's log directory.
        
    Returns:
        A tuple containing:
        - Number of files removed
        - List of filenames that were removed
    """
    if log_dir is None:
        # Default to the token usage log directory
        log_dir = os.path.join("./logs", "token_usage")
    
    if not os.path.exists(log_dir):
        logging.warning(f"Log directory {log_dir} does not exist. No cleanup needed.")
        return 0, []
    
    logging.info(f"Cleaning up token usage logs older than {config.TOKEN_LOG_RETENTION_DAYS} days")
    
    # Calculate cutoff date
    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=config.TOKEN_LOG_RETENTION_DAYS)
    
    # Format: resume_name_token_usage_YYYYMMDD_HHMMSS.json
    # We need to parse the timestamp in each filename
    removed_files = []
    
    for filename in os.listdir(log_dir):
        if not filename.endswith('.json') or 'token_usage' not in filename:
            continue
        
        try:
            # Extract the timestamp part (assumes format *_token_usage_YYYYMMDD_HHMMSS.json)
            parts = filename.split('_token_usage_')
            if len(parts) != 2:
                continue
                
            timestamp_str = parts[1].split('.')[0]  # Remove .json extension
            
            # Parse the timestamp (format: YYYYMMDD_HHMMSS)
            file_date = datetime.datetime.strptime(timestamp_str, constants.TOKEN_USAGE_TIMESTAMP_FORMAT)
            
            # Check if the file is older than the retention period
            if file_date < cutoff_date:
                filepath = os.path.join(log_dir, filename)
                os.remove(filepath)
                removed_files.append(filename)
                logging.debug(f"Removed old token usage log: {filename}")
        except Exception as e:
            logging.warning(f"Error processing log file {filename}: {e}")
    
    if removed_files:
        logging.info(f"Removed {len(removed_files)} old token usage log files")
    else:
        logging.info("No old token usage logs found to remove")
    
    return len(removed_files), removed_files 