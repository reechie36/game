#!/usr/bin/env python3
"""Launcher for Python Letter Rise from repository root."""

import os
import subprocess
import sys

PYTHON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "python")

if __name__ == "__main__":
    sys.exit(subprocess.call([sys.executable, "main.py"], cwd=PYTHON_DIR))