"""
PDF text extraction using pdfplumber.
"""
from typing import Optional, List, Dict, Any
import logging

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

logger = logging.getLogger(__name__)


class PDFExtractor:
    """Extract text content from PDF files."""
    
    def __init__(self):
        if pdfplumber is None:
            raise ImportError("pdfplumber is required for PDF extraction. Install with: pip install pdfplumber")
    
    def extract_text(self, file_path: str) -> str:
        """
        Extract text content from a PDF file.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            Extracted text content
            
        Raises:
            Exception: If PDF cannot be read or processed
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                text_parts = []
                
                # Get metadata if available
                metadata = self._extract_metadata(pdf)
                if metadata:
                    logger.debug(f"PDF metadata: {metadata}")
                
                for i, page in enumerate(pdf.pages):
                    # Try different extraction strategies
                    page_text = self._extract_page_text(page, i + 1)
                    
                    if page_text:
                        text_parts.append(page_text)
                
                # Join pages with double newlines
                full_text = '\n\n'.join(text_parts)
                
                # Clean up excessive whitespace
                full_text = self._clean_text(full_text)
                
                return full_text
                
        except Exception as e:
            raise Exception(f"Failed to extract text from PDF: {str(e)}")
    
    def _extract_page_text(self, page, page_num: int) -> str:
        """Extract text from a single page using multiple strategies."""
        page_text = None
        
        # Strategy 1: Default extraction
        try:
            page_text = page.extract_text()
        except Exception as e:
            logger.warning(f"Default extraction failed for page {page_num}: {e}")
        
        # Strategy 2: If default extraction gives poor results, try with layout
        if not page_text or len(page_text.strip()) < 50:
            try:
                page_text = page.extract_text(layout=True)
            except Exception as e:
                logger.warning(f"Layout extraction failed for page {page_num}: {e}")
        
        # Strategy 3: Try x_tolerance and y_tolerance adjustments for better extraction
        if not page_text or len(page_text.strip()) < 50:
            try:
                page_text = page.extract_text(x_tolerance=2, y_tolerance=2)
            except Exception as e:
                logger.warning(f"Tolerance extraction failed for page {page_num}: {e}")
        
        # Strategy 4: Extract tables separately if present
        table_text = self._extract_tables_from_page(page)
        if table_text:
            if page_text:
                page_text += '\n\n' + table_text
            else:
                page_text = table_text
        
        return page_text or ""
    
    def _extract_tables_from_page(self, page) -> str:
        """Extract tables from a page and convert to text."""
        try:
            tables = page.extract_tables()
            if not tables:
                return ""
            
            table_parts = []
            for table in tables:
                # Convert table to text with better formatting
                table_text = self._format_table(table)
                if table_text:
                    table_parts.append(table_text)
            
            return '\n\n'.join(table_parts)
        except Exception as e:
            logger.warning(f"Table extraction failed: {e}")
            return ""
    
    def _format_table(self, table: List[List[Optional[str]]]) -> str:
        """Format a table into readable text."""
        if not table:
            return ""
        
        # Filter out empty rows
        table = [row for row in table if any(cell for cell in row if cell)]
        if not table:
            return ""
        
        # Convert to text with pipe separators
        lines = []
        for row in table:
            formatted_row = ' | '.join([str(cell or '').strip() for cell in row])
            if formatted_row.strip():
                lines.append(formatted_row)
        
        return '\n'.join(lines)
    
    def _extract_metadata(self, pdf) -> Dict[str, Any]:
        """Extract PDF metadata."""
        try:
            metadata = pdf.metadata
            if metadata:
                # Clean metadata - remove None values and convert to strings
                clean_metadata = {}
                for key, value in metadata.items():
                    if value is not None:
                        clean_metadata[key] = str(value)
                return clean_metadata
        except Exception as e:
            logger.warning(f"Metadata extraction failed: {e}")
        return {}
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text."""
        # Remove excessive whitespace while preserving structure
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Remove trailing whitespace
            line = line.rstrip()
            # Skip lines that are only whitespace
            if line:
                cleaned_lines.append(line)
            # Preserve single blank lines between sections
            elif cleaned_lines and cleaned_lines[-1] != '':
                cleaned_lines.append('')
        
        # Join lines back together
        text = '\n'.join(cleaned_lines)
        
        # Remove multiple consecutive blank lines
        while '\n\n\n' in text:
            text = text.replace('\n\n\n', '\n\n')
        
        return text.strip()
    
    def extract_tables(self, file_path: str) -> list:
        """
        Extract tables from PDF (future enhancement).
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            List of tables found in the PDF
        """
        # Table extraction not implemented - returns empty list
        # Future enhancement: Could extract tables using pdfplumber's table detection
        return []