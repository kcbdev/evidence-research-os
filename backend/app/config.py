"""Runtime configuration. Values resolve in Phase 1; structure only."""

import os
from pathlib import Path

LAB_PROJECTS_ROOT = Path(os.environ.get("LAB_PROJECTS_ROOT", "lab-projects"))
