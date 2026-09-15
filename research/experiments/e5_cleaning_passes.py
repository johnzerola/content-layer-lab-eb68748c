"""Observe one unchanged RealBasicVSR forward using a non-mutating hook."""
from pathlib import Path
import sys,json,time
import numpy as np,cv2,torch
import phase5_runtime as rt
P=Path('G:/dowloand/teste/cleaner-e5-realbasicvsr-20260913')
R=Path('G:/dowloand/teste/cleaner-e5-cleaning-passes-20260913')
B=P.parent/'cleaner-e5-synthetic-decompression-gt-20260913'
sys.path.insert(0,str(B));import run_experiment as b

def main():
    R.mkdir(exist_ok=False);began=time.perf_counter()
    parent=json.loads((P/'contract.json').read_text())
    hashes=dict(parent['input_hashes']);hashes[str(P/'contract.json')]=b.sha(P/'contract.json')
    for i in (24,25,26):
        for folder in ('cleaned-float','raw-x4-float','frames'):
            f=P/'window'/folder/(f'{i:06d}'+('.png' if folder=='frames' else '.npy'))
            hashes[str(f)]=b.sha(f)
    assert all(b.sha(Path(p))==h for p,h in hashes.items())
    torch.set_num_threads(2);cv2.setNumThreads(2);torch.manual_seed(0)
    torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
    torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    model,prov=rt.load_model();assert prov==parent['provenance'];model.dynamic_refine_thres=5/255;model.cuda()
    ids=[0,0,0,1,2,3,4];frames=b.decode(B/'window/degraded.mkv')[ids]
    x=torch.from_numpy(frames[...,::-1].copy()).permute(0,3,1,2)[None].cuda().float()/255
    contract={'id':'CLEANER_E5_CLEANING_PASSES_SINGLE_WINDOW','input_hashes':hashes,'provenance':prov,
        'source_input':[24+i for i in ids],'source_core':[24,25,26],'geometry':[600,420],
        'precision':'FP32','threshold':5,'max_passes':3,'code_sha':b.sha(Path(__file__)),
        'intervention':'non-mutating image_cleaning forward hook; copies input/residue and their sum, returns None; full unchanged model forward once',
        'validation':'returned clean/raw for core must exactly match archived floats; each pass input must exactly equal previous sum',
        'question':'Does damage exist after first pass or appear/amplify during later passes?',
        'scope':'causal stage diagnosis only, no candidate promotion, no threshold change, no expanded benchmark',
        'external_gpu_usd':0,'temporal_perceptual':'NOT_EVALUATED'}
    b.dump(R/'contract.json',contract)
    captures=[]
    def observe(module,args,residue):
        before=args[0];after=before+residue
        captures.append({'before':before.detach().cpu().numpy().copy(),
            'residue':residue.detach().cpu().numpy().copy(),'after':after.detach().cpu().numpy().copy(),
            'mean_abs_residue':float(residue.abs().mean().item())})
        return None
    hook=model.image_cleaning.register_forward_hook(observe)
    torch.cuda.synchronize();torch.cuda.reset_peak_memory_stats();t=time.perf_counter()
    with torch.inference_mode():raw,clean=model(x,return_lqs=True)
    torch.cuda.synchronize();elapsed=time.perf_counter()-t;hook.remove()
    assert torch.isfinite(raw).all() and torch.isfinite(clean).all()
    checks={}
    for j,i in enumerate((24,25,26)):
        for label,value in [('raw-x4-float',raw),('cleaned-float',clean)]:
            a=value[0,j+2].permute(1,2,0).cpu().numpy();old=np.load(P/'window'/label/f'{i:06d}.npy')
            checks[f'{label}_{i}']={'exact':bool(np.array_equal(a,old)),'max_abs_delta':float(np.abs(a-old).max())}
    assert all(v['exact'] for v in checks.values()),checks
    gt=b.decode(B/'window/gt.mkv');records=[]
    for k,cap in enumerate(captures):
        folder=R/f'pass-{k+1}';folder.mkdir()
        if k:assert np.array_equal(cap['before'],captures[k-1]['after'])
        assert np.isfinite(cap['after']).all()
        np.savez(folder/'all-seven-float.npz',before=cap['before'],residue=cap['residue'],after=cap['after'])
        rows=[]
        for j,i in enumerate((24,25,26)):
            a=cap['after'][j+2].transpose(1,2,0)
            im=np.clip(np.rint(a[...,::-1]*255),0,255).astype(np.uint8)
            cv2.imwrite(str(folder/f'{i}.png'),im)
            rows.append({'source_frame':i,'metrics':b.metrics(gt[i-24],im)})
        stop=cap['mean_abs_residue']<5/255
        records.append({'pass':k+1,'mean_abs_residue_0_1':cap['mean_abs_residue'],
            'mean_abs_residue_255':cap['mean_abs_residue']*255,'threshold_255':5,'stop_condition':stop,'rows':rows})
        assert not stop or k==len(captures)-1
    for j,i in enumerate((24,25,26)):
        ims=[b.label(gt[i-24],'GT relativo'),b.label(frames[j+2],'Degradado')]
        ims += [b.label(cv2.imread(str(R/f'pass-{k+1}'/f'{i}.png')),f'Cleaning pass {k+1}') for k in range(len(captures))]
        ims += [b.label(cv2.imread(str(P/'window/frames'/f'{i:06d}.png')),'SR x4 -> area arquivado')]
        while len(ims)%2:ims.append(np.zeros_like(ims[0]))
        panel=np.vstack([np.hstack(ims[z:z+2]) for z in range(0,len(ims),2)])
        cv2.imwrite(str(R/f'comparison-{i}.png'),panel)
    baseline=[{'source_frame':i,'metrics':b.metrics(gt[i-24],frames[j+2])} for j,i in enumerate((24,25,26))]
    assert all(b.sha(Path(p))==h for p,h in hashes.items())
    result={'passes':records,'baseline':baseline,'archive_equivalence':checks,'input_hashes_preserved':True,
        'pass_count':len(captures),'stop_reason':'residue_below_threshold' if records[-1]['stop_condition'] else 'max_three_passes',
        'instrumented_forward_seconds':elapsed,'runner_seconds':time.perf_counter()-began,
        'peak_cuda_MiB':torch.cuda.max_memory_allocated()/2**20,'external_gpu_usd':0,
        'quality_decision':'REJECT_PARENT_MAINTAINED','visual':'PENDING','timing_limit':'hook includes CPU copies; not comparable latency benchmark'}
    b.dump(R/'result.json',result)
    print(json.dumps(result),flush=True)
if __name__=='__main__':main()
