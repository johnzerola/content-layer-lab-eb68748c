"""Validate lab artifact links, skill references and unchanged source fingerprints."""
import json
import re
from pathlib import Path
from lab.core import ROOT, digest, now
from install_skills import SKILLS

files = [p for p in (ROOT / 'research').rglob('*.md')
         if not any(part in {'.venv', 'cache', 'runs', 'data', 'vendor'} for part in p.parts)]
files += [ROOT / '.agents/skills' / name / 'SKILL.md' for name in SKILLS]
broken = []
for path in files:
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if '://' in target or target.startswith('#'):
            continue
        resolved = (path.parent / target.split('#')[0]).resolve()
        if not resolved.exists() and resolved != ROOT / 'research/artifact-validation.json':
            broken.append({'file': str(path.relative_to(ROOT)), 'target': target})
baseline = json.loads((ROOT / 'research/current-system/baseline.json').read_text(encoding='utf-8'))
changed = [p for p,h in baseline['files'].items() if not (ROOT / p).is_file() or digest(ROOT / p) != h]
result = {'at': now(), 'markdown_files_checked': len(files), 'broken_links': broken,
          'baseline_files_checked': len(baseline['files']), 'changed_source_files': changed,
          'skill_count': len(SKILLS), 'success': not broken and not changed}
(ROOT / 'research/artifact-validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['success'] else 1)
