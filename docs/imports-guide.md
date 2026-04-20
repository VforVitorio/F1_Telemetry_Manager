# Import Guide - F1 Telemetry Manager Frontend

## Problem
Python linters (isort, black, etc.) automatically reorder imports, which can break code when we need to configure `sys.path` before importing project modules.

## Implemented Solution

### Folder Structure
```
frontend/
├── __init__.py                    # Marks frontend as a package
├── config.py                      # Shared configuration
├── app/
│   ├── __init__.py
│   ├── setup_path.py             # ⭐ Path configuration module
│   └── main.py                   # Main application
├── components/
│   ├── __init__.py
│   └── auth/
│       ├── __init__.py
│       └── auth_form.py
├── pages/
│   └── __init__.py
├── services/
│   └── __init__.py
└── utils/
    └── __init__.py
```

### The `setup_path.py` File
This file configures `sys.path` to allow imports from the `frontend/` folder:

```python
"""
Path setup module - Must be imported first before any project imports.
"""
import sys
import os

# Get the frontend directory
frontend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Add it to sys.path if not already there
if frontend_dir not in sys.path:
    sys.path.insert(0, frontend_dir)
```

## How to Use in Your Files

### For files in `frontend/app/`
```python
# IMPORTANT: This import MUST be first to configure sys.path
# The comments below prevent linters from reordering it
import setup_path  # noqa: F401, E402  # isort: skip  # type: ignore

# Standard library imports
import requests
import streamlit as st

# Project imports (now work because setup_path configured sys.path)
from components.auth.auth_form import render_auth_form
from config import BACKEND_URL
```

### For files in other folders (example: `frontend/pages/dashboard.py`)
Create a `setup_path.py` in that folder or use adjusted relative paths:

```python
import sys
import os
# Adjust the number of dirname() according to the depth:
# pages/ is 1 level below frontend, so 1 dirname()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Now you can import
from config import BACKEND_URL
from components.auth.auth_form import render_auth_form
```

## Special Comments for Linters

- `# noqa: F401` - Ignores "imported but unused" (flake8)
- `# noqa: E402` - Ignores "module level import not at top" (flake8)
- `# isort: skip` - Prevents isort from reordering this line
- `# type: ignore` - Ignores type checker warnings (mypy, pylance)

## Advantages of This Solution

1. **Linter-resistant**: Special comments prevent automatic reordering
2. **Reusable**: Just import `setup_path` in each file that needs it
3. **Maintainable**: All path logic is in one place
4. **Works with IDEs**: Modern IDEs respect these comments

## Alternatives Considered

### ❌ Modify sys.path directly in each file
```python
# Problem: Linters move this after other imports
import sys
import os
sys.path.insert(0, os.path.dirname(...))
```

### ❌ Use relative imports
```python
# Problem: Doesn't work when running the script directly
from ..config import BACKEND_URL
```

### ✅ Current solution with setup_path.py
The best option for Streamlit projects and executable scripts.

## Execution

To run the application from the project root folder:
```bash
streamlit run frontend/app/main.py
```

Or from the frontend folder:
```bash
cd frontend
streamlit run app/main.py
```

Both will work correctly thanks to `setup_path.py`.

## Troubleshooting

### Import still fails after adding setup_path
1. Ensure all directories have `__init__.py` files
2. Check that `setup_path` is imported FIRST before any project imports
3. Verify the special comments are present: `# noqa: F401, E402  # isort: skip  # type: ignore`

### Linter still reorders imports
1. Make sure you're using ALL the special comments in the same line
2. Configure your linter to respect these comments (should be default)
3. Consider disabling auto-formatting on save for this specific line

### IDE shows warnings about unused import
This is expected! The `# noqa: F401` and `# type: ignore` comments tell the linter it's intentional. You can safely ignore these warnings.
