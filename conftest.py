"""
Pytest configuration file
Adds project directories to Python path for all tests
"""
import sys
from pathlib import Path

# Get project root
project_root = Path(__file__).parent

# Add all main directories to path so tests can import from them
directories_to_add = [
    project_root / "backend",
    project_root / "frontend",
    project_root / "shared",
]

for directory in directories_to_add:
    if directory.exists():
        sys.path.insert(0, str(directory))
