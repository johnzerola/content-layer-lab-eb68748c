"""Bounded first-wave collection; public metadata/source only, never execute downloads."""
import argparse
import json
from pathlib import Path
from lab import remote
from lab.core import ROOT, now

REPOS = {
 'propainter': 'sczhou/ProPainter', 'diffueraser': 'lixiaowen-xw/DiffuEraser',
 'raft': 'princeton-vl/RAFT', 'sttn': 'researchmm/STTN', 'lama': 'advimman/lama',
 'sam2': 'facebookresearch/sam2', 'e2fgvi': 'MCG-NKU/E2FGVI',
 'fuseformer': 'ruiliu-ai/FuseFormer', 'focal-transformer': 'microsoft/Focal-Transformer',
 'videopainter': 'TencentARC/VideoPainter', 'cutie': 'hkchengrex/Cutie',
}


def collect(name):
    folder = ROOT / 'research/projects/evidence'
    folder.mkdir(parents=True, exist_ok=True)
    try:
        data = remote.analyze_github_repository(REPOS[name])
        file = folder / (name + '.json')
        file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
        print(name, data['revision'], len(data['files']), 'files', flush=True)
        return {'name': name, 'status': 'COLLECTED', 'revision': data['revision']}
    except Exception as exc:
        print(name, type(exc).__name__, str(exc)[:200], flush=True)
        return {'name': name, 'status': 'UNAVAILABLE', 'error': type(exc).__name__, 'detail': str(exc)[:300]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('names', nargs='*', default=list(REPOS))
    args = parser.parse_args()
    results = []
    limited = False
    for name in args.names:
        if limited:
            results.append({'name': name, 'status': 'SKIPPED_RATE_LIMIT'})
            continue
        result = collect(name)
        results.append(result)
        limited = '403' in result.get('detail', '') or '429' in result.get('detail', '')
    folder = ROOT / 'research/projects/evidence'
    inventory = {}
    for name in REPOS:
        file = folder / (name + '.json')
        if file.exists():
            data = json.loads(file.read_text(encoding='utf-8'))
            inventory[name] = {'status': 'COLLECTED', 'revision': data['revision']}
        else:
            inventory[name] = {'status': 'NOT_COLLECTED'}
    (folder / 'collection-status.json').write_text(json.dumps({'at': now(), 'results': results, 'inventory': inventory}, indent=2), encoding='utf-8')
