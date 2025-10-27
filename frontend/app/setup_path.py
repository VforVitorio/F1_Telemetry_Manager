"""
Path setup module - Must be imported first before any project imports.
This configures sys.path to allow imports from the frontend directory.
"""
import sys
import os

# Get the frontend directory (parent of app directory)
frontend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Add it to sys.path if not already there
if frontend_dir not in sys.path:
    sys.path.insert(0, frontend_dir)
