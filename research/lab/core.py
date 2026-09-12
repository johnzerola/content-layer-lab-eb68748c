"""Bounded repository inspection and append-only research records."""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
CATEGORIES = {'projects', 'papers', 'models', 'commercial', 'licenses', 'benchmarks',
              'experiments', 'failures', 'algorithms', 'current-system', 'architecture-decisions'}
SOURCE_ROOTS = ('backend/app', 'backend/runpod_handler.py', 'src/lib', 'src/components',
                'src/routes', 'backend/requirements.txt', 'package.json')
SKIP = {'node_modules', '.git', '.venv', '__pycache__', 'vendor', 'storage'}


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def confined(base, relative, *, exists=True):
    base = Path(base).resolve()
    p = (base / relative).resolve()
    if not p.is_relative_to(base) or (exists and not p.is_file()):
        raise ValueError('Path must be a file within the permitted root')
    return p


def source_files(root=ROOT):
    for name in SOURCE_ROOTS:
        start = root / name
        if start.is_file():
            yield start
        elif start.is_dir():
            for directory, dirs, files in os.walk(start, followlinks=False):
                dirs[:] = sorted(d for d in dirs if d not in SKIP and not Path(directory, d).is_symlink())
                for name in sorted(files):
                    p = Path(directory, name)
                    if p.suffix in {'.py', '.ts', '.tsx'} and not p.is_symlink():
                        yield p


def python_symbols(text):
    tree = ast.parse(text)
    symbols = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            calls = sorted({ast.unparse(n.func) for n in ast.walk(node) if isinstance(n, ast.Call)})
            symbols.append({'name': node.name, 'kind': type(node).__name__, 'line': node.lineno,
                            'end_line': node.end_lineno, 'doc': ast.get_docstring(node),
                            'inputs': ast.unparse(node.args) if hasattr(node, 'args') else None,
                            'return_annotation': ast.unparse(node.returns) if getattr(node, 'returns', None) else None,
                            'callees_syntactic': calls,
                            'raises': [ast.unparse(n.exc) for n in ast.walk(node) if isinstance(n, ast.Raise) and n.exc]})
    imports = [ast.unparse(n) for n in ast.walk(tree) if isinstance(n, (ast.Import, ast.ImportFrom))]
    return symbols, imports


def inspect_project(query='', limit=60):
    if not 1 <= limit <= 200:
        raise ValueError('limit must be 1..200')
    matches = []
    for p in source_files():
        text = p.read_text(encoding='utf-8-sig')
        rel = p.relative_to(ROOT).as_posix()
        if query.lower() not in (rel + '\n' + text).lower():
            continue
        symbols, imports = python_symbols(text) if p.suffix == '.py' else ([], [])
        matches.append({'path': rel, 'sha256': digest(p), 'symbols': symbols, 'imports': imports,
                        'references': [{'line': i, 'text': line[:240]} for i, line in enumerate(text.splitlines(), 1)
                                       if query and query.lower() in line.lower()][:25]})
    return {'evidence': 'LOCAL_WORKING_TREE', 'deployment': 'UNVERIFIED',
            'total_matches': len(matches), 'truncated': len(matches) > limit, 'files': matches[:limit],
            'limitations': 'Python AST; TypeScript textual references only. Calls are syntactic, not resolved runtime edges.'}


def inspect_component(path, symbol=''):
    p = confined(ROOT, path)
    allowed = {x.resolve() for x in source_files()}
    if p not in allowed:
        raise ValueError('Only allowlisted project source can be inspected')
    body = p.read_text(encoding='utf-8-sig')
    symbols, imports = python_symbols(body) if p.suffix == '.py' else ([], [])
    selected = [s for s in symbols if not symbol or s['name'] == symbol]
    if symbol and not selected and p.suffix == '.py':
        raise ValueError('Symbol not found')
    refs = inspect_project(symbol, 100)['files'] if symbol else []
    configurations = sorted(set(re.findall(r'(?:getenv|environ\.get)\(["\']([^"\']+)', body)))
    lines = body.splitlines()
    excerpt = '\n'.join(lines[selected[0]['line']-1:selected[0]['end_line']]) if symbol and selected else body
    return {'path': path, 'sha256': digest(p), 'symbols': selected, 'dependencies': imports,
            'configuration_names_only': configurations, 'candidate_callers': [r['path'] for r in refs],
            'source_excerpt': excerpt[:30000], 'truncated': len(excerpt) > 30000,
            'review_required': ['responsibility beyond docstrings', 'runtime outputs', 'side effects',
                                'dynamic dispatch', 'performance risks'], 'deployment': 'UNVERIFIED'}


def trace_pipeline(stage='all'):
    data = json.loads((ROOT / 'research/current-system/pipeline.json').read_text(encoding='utf-8'))
    if stage != 'all':
        data['stages'] = [s for s in data['stages'] if stage.lower() in json.dumps(s).lower()]
    for item in data['stages']:
        item['files_present'] = all((ROOT / p).is_file() for p in item['files'])
    return data


def record_research(category, title, body, sources, evidence='HYPOTHESIS'):
    if category not in CATEGORIES or evidence not in {'CONFIRMED', 'LIKELY', 'HYPOTHESIS'}:
        raise ValueError('Invalid category or evidence')
    if not title.strip() or not body.strip() or not sources:
        raise ValueError('title, body and source references are required')
    if len(body) > 100000 or len(title) > 200:
        raise ValueError('Record too large')
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:70] or 'record'
    key = f'{slug}-{uuid4().hex[:12]}'
    directory = confined(ROOT / 'research', category, exists=False)
    directory.mkdir(parents=True, exist_ok=True)
    path = confined(directory, key + '.json', exists=False)
    value = {'id': key, 'title': title, 'body': body, 'sources': sources,
             'evidence': evidence, 'recorded_at': now(), 'category': category}
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
    return {'id': key, 'path': path.relative_to(ROOT).as_posix()}


def search_knowledge(query, limit=20):
    if not query.strip() or not 1 <= limit <= 100:
        raise ValueError('Nonempty query and limit 1..100 required')
    matches = []
    for category in sorted(CATEGORIES):
        folder = ROOT / 'research' / category
        if not folder.exists():
            continue
        for p in sorted(folder.iterdir()):
            if p.suffix not in {'.json', '.md'} or p.is_symlink() or not p.is_file():
                continue
            body = p.read_text(encoding='utf-8')
            i = body.lower().find(query.lower())
            if i >= 0:
                matches.append({'path': p.relative_to(ROOT).as_posix(),
                                'excerpt': body[max(0, i-160):i+1200]})
    return {'total': len(matches), 'matches': matches[:limit]}


def create_experiment(problem, hypothesis, baseline, change, dataset, metrics):
    fields = dict(problem=problem, hypothesis=hypothesis, baseline=baseline,
                  change=change, dataset=dataset, metrics=metrics)
    if any(not v for v in fields.values()):
        raise ValueError('All experiment fields required')
    return record_research('experiments', problem, json.dumps({**fields, 'status': 'DESIGNED',
        'result': None, 'production_changes': False}, ensure_ascii=False), [baseline, dataset])


def analyze_video_failure(observations, artifacts):
    """Prioritize investigation from observations; never claim inferred root cause."""
    rules = {
        'residual': ('MASK/OCR', 'Inspect character, outline and shadow coverage before dilation.'),
        'halo': ('MASK/COMPOSITION', 'Compare alpha boundary with lossless composite and encode control.'),
        'flicker': ('MASK/TEMPORAL WINDOW/FLOW', 'Compare mask trajectories, warped references and window boundaries.'),
        'ghost': ('FLOW/ENGINE', 'Inspect occlusion and forward/backward alignment residuals.'),
        'cut': ('SCENE CUT', 'Check whether any reference or mask propagation crosses a shot boundary.'),
        'blur': ('ROI/ENGINE/ENCODING', 'Inspect inference resolution and compare lossless with encoded output.'),
        'outside': ('COMPOSITION/ENCODING', 'Measure outside-mask change before and after encoding.'),
    }
    found = [{'priority': i+1, 'stage': v[0], 'evidence': 'HYPOTHESIS', 'next_check': v[1]}
             for i, (key, v) in enumerate(rules.items()) if key in observations.lower()]
    for priority, hypothesis in enumerate(found, 1):
        hypothesis['priority'] = priority
    return {'observations': observations, 'artifacts': artifacts, 'hypotheses': found,
            'root_cause': None, 'method': 'Observation rules; no automatic visual diagnosis',
            'unmatched': not bool(found)}
