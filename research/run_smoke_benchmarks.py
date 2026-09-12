"""Run only deterministic CPU harness controls and persist a versionable summary."""
import json
from lab import benchmark
from lab.core import ROOT, now

results = []
for case in ('static', 'pan', 'scene-cut'):
    reports = [benchmark.benchmark_engine(f'data/{case}/case.json', engine)
               for engine in ('identity', 'opencv-telea')]
    compared = benchmark.compare_results([r['report_path'].removeprefix('research/benchmarks/') for r in reports])
    results.append({'case': case, 'comparison': compared,
                    'reports': [{k: v for k,v in r.items() if k not in {'result_path'}} for r in reports]})
path = ROOT / 'research/benchmarks/smoke-results.json'
path.write_text(json.dumps({'at': now(), 'claim_scope': 'Synthetic CPU controls only', 'cases': results}, indent=2), encoding='utf-8')
print(path)
