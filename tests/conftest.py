"""Pytest config — make the ``backend`` package importable from tests.

The submodule keeps its source directly under ``backend/`` instead of the
more conventional ``src/backend``, so we add the submodule root to
``sys.path`` here once per session.  This mirrors what the ``backend``
package itself does at runtime via uvicorn's working directory.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
