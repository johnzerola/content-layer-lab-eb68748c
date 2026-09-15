"""One-window checkpoint-only ablation. No automatic benchmark expansion."""
from pathlib import Path
import sys,json,time,shutil
import numpy as np,cv2,torch
import phase5_runtime as rt
R=Path('G:/dowloand/teste/cleaner-e5-wogan-pilot-20260913')
P=R.parent/'cleaner-e5-realbasicvsr-20260913'
B=R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'
sys.path.insert(0,str(B));import run_experiment as b
URL='https://download.openmmlab.com/mmediting/restorers/real_basicvsr/realbasicvsr_wogan_c64b20_2x30x8_lr1e-4_300k_reds_20211027-0e2ff207.pth'

def main():
    assert not (R/'contract.json').exists()
    began=time.perf_counter();parent=json.loads((P/'contract.json').read_text())
    weight_sha=b.sha(R/'checkpoint.pth');assert weight_sha.startswith('0e2ff207')
    hashes=dict(parent['input_hashes'])
    for i in (24,25,26):
        for folder in ('cleaned-float','raw-x4-float','frames'):
            p=P/'window'/folder/(f'{i:06d}'+('.png' if folder=='frames' else '.npy'));hashes[str(p)]=b.sha(p)
    assert all(b.sha(Path(p))==h for p,h in hashes.items())
    torch.set_num_threads(2);cv2.setNumThreads(2);torch.manual_seed(0)
    torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
    torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    # Module-scoped override only inside this process; original adapter file untouched.
    rt.WEIGHT=R/'checkpoint.pth';rt.SHA=weight_sha;rt.URL=URL
    model,prov=rt.load_model();model.dynamic_refine_thres=5/255;model.cuda()
    assert prov['source_hashes']==parent['provenance']['source_hashes']
    assert prov['adapter_sha256']==parent['provenance']['adapter_sha256']
    config=rt.ROOT/'configs/restorers/real_basicvsr/realbasicvsr_wogan_c64b20_2x30x8_lr1e-4_300k_reds.py'
    shutil.copy2(config,R/'upstream-config.py');shutil.copy2(rt.ROOT/'LICENSE',R/'LICENSE')
    contract={'id':'CLEANER_E5_WOGAN_CHECKPOINT_ONLY_PILOT','hashes':hashes,'code_sha':b.sha(Path(__file__)),
        'provenance':prov,'official_hash_prefix':'0e2ff207','full_download_hash_recorded':weight_sha,
        'selection':'Official first-stage checkpoint, L1 pixel+cleaning losses, sharpened GT; excludes GAN/perceptual losses but not learned sharpening',
        'sources':['https://github.com/open-mmlab/mmediting/blob/8b819f1d28d6eed6244721278a099f5dc0848a20/configs/restorers/real_basicvsr/realbasicvsr_wogan_c64b20_2x30x8_lr1e-4_300k_reds.py',URL],
        'variable':'checkpoint only relative to prior test5; includes learned flow weights; not proof of isolated loss-function causality',
        'official_recommended_test_threshold':1.5,'executed_threshold':5,'reason':'hold previous runtime/context/threshold fixed to isolate checkpoint; not official recommended config benchmark',
        'source_input':[24,24,24,25,26,27,28],'core':[24,25,26],
        'precision':'FP32, TF32 off','geometry_input':[600,420],'raw_output':[2400,1680],
        'composition':'RGB float x4 INTER_AREA to600x420 then rint/clip BGR uint8; no blend/sharpen/input resize',
        'gate':'same frozen E5 metrics on three pilot frames; Level3 or metric failure stops expansion; pilot pass only permits further review',
        'gates':b.GATES,'production':False,'external_gpu_usd':0,
        'license':'Apache-2.0 code archived; no completed commercial clearance of weights/data/dependencies',
        'limit':'Legacy infrastructure adapter parity with original runtime unverified; short overlapping frames no holdout',
        'environment':{'torch':torch.__version__,'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(),'opencv':cv2.__version__}}
    b.dump(R/'contract.json',contract)
    degraded=b.decode(B/'window/degraded.mkv');ids=[0,0,0,1,2,3,4]
    x=torch.from_numpy(degraded[ids,...,::-1].copy()).permute(0,3,1,2)[None].cuda().float()/255
    passes=[]
    def observe(module,args,residue):
        passes.append({'mean_abs_residue_255':float(residue.abs().mean().item())*255,
            'after':(args[0]+residue).detach().cpu().numpy().copy()})
    hook=model.image_cleaning.register_forward_hook(observe)
    torch.cuda.synchronize();torch.cuda.reset_peak_memory_stats();t=time.perf_counter()
    with torch.inference_mode():raw,clean=model(x,return_lqs=True)
    torch.cuda.synchronize();seconds=time.perf_counter()-t;hook.remove()
    assert raw.shape==(1,7,3,1680,2400) and torch.isfinite(raw).all() and torch.isfinite(clean).all()
    for f in ('raw-x4-float','cleaned-float','frames','passes'):(R/f).mkdir()
    for j,p in enumerate(passes):np.save(R/'passes'/f'{j+1}.npy',p.pop('after'),allow_pickle=False)
    gt=b.decode(B/'window/gt.mkv');rows=[];outputs=[]
    for j,i in enumerate((24,25,26)):
        a=raw[0,j+2].permute(1,2,0).cpu().numpy();cl=clean[0,j+2].permute(1,2,0).cpu().numpy()
        np.save(R/'raw-x4-float'/f'{i:06d}.npy',a,allow_pickle=False);np.save(R/'cleaned-float'/f'{i:06d}.npy',cl,allow_pickle=False)
        im=np.clip(np.rint(cv2.resize(a,(600,420),interpolation=cv2.INTER_AREA)[...,::-1]*255),0,255).astype(np.uint8)
        ci=np.clip(np.rint(cl[...,::-1]*255),0,255).astype(np.uint8)
        old=cv2.imread(str(P/'window/frames'/f'{i:06d}.png'))
        cv2.imwrite(str(R/'frames'/f'{i:06d}.png'),im);outputs.append(im)
        rows.append({'source_frame':i,'degraded':b.metrics(gt[j],degraded[j]),'cleaned':b.metrics(gt[j],ci),'candidate':b.metrics(gt[j],im),'prior_gan':b.metrics(gt[j],old)})
        panels=[b.label(gt[j],'GT relativo'),b.label(degraded[j],'Degradado'),b.label(ci,'WOGAN cleaning test5'),b.label(im,'WOGAN SR -> area'),b.label(old,'GAN anterior test5'),np.zeros((450,600,3),np.uint8)]
        cv2.imwrite(str(R/f'comparison-{i}.png'),np.vstack([np.hstack(panels[k:k+2]) for k in (0,2,4)]))
    outputs=np.array(outputs);b.encode(outputs,R/'restored.mkv',True);assert np.array_equal(outputs,b.decode(R/'restored.mkv'))
    means={arm:{k:float(np.mean([r[arm][k] for r in rows])) for k in rows[0][arm]} for arm in ('degraded','cleaned','candidate','prior_gan')}
    d=means['degraded'];r=means['candidate'];g=b.GATES;td=b.temporal_error(gt[:3],degraded[:3]);tr=b.temporal_error(gt[:3],outputs)
    checks={'psnr':r['psnr_db']-d['psnr_db']>=g['psnr_gain_db_min'],'ssim':r['ssim_y']-d['ssim_y']>=g['ssim_delta_min'],
        'edge':r['edge_mae']<=d['edge_mae']*g['edge_mae_ratio_max'],'detail':r['highpass_std']>=d['highpass_std']*g['highpass_std_ratio_to_degraded_min'],
        'temporal':tr<=td*g['temporal_gt_error_ratio_max']}
    assert all(b.sha(Path(p))==h for p,h in hashes.items())
    b.dump(R/'result.json',{'rows':rows,'means':means,'gates':checks,'passes':passes,
        'temporal_error':{'degraded':td,'candidate':tr,'limit':'only two transitions, not perceptual validation'},
        'decision':'PASS_TO_REVIEW' if all(checks.values()) else 'REJECT_PILOT_NO_EXPANSION',
        'instrumented_forward_seconds':seconds,'runner_seconds':time.perf_counter()-began,'peak_cuda_MiB':torch.cuda.max_memory_allocated()/2**20,
        'input_hashes_preserved':True,'master_png_exact':True,'external_gpu_usd':0,'visual':'PENDING'})
    print(json.dumps({'means':means,'gates':checks,'passes':passes,'seconds':seconds}),flush=True)
if __name__=='__main__':main()
