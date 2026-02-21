import os
import logging
import PyPDF2
from .. import config
# Import docx2txt for DOCX processing
import docx2txt

def validate_file(file_path):
    """
    Validates a file to ensure it meets requirements.
    
    Args:
        file_path: Path to the file to validate.
        
    Returns:
        A tuple (is_valid, message) where is_valid is a boolean and message is an error message if invalid.
    """
    # Check if file exists
    if not os.path.exists(file_path):
        return False, f"File not found: {file_path}"
    
    # Check file extension
    _, ext = os.path.splitext(file_path)
    if ext.lower() not in config.ALLOWED_FILE_EXTENSIONS:
        return False, f"Invalid file type. Expected one of {config.ALLOWED_FILE_EXTENSIONS}, got {ext}"
    
    # Check file size
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)  # Convert bytes to MB
    if file_size_mb > config.MAX_PDF_SIZE_MB:
        return False, f"File too large. Maximum size is {config.MAX_PDF_SIZE_MB}MB, got {file_size_mb:.2f}MB"
    
    # Validation specific to file type
    if ext.lower() == '.pdf':
        # Try opening the PDF to verify it's valid
        try:
            with open(file_path, 'rb') as file:
                PyPDF2.PdfReader(file)
        except Exception as e:
            return False, f"Invalid PDF file: {str(e)}"
    elif ext.lower() == '.docx':
        # Basic validation for DOCX files
        try:
            # Simple validation attempt
            docx2txt.process(file_path)
        except Exception as e:
            return False, f"Invalid DOCX file: {str(e)}"
    
    return True, "File is valid"

def read_file(file_path):
    """
    Reads a file and extracts the text.
    
    Args:
        file_path: The path to the file.
        
    Returns:
        The extracted text.
    """
    is_valid, message = validate_file(file_path)
    if not is_valid:
        raise ValueError(message)
    
    # Determine file type and call appropriate processor
    _, ext = os.path.splitext(file_path)
    if ext.lower() == '.pdf':
        return read_pdf_file(file_path)
    elif ext.lower() == '.docx':
        return read_docx_file(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

def read_pdf_file(file_path):
    """
    Reads a PDF file and extracts the text.
    
    Args:
        file_path: The path to the PDF file.
        
    Returns:
        The extracted text.
    """
    text = ""
    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text
        return text
    except Exception as e:
        raise IOError(f"Error reading PDF file: {e}")

def read_docx_file(file_path):
    """
    Reads a DOCX file and extracts the text.
    
    Args:
        file_path: The path to the DOCX file.
        
    Returns:
        The extracted text.
    """
    try:
        # Using docx2txt for extraction - handles text from paragraphs, tables, headers, and footers
        text = docx2txt.process(file_path)
        return text
    except Exception as e:
        logging.error(f"Error extracting text from DOCX file: {e}")
        raise IOError(f"Error reading DOCX file: {e}") 