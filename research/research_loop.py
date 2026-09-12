"""Finite, resumable public research rounds with per-provider status and cooldown."""
import argparse
import json
import time
from pathlib import Path
from uuid import uuid4

from lab import remote
from lab.core import ROOT, now, record_research

QUERIES = [
    ('papers', 'all:"video inpainting"', remote.search_papers),
    ('models', 'video-inpainting', remote.search_models),
    ('projects', 'video inpainting', remote.search_github_projects),
]


def run(min_interval_hours=24):
    folder = ROOT / 'research/research-runs'
    folder.mkdir(exist_ok=True)
    state_file = folder / 'state.json'
    state = json.loads(state_file.read_text(encoding='utf-8')) if state_file.exists() else {}
    results = []
    for category, query, search in QUERIES:
        key = category + ':' + query
        if time.time() - state.get(key, 0) < min_interval_hours * 3600:
            results.append({'query': key, 'status': 'COOLDOWN'})
            continue
        try:
            data = search(query, 5)
            record = record_research(category, 'Research round: ' + query,
                                     json.dumps(data, ensure_ascii=False),
                                     [data['source']['url']], 'CONFIRMED')
            results.append({'query': key, 'status': 'COLLECTED_METADATA', **record})
        except Exception as exc:
            results.append({'query': key, 'status': 'UNAVAILABLE',
                            'error': type(exc).__name__, 'detail': str(exc)[:400]})
        # Failed providers also receive cooldown, avoiding rate-limit retry loops.
        state[key] = time.time()
    report = {'at': now(), 'results': results,
              'scope': 'Metadata observation; semantic conclusions and experiments require skill review'}
    (folder / (uuid4().hex + '.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
    temp = folder / ('state-' + uuid4().hex + '.tmp')
    temp.write_text(json.dumps(state), encoding='utf-8')
    temp.replace(state_file)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--min-interval-hours', type=float, default=24)
    args = parser.parse_args()
    if args.min_interval_hours < 1:
        parser.error('minimum interval is one hour')
    print(json.dumps(run(args.min_interval_hours), indent=2))
