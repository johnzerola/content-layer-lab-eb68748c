"""Post-hoc stage diagnosis on archived frames; not a candidate ablation."""
from pathlib import Path
import sys,json
import numpy as np,cv2
R=Path('G:/dowloand/teste/cleaner-e5-realbasicvsr-20260913')
B=R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'
sys.path.insert(0,str(B));import run_experiment as b
D=R/'stage-diagnosis';D.mkdir(exist_ok=False)
gt=b.decode(B/'window/gt.mkv');degraded=b.decode(B/'window/degraded.mkv');rows=[]
for frame in (24,36,47):
    j=frame-24
    clean=np.load(R/'window/cleaned-float'/f'{frame:06d}.npy',allow_pickle=False)
    clean=np.clip(np.rint(clean[...,::-1]*255),0,255).astype(np.uint8)
    final=cv2.imread(str(R/'window/frames'/f'{frame:06d}.png'))
    row={'source_frame':frame,'degraded':b.metrics(gt[j],degraded[j]),'cleaned':b.metrics(gt[j],clean),'final':b.metrics(gt[j],final)}
    rows.append(row)
    panel=np.vstack([np.hstack([b.label(gt[j],'GT relativo'),b.label(degraded[j],'Degradado')]),
                     np.hstack([b.label(clean,'Cleaning interno arquivado'),b.label(final,'Ramo SR x4 -> area')])])
    cv2.imwrite(str(D/f'{frame}.png'),panel)
b.dump(D/'result.json',{'purpose':'Post-hoc stage localization recommended by independent reviewer; not promotion or new engine','frames':rows,'new_inference':False,'temporal_review':False,'source_script_sha':b.sha(Path(__file__))})
print(json.dumps(rows),flush=True)
