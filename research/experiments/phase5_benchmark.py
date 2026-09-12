"""Import Phase5 artifacts into the existing research harness, without GT claims."""
import json
from pathlib import Path
import shutil
import sys
import cv2
from phase5_prepare import OUT,TARGET

RESEARCH=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(RESEARCH))
from server import benchmark_engine,import_result,compare_results,record_research


def main():
    case=RESEARCH/'benchmarks/data/phase5-sweater-local'
    for name in ['input','mask','A20','A40']:
        (case/name).mkdir(parents=True,exist_ok=True)
    for i in TARGET:
        filename=f'{i:06d}.png'
        shutil.copy2(OUT/'input/B2'/filename,case/'input'/filename)
        mask=cv2.imread(str(OUT/'decision/labels'/filename),0)==3
        assert cv2.imwrite(str(case/'mask'/filename),mask.astype('uint8')*255)
        for name in ['A20','A40']:
            shutil.copy2(OUT/'candidates'/name/'composite'/filename,case/name/filename)
    manifest=dict(id='phase5-sweater-local-20260911',kind='real-video-no-clean-ground-truth',
                  categories=['sweater','synthetic-inpaint-texture','local-temporal-restoration'],
                  fps=30,frames=len(TARGET),input='input',mask='mask',scene_cuts=[],
                  rights='User-supplied local test clip; authorized local evaluation. No redistribution. Vmake excluded from model and benchmark ground truth.',
                  note='B2 OFF is input, not clean GT. This measures preservation by restoration only.')
    (case/'case.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    path='data/phase5-sweater-local/case.json'
    baseline=benchmark_engine(path,engine='identity')
    reports=[baseline]
    for name in ['A20','A40']:
        reports.append(import_result(path,f'data/phase5-sweater-local/{name}',f'RealBasicVSR-local-{name}',
                                     ['research/experiments/phase5_runtime.py',str(OUT/'inference.json'),
                                      str(OUT/'manifest.json'),str(OUT/'candidates'/name/'metrics.json')]))
    paths=[r['report_path'].removeprefix('research/benchmarks/') for r in reports]
    compared=compare_results(paths)
    (OUT/'harness-comparison.json').write_text(json.dumps(dict(report_paths=paths,**compared),indent=2),encoding='utf-8')
    print(json.dumps({'harness_verdict':compared['verdict'],'paths':paths}),flush=True)


if __name__=='__main__':
    main()
