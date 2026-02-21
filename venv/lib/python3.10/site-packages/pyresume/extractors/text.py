"""
Plain text file handling.
"""
from typing import Optional
import chardet


class TextExtractor:
    """Extract content from plain text files."""
    
    def extract_text(self, file_path: str) -> str:
        """
        Extract text content from a plain text file.
        
        Args:
            file_path: Path to the text file
            
        Returns:
            Text content
            
        Raises:
            Exception: If file cannot be read
        """
        try:
            # Try to detect encoding first
            with open(file_path, 'rb') as f:
                raw_data = f.read()
                encoding_result = chardet.detect(raw_data)
                encoding = encoding_result.get('encoding', 'utf-8')
            
            # Read with detected encoding
            with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                return f.read()
                
        except Exception as e:
            # Fallback to UTF-8 with error replacement
            try:
                with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                    return f.read()
            except Exception as fallback_error:
                raise Exception(f"Failed to read text file: {str(fallback_error)}")
    
    def clean_text(self, text: str) -> str:
        """
        Clean and normalize text content.
        
        Args:
            text: Raw text content
            
        Returns:
            Cleaned text content
        """
        # Remove excessive whitespace while preserving structure
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            cleaned_line = line.strip()
            if cleaned_line:
                cleaned_lines.append(cleaned_line)
            elif cleaned_lines and cleaned_lines[-1]:
                # Preserve single empty lines for structure
                cleaned_lines.append('')
        
        return '\n'.join(cleaned_lines)