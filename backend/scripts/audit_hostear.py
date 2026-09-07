"""Read-only inventory; never prints credentials or signed URLs.

Run over SSH with Python 3 on the Hostear host, not inside the worker.
"""
import json
from pathlib import Path

root = Path('/opt/cleaner-cpu')
for file in sorted((root / 'data/storage').glob('*/state.json')):
    try:
        data = json.loads(file.read_text())
        print(json.dumps({
            'job': file.parent.name,
            'status': data.get('status'),
            'stage': data.get('stage'),
            'metrics': data.get('metrics'),
            'probe': data.get('probe'),
        }, ensure_ascii=False))
    except (ValueError, OSError):
        pass

for directory in (root, Path('/opt/content-layer-lab-runpod-build')):
    for file in directory.glob('.env*'):
        keys = [line.split('=', 1)[0].strip() for line in file.read_text().splitlines()
                if '=' in line and not line.lstrip().startswith('#')]
        print(json.dumps({'config': str(file), 'keys': keys}))
