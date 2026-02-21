import os
import shutil
import logging

def cleanup_pycache(root_dir="."):
    """
    Remove all __pycache__ directories and Python compiled files (.pyc, .pyo).
    
    Args:
        root_dir: The root directory to start the cleanup from.
        
    Returns:
        A tuple of (number of directories removed, number of files removed)
    """
    dir_count = 0
    file_count = 0
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip .git directory
        if ".git" in dirpath:
            continue
            
        # Remove __pycache__ directories
        if "__pycache__" in dirnames:
            pycache_path = os.path.join(dirpath, "__pycache__")
            try:
                shutil.rmtree(pycache_path)
                dir_count += 1
                logging.info(f"Removed __pycache__ directory: {pycache_path}")
            except Exception as e:
                logging.error(f"Error removing {pycache_path}: {e}")
        
        # Remove .pyc, .pyo files
        for filename in filenames:
            if filename.endswith((".pyc", ".pyo")):
                file_path = os.path.join(dirpath, filename)
                try:
                    os.remove(file_path)
                    file_count += 1
                    logging.debug(f"Removed compiled Python file: {file_path}")
                except Exception as e:
                    logging.error(f"Error removing {file_path}: {e}")
    
    logging.info(f"Cleanup complete. Removed {dir_count} __pycache__ directories and {file_count} compiled files.")
    return dir_count, file_count

if __name__ == "__main__":
    # Configure basic logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Clean up __pycache__ directories and compiled Python files
    dir_count, file_count = cleanup_pycache()
    
    print(f"Cleanup complete!")
    print(f"Removed {dir_count} __pycache__ directories")
    print(f"Removed {file_count} compiled Python files")