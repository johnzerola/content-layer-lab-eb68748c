"""Frozen E5 RealBasicVSR x4 -> area-native experiment, isolated from production."""
from pathlib import Path
import sys,json,time,subprocess
import numpy as np, cv2, torch
import phase5_runtime as rt
R=Path('G:/dowloand/teste/cleaner-e5-realbasicvsr-20260913')
B=R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'
sys.path.insert(0,str(B))
import run_experiment as b

def main():
    R.mkdir(exist_ok=False)
    began=time.perf_counter()
    torch.set_num_threads(2);cv2.setNumThreads(2);torch.manual_seed(0)
    torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
    torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    paths=[b.SOURCE,b.GOLDEN,B/'contract.json',B/'run_experiment.py']
    paths += [B/n/f for n in b.CLIPS for f in ('gt.mkv','degraded.mkv','restored.mkv')]
    hashes={str(p):b.sha(p) for p in paths}
    model,provenance=rt.load_model()
    # Official test recommendation (constructor accepts integer, stored normalized).
    model.dynamic_refine_thres=5/255
    model.cuda()
    contract={'id':'CLEANER_E5_REALBASICVSR_X4_AREA_NATIVE_GT','input_hashes':hashes,
        'code_sha':b.sha(Path(__file__)),'provenance':provenance,
        'hypothesis':'Training includes blur and H264/MPEG4 compression; test whether learned restoration followed by area integration recovers known native detail.',
        'training_source':'https://github.com/ckkelvinchan/RealBasicVSR/blob/master/configs/realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds.py',
        'code_license':'Apache-2.0, local pinned MMEditing LICENSE','commercial_clearance':'NOT_COMPLETED: weights/datasets/dependencies require separate review; research only',
        'precision':'FP32','tf32':False,'input_geometry':[600,420],'input_resize':False,
        'raw_output_geometry':[2400,1680],'evaluation_geometry':[600,420],
        'output_reduction':'cv2.INTER_AREA on RGB float32 raw x4, then rint clip to BGR uint8. Explicit restoration+resampling contract, not native x1 network or certified x4 detail.',
        'context':'core 3 output frames with 2 degraded context frames each side; 7 inputs, replicated at clip boundaries; 8 independent windows per clip, recurrent state reset each window',
        'dynamic_refine_threshold':5,'cleaning_max_passes':3,'blend':None,'extra_sharpen':False,
        'gates':b.GATES,'GT_in_inference':False,'clips':b.CLIPS,'fps':30,
        'resource_contract':{'device':torch.cuda.get_device_name(),'max_window_seconds':120,'max_total_inference_seconds':900,'external_gpu_usd':0,'oom_policy':'stop, no fallback or resize'},
        'environment':{'python':sys.version,'torch':torch.__version__,'opencv':cv2.__version__},
        'runtime_limit':'Narrow legacy infrastructure adapter strict-loads unchanged architecture; no certified equivalence to old runtime.'}
    b.dump(R/'contract.json',contract)
    # Bounded capacity/finite-output probe at exact target geometry, before GT runs.
    probe=torch.zeros((1,7,3,420,600),device='cuda')
    torch.cuda.reset_peak_memory_stats();t=time.perf_counter()
    with torch.inference_mode():y=model(probe)
    torch.cuda.synchronize()
    assert y.shape==(1,7,3,1680,2400) and torch.isfinite(y).all()
    smoke={'seconds':time.perf_counter()-t,'peak_MiB':torch.cuda.max_memory_allocated()/2**20,
        'shape':list(y.shape),'finite':True,'quality_test':False,'strict_loading':provenance['strict_load']}
    b.dump(R/'preflight.json',smoke);del y,probe
    total_infer=0;results={}
    for name,(start,end) in b.CLIPS.items():
        folder=R/name;folder.mkdir()
        for d in ('frames','raw-x4-float','cleaned-float'): (folder/d).mkdir()
        degraded=b.decode(B/name/'degraded.mkv');assert degraded.shape==(24,420,600,3)
        restored=[];windows=[]
        for offset in range(0,24,3):
            ids=[min(23,max(0,j)) for j in range(offset-2,offset+5)]
            rgb=degraded[ids,...,::-1].copy()
            x=torch.from_numpy(rgb).permute(0,3,1,2)[None].cuda().float()/255
            torch.cuda.synchronize();torch.cuda.reset_peak_memory_stats();t=time.perf_counter()
            with torch.inference_mode(): raw,clean=model(x,return_lqs=True)
            torch.cuda.synchronize();seconds=time.perf_counter()-t;total_infer+=seconds
            assert seconds<=120 and total_infer<=900
            assert raw.shape==(1,7,3,1680,2400) and torch.isfinite(raw).all() and torch.isfinite(clean).all()
            peak=torch.cuda.max_memory_allocated()/2**20
            # Archive only the three emitted core frames, without overlap duplicates.
            for j in range(3):
                i=start+offset+j
                a=raw[0,j+2].permute(1,2,0).cpu().numpy()
                c=clean[0,j+2].permute(1,2,0).cpu().numpy()
                np.save(folder/'raw-x4-float'/f'{i:06d}.npy',a,allow_pickle=False)
                np.save(folder/'cleaned-float'/f'{i:06d}.npy',c,allow_pickle=False)
                native=cv2.resize(a,(600,420),interpolation=cv2.INTER_AREA)
                im=np.clip(np.rint(native[...,::-1]*255),0,255).astype(np.uint8)
                assert cv2.imwrite(str(folder/'frames'/f'{i:06d}.png'),im)
                restored.append(im)
            windows.append({'source_core':[start+offset,start+offset+2],'input_source':[start+k for k in ids],'seconds':seconds,'peak_MiB':peak})
            del x,raw,clean,a,c,native
            b.dump(R/'progress.json',{'clip':name,'completed_core_frames':len(restored),'inference_seconds':total_infer,'last_window':windows[-1]})
            print(json.dumps({'clip':name,'frames':len(restored),'seconds':seconds,'peak_MiB':peak}),flush=True)
        restored=np.array(restored);gt=b.decode(B/name/'gt.mkv');dis=b.decode(B/name/'restored.mkv')
        rows=[{'source_frame':start+i,'degraded':b.metrics(g,d),'restored':b.metrics(g,r)} for i,(g,d,r) in enumerate(zip(gt,degraded,restored))]
        means={arm:{k:float(np.mean([v[arm][k] for v in rows])) for k in rows[0][arm]} for arm in ('degraded','restored')}
        d=means['degraded'];r=means['restored'];g=b.GATES
        td=b.temporal_error(gt,degraded);tr=b.temporal_error(gt,restored)
        gates={'psnr':r['psnr_db']-d['psnr_db']>=g['psnr_gain_db_min'],'ssim':r['ssim_y']-d['ssim_y']>=g['ssim_delta_min'],
            'edge':r['edge_mae']<=d['edge_mae']*g['edge_mae_ratio_max'],'detail':r['highpass_std']>=d['highpass_std']*g['highpass_std_ratio_to_degraded_min'],
            'temporal':tr<=td*g['temporal_gt_error_ratio_max']}
        b.encode(restored,folder/'restored.mkv',True);assert np.array_equal(restored,b.decode(folder/'restored.mkv'))
        panels=np.array([np.vstack([np.hstack([b.label(a,'GT relativo'),b.label(d,'Degradado')]),np.hstack([b.label(r,'RealBasicVSR x4 -> area'),b.label(s,'DIS baseline')])]) for a,d,r,s in zip(gt,degraded,restored,dis)])
        for i in (0,12,23):cv2.imwrite(str(folder/f'critical-{start+i}.png'),panels[i])
        b.encode(panels,folder/'comparison.mp4')
        results[name]={'rows':rows,'means':means,'gates':gates,'temporal_error':{'degraded':td,'restored':tr},'windows':windows,
            'lossless_roundtrip_exact':True,'decision':'PASS_TO_REVIEW' if all(gates.values()) else 'REJECT',
            'output_hashes':{str(p.relative_to(folder)):b.sha(p) for p in folder.rglob('*') if p.is_file()}}
        b.dump(R/'clips.json',results)
    assert hashes=={str(p):b.sha(p) for p in paths}
    b.dump(R/'result.json',{'clips':results,'inference_seconds':total_infer,'runner_seconds':time.perf_counter()-began,
        'decision':'PASS_TO_REVIEW' if all(all(c['gates'].values()) for c in results.values()) else 'REJECT_METRIC_GATE',
        'inputs_source_golden_preserved':True,'visual':'PENDING','external_gpu_usd':0})
    print('Finished frozen E5 benchmark',flush=True)

if __name__=='__main__':
    try: main()
    except Exception as e:
        if R.exists():b.dump(R/'failure.json',{'type':type(e).__name__,'error':str(e),'no_fallback':True})
        raise
