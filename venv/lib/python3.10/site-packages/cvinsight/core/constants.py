"""
Constants used throughout the CVInsight application.
This file centralizes constants that might otherwise be hardcoded in multiple places.
"""

# File-related constants
RESUME_FILE_EXTENSIONS = ['.pdf', '.docx']
MAX_FILE_SIZE_MB = 10  # Maximum file size in MB

# Date-related constants
DEFAULT_DATE_FORMAT = "%d/%m/%Y"
DATE_FORMATS = [
    "%d/%m/%Y",       # 31/12/2023
    "%Y-%m-%d",       # 2023-12-31
    "%B %Y",          # December 2023
    "%b %Y",          # Dec 2023
    "%m/%Y",          # 12/2023
    "%Y"              # 2023
]

# Token usage constants
TOKEN_USAGE_FILENAME_FORMAT = "{resume_name}_token_usage_{timestamp}.json"
TOKEN_USAGE_TIMESTAMP_FORMAT = "%Y%m%d_%H%M%S"

# LLM model-related constants
DEFAULT_MODEL_TEMPERATURE = 0.1 