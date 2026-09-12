"""Collect targeted algorithm files and issue/PR evidence, pinned to first-wave revisions."""
import json
from urllib.parse import quote
from lab import remote
from lab.core import ROOT

TARGETS = {
 'propainter': ['README.md', 'model/propainter.py', 'model/recurrent_flow_completion.py', 'model/modules/flow_comp_raft.py'],
 'diffueraser': ['README.md', 'diffueraser/diffueraser.py', 'propainter/LICENSE'],
 'raft': ['README.md', 'core/raft.py', 'core/corr.py', 'core/update.py', 'demo.py'],
 'sttn': ['README.md', 'test.py', 'model/sttn.py'],
 'lama': ['README.md', 'bin/predict.py', 'saicinpainting/training/modules/ffc.py'],
 'sam2': ['README.md', 'sam2/build_sam.py', 'sam2/sam2_video_predictor.py'],
 'e2fgvi': ['README.md', 'test.py', 'model/e2fgvi.py'],
 'fuseformer': ['README.md', 'test.py', 'model/fuseformer.py'],
 'focal-transformer': ['README.md', 'classification/focal_transformer.py'],
 'videopainter': ['README.md', 'inference.py'],
 'cutie': ['README.md', 'cutie/inference/inference_core.py', 'cutie/model/cutie.py'],
}

if __name__ == '__main__':
    folder = ROOT / 'research/projects/evidence'
    for name, paths in TARGETS.items():
        file = folder / (name + '.json')
        if not file.exists():
            continue
        data = json.loads(file.read_text(encoding='utf-8'))
        have = {f['path'] for f in data['files']}
        for path in paths:
            if path in have or path not in data['files_in_tree']:
                continue
            src = remote.fetch('https://raw.githubusercontent.com/' + data['repository'] + '/' + data['revision'] + '/' + quote(path, safe='/'))
            # Cached full text remains local; evidence file retains bounded excerpts.
            data['files'].append({'path': path, 'source': {k:v for k,v in src.items() if k != 'body'},
                                  'content': src['body'][:60000], 'truncated': len(src['body']) > 60000})
        file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
        print(name, len(data['files']), flush=True)
    for number in (112, 104):
        try:
            data, source = remote.json_get(f'https://api.github.com/repos/sczhou/ProPainter/pulls/{number}')
            files, diff_source = remote.json_get(f'https://api.github.com/repos/sczhou/ProPainter/pulls/{number}/files?per_page=30')
        except Exception as exc:
            (folder / 'pr-collection-status.json').write_text(json.dumps({
                'status': 'UNAVAILABLE', 'number': number, 'error': type(exc).__name__, 'detail': str(exc)[:400]}, indent=2), encoding='utf-8')
            print('PR collection stopped:', type(exc).__name__, flush=True)
            break
        (folder / f'propainter-pr-{number}.json').write_text(json.dumps({
            'source': source, 'diff_source': diff_source, 'base': data['base']['sha'], 'head': data['head']['sha'],
            'head_repository': data['head']['repo']['full_name'] if data['head'].get('repo') else None,
            'merged': data['merged'], 'body': data['body'], 'files': files}, indent=2), encoding='utf-8')
        print('ProPainter PR', number, flush=True)
