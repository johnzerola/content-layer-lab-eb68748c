"""Append only this lab's stdio configuration; preserve existing servers."""
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / '.codex/config.toml'
body = path.read_text(encoding='utf-8')
config = tomllib.loads(body)
if 'cleaner-research' not in config.get('mcp_servers', {}):
    python = ROOT / 'research/.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    block = f'''

# Isolated Cleaner research lab; does not run the production worker.
[mcp_servers.cleaner-research]
command = '{python.as_posix()}'
args = ['{(ROOT / 'research/server.py').as_posix()}']
startup_timeout_sec = 30
tool_timeout_sec = 180
'''
    tomllib.loads(body + block)
    path.write_text(body + block, encoding='utf-8')
    print('Configured cleaner-research stdio server')
else:
    print('Existing cleaner-research configuration preserved')
