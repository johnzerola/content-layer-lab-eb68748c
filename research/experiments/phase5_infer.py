"""Bounded local temporal inference, raw output retained before masked composition."""
import json
import time
import cv2
import numpy as np
import torch
from phase5_prepare import OUT, ROI, TARGET, CONTEXT, save
from phase5_runtime import load_model, sha


def main():
    smoke = json.loads((OUT/'runtime/smoke.json').read_text())
    assert smoke['status'] == 'PASS' and smoke['repeat_max_abs'] <= 1e-6
    assert not (OUT/'inference.json').exists(), 'Do not overwrite recorded inference'
    torch.set_num_threads(2)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.backends.cuda.matmul.allow_tf32 = False
    start = time.perf_counter()
    model, provenance = load_model()
    model = model.cuda()
    arrays = {i: cv2.imread(str(OUT/'model-input'/f'{i:06d}.png')) for i in CONTEXT}
    windows = []
    for offset in range(0, len(TARGET), 3):
        core = TARGET[offset:offset+3]
        ids = list(range(core[0]-2, core[-1]+3))
        frames = np.stack([arrays[i][..., ::-1] for i in ids]).copy()
        tensor = torch.from_numpy(frames).permute(0,3,1,2).unsqueeze(0).cuda().float()/255
        tick = time.perf_counter()
        with torch.inference_mode():
            raw, clean = model(tensor.clone(), return_lqs=True)
        torch.cuda.synchronize()
        seconds = time.perf_counter()-tick
        assert torch.isfinite(raw).all() and raw.shape == (1,len(ids),3,ROI[3]*4,ROI[2]*4)
        raw = raw[0].permute(0,2,3,1).cpu().numpy()
        clean = clean[0].permute(0,2,3,1).cpu().numpy()
        for i in core:
            pos = ids.index(i)
            for folder in ['raw-x4-float','cleaned-input-float','native-float']:
                (OUT/folder).mkdir(exist_ok=True)
            np.save(OUT/'raw-x4-float'/f'{i:06d}.npy', raw[pos], allow_pickle=False)
            np.save(OUT/'cleaned-input-float'/f'{i:06d}.npy', clean[pos], allow_pickle=False)
            native_rgb = cv2.resize(raw[pos], ROI[2:], interpolation=cv2.INTER_AREA)
            np.save(OUT/'native-float'/f'{i:06d}.npy', native_rgb, allow_pickle=False)
            save(OUT/'native-preview'/f'{i:06d}.png', np.clip(np.rint(native_rgb[...,::-1]*255),0,255).astype(np.uint8))
        windows.append(dict(core=core, input=ids, seconds=seconds,
                            input_sha256=sha(OUT/'model-input'/f'{ids[0]:06d}.png'),
                            raw_min=float(raw.min()), raw_max=float(raw.max())))
        print(json.dumps(windows[-1]), flush=True)
        del tensor, raw, clean
    report = dict(model='RealBasicVSR', provenance=provenance, roi_xywh=ROI, frames=TARGET,
                  core_window=3, real_context_each_side=2, windows=windows,
                  native_downsample='float32 area 4x to native, no input resize',
                  dynamic_refine_threshold=255, cleaning='single conservative pass; default test recommendation 5 not used',
                  precision='float32', peak_vram_bytes=torch.cuda.max_memory_allocated(),
                  seconds=time.perf_counter()-start, cloud_cost_usd=0, production=False)
    (OUT/'inference.json').write_text(json.dumps(report, indent=2),encoding='utf-8')
    print(json.dumps({'finished':True,'seconds':report['seconds']}), flush=True)


if __name__ == '__main__':
    main()
