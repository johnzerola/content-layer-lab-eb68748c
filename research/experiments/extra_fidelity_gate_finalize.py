"""Archive the reviewed laboratory gate; does not run inference or change baselines."""
import hashlib
import json
from pathlib import Path
import cv2
from fidelity_roi_contract import support_masks, validate_frame_ids

ROOT=Path('G:/dowloand/teste/extra-global-fidelity-gate-20260911')

def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main():
    rows=json.loads((ROOT/'frame-gates.json').read_text())
    validate_frame_ids([r['source_frame'] for r in rows],range(104,147))
    try:validate_frame_ids(range(105,148),range(104,147))
    except ValueError:pass
    else:raise AssertionError('Negative ordering control accepted')
    (ROOT/'chroma-masks').mkdir(exist_ok=True)
    for row in rows:
        idx=row['source_frame'];mask=cv2.imread(str(ROOT/'masks'/f'{idx:06d}.png'),0)>0
        _,c=support_masks(mask,4)
        assert cv2.imwrite(str(ROOT/'chroma-masks'/f'{idx:06d}.png'),c.astype('uint8')*255)
    review=json.loads((ROOT/'review.json').read_text())
    # These observations were made by the assistant on the three native montages.
    review['visual_review_status']='THREE_NATIVE_STILLS_INSPECTED_BY_ASSISTANT'
    review['visual_observation']='No obvious added chroma fringe between RGB working and decoded YUV in frames 104,120,146. Smooth inpainting band remains in both. Not a blind human motion review.'
    (ROOT/'review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
    cmds=json.loads((ROOT/'commands.json').read_text())
    summary={'ffmpeg_logged_command_count':len(cmds),'ffmpeg_logged_seconds_sum':sum(x['seconds'] for x in cmds),
             'wall_time_total_seconds':None,'inside_rgb_to_420_mae_mean_per_frame':sum(x['rgb_to_420_inside_mae'] for x in rows)/len(rows),
             'actual_changed_rgb_occurrences':sum(x['changed_rgb_inside'] for x in rows),
             'external_zero_all_frames':all(x['yuv_decoded_rgb_external_changed']==0 for x in rows),
             'diffueraser_end_to_end_equivalence':'NOT_RUN_RUNTIME_BLOCKED',
             'code_note':'Execution hashes remain in result.json; code-hashes-final.json also records final ordering-check hardening.'}
    (ROOT/'final-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    names=['fidelity_roi_contract.py','extra_fidelity_gate.py','extra_fidelity_gate_review.py','extra_fidelity_gate_finalize.py']
    (ROOT/'code-hashes-final.json').write_text(json.dumps({n:digest(Path(__file__).with_name(n)) for n in names},indent=2),encoding='utf-8')
    files={str(p.relative_to(ROOT)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':digest(p)}
           for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='artifact-hashes.json'}
    (ROOT/'artifact-hashes.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
