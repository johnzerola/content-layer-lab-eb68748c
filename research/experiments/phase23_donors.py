"""CPU-only, conservative source-pixel recovery audit for the sweater shot.

No Vmake pixels are read. The colour decoder is explicitly BT.709 limited to
full BGR. Labels express availability under this bounded audit, not clean GT.
Inpaint is used ONLY to interpolate flow coordinates through unobserved text;
the saved RGB candidate contains remapped source pixels, never inpainted RGB.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

from phase23_masks import contamination_masks

ROI = (130, 1240, 820, 410)
LABELS = {0: "OUTSIDE_REQUEST", 1: "RECOVERABLE_REAL_PIXEL", 2: "SYNTHESIS_REQUIRED",
          3: "UNCERTAIN", 4: "OCCLUDED"}
PARAMS = {"flow": "Farneback native crop, masked-coordinate interpolation",
          "pyr_scale": .5, "levels": 4, "winsize": 31, "iterations": 5,
          "poly_n": 7, "poly_sigma": 1.5, "target_guard_px": 2,
          "fb_max_px": 1.0, "clean_support_radius": 17, "clean_support_fraction": .20,
          "support_photo_mae_max": 7., "support_gradient_mae_max": 11.,
          "cross_donor_rgb_mae_max": 9., "cross_donor_min": 2,
          "confidence_threshold": .48, "mask_donor_extra_guard_px": 2,
          "clean_support_distance_max_px": 18., "temporal_consistency_mae_max": 10.}


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()


def decode709(path, start=104, end=199):
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-vf",
               f"select='between(n,{start},{end-1})',scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24",
               "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    p = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    result = []
    nbytes = 1080 * 1920 * 3
    for _ in range(end-start):
        data = p.stdout.read(nbytes)
        if len(data) != nbytes: raise RuntimeError(f"Short frame: {len(data)}")
        result.append(np.frombuffer(data, np.uint8).reshape(1920,1080,3).copy())
    p.stdout.close()
    error = p.stderr.read().decode("utf-8", "replace")
    if p.wait(): raise RuntimeError(error)
    return result


def dilate(mask, radius):
    return cv2.dilate(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1))) > 0


def crop(frame):
    x,y,w,h = ROI
    return frame[y:y+h,x:x+w]


def box(value, radius=17):
    return cv2.boxFilter(value.astype(np.float32), -1, (2*radius+1,2*radius+1), normalize=True,
                         borderType=cv2.BORDER_REFLECT101)


def remap(array, mapping, interpolation=cv2.INTER_LINEAR):
    return cv2.remap(array, mapping[...,0], mapping[...,1], interpolation,
                     borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def flow_coordinates(target, donor, tm, dm):
    """Flow is observed outside glyphs and interpolated in the glyph guard.

    FB at hidden pixels is model consistency, not a measured correspondence.
    Visible support and independent donor agreement remain mandatory.
    """
    a = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(donor, cv2.COLOR_BGR2GRAY)
    # Neutralize caption colour before finding motion; never use this as RGB.
    af = cv2.inpaint(a, (tm*255).astype(np.uint8), 3, cv2.INPAINT_TELEA)
    bf = cv2.inpaint(b, (dm*255).astype(np.uint8), 3, cv2.INPAINT_TELEA)
    def flow(src, dst):
        return cv2.calcOpticalFlowFarneback(src,dst,None,.5,4,31,5,7,1.5,0)
    forward, backward = flow(af,bf), flow(bf,af)
    h,w=tm.shape
    grid=np.stack(np.meshgrid(np.arange(w,dtype=np.float32),np.arange(h,dtype=np.float32)),axis=-1)
    # In-mask flow gradients must come from observed neighbors, not letters.
    for ch in range(2):
        forward[...,ch] = cv2.inpaint(forward[...,ch],(tm*255).astype(np.uint8),5,cv2.INPAINT_NS)
    mapped = grid + forward
    reverse_bad = dm | (remap(tm.astype(np.uint8),grid+backward,cv2.INTER_NEAREST)>0)
    for ch in range(2):
        backward[...,ch] = cv2.inpaint(backward[...,ch],(reverse_bad*255).astype(np.uint8),5,cv2.INPAINT_NS)
    fb = np.linalg.norm(forward+remap(backward,mapped),axis=-1)
    return mapped, fb, forward


def evaluate_pair(target, donor, mask, donor_mask):
    tm = dilate(mask, PARAMS["target_guard_px"])
    dm = dilate(donor_mask, PARAMS["mask_donor_extra_guard_px"])
    mapping, fb, flow = flow_coordinates(target,donor,tm,dm)
    h,w=mask.shape
    valid=(mapping[...,0]>=2)&(mapping[...,0]<w-3)&(mapping[...,1]>=2)&(mapping[...,1]<h-3)
    clean = remap(dm.astype(np.float32),mapping)<.001
    warped = remap(donor,mapping)
    gray=cv2.cvtColor(target,cv2.COLOR_BGR2GRAY).astype(np.float32)
    warped_gray=cv2.cvtColor(warped,cv2.COLOR_BGR2GRAY).astype(np.float32)
    support=(~tm)&valid&clean&(fb<1.)
    support_fraction=box(support)
    denominator=np.maximum(support_fraction,1e-6)
    photo=box(np.abs(gray-warped_gray)*support)/denominator
    ga=cv2.Sobel(gray,cv2.CV_32F,1,0,ksize=3)/8
    gb=cv2.Sobel(warped_gray,cv2.CV_32F,1,0,ksize=3)/8
    gradient=box(np.abs(ga-gb)*support)/denominator
    distance=cv2.distanceTransform((~support).astype(np.uint8),cv2.DIST_L2,5)
    observed = valid&clean&(fb<PARAMS["fb_max_px"])
    eligible = observed&(support_fraction>=PARAMS["clean_support_fraction"])&(photo<PARAMS["support_photo_mae_max"])&(gradient<PARAMS["support_gradient_mae_max"])&(distance<PARAMS["clean_support_distance_max_px"])
    confidence = np.exp(-fb/2-photo/12-gradient/18-distance/45)*np.minimum(1.,support_fraction/.5)
    confidence[~eligible]=0
    eligible &= confidence>=PARAMS["confidence_threshold"]
    return {"warped":warped,"mapping":mapping,"fb":fb,"flow":flow,"confidence":confidence,
            "eligible":eligible,"clean":clean,"valid":valid,"photo":photo,"gradient":gradient,
            "support_fraction":support_fraction,"distance":distance}


def summarise_pair(p, mask, target_index, donor_index):
    def mean(a): return round(float(a[mask].mean()),5) if mask.any() else None
    fails={"out_of_frame":~p["valid"],"donor_caption_or_halo":~p["clean"],
           "fb_inconsistent":p["fb"]>=PARAMS["fb_max_px"],
           "insufficient_visible_support":p["support_fraction"]<PARAMS["clean_support_fraction"],
           "support_photometric_mismatch":p["photo"]>=PARAMS["support_photo_mae_max"],
           "support_gradient_mismatch":p["gradient"]>=PARAMS["support_gradient_mae_max"],
           "far_from_observed_support":p["distance"]>=PARAMS["clean_support_distance_max_px"],
           "confidence_below_threshold":p["confidence"]<PARAMS["confidence_threshold"]}
    return {"target_frame":target_index,"donor_frame":donor_index,"masked_pixels":int(mask.sum()),
            "eligible_before_agreement":int((p["eligible"]&mask).sum()),
            "mean_fb_error_px":mean(p["fb"]),"mean_support_photo_mae":mean(p["photo"]),
            "mean_confidence":mean(p["confidence"]),
            "rejection_pixels_nonexclusive":{k:int((v&mask).sum()) for k,v in fails.items()}}


def run(args):
    start=time.perf_counter();cv2.setNumThreads(2)
    out=args.output;out.mkdir(parents=True,exist_ok=True)
    for name in ("source-crop","source-masks","candidate","labels","confidence","donor-index","maps","review"):
        (out/name).mkdir(exist_ok=True)
    frames=decode709(args.source)
    masks,meta=contamination_masks(frames)
    # Exact target experiment masks take precedence at scene-end guard boundary.
    for i in range(43):
        m=cv2.imread(str(args.masks/f"{i:06d}.png"),0)
        if m is None:raise ValueError(f"Missing target mask {i}")
        masks[i]=m
    images=[crop(f).copy() for f in frames]
    del frames
    cmasks=[crop(m)>0 for m in masks]
    for i,(im,m) in enumerate(zip(images,cmasks)):
        cv2.imwrite(str(out/'source-crop'/f'{i+104:06d}.png'),im)
        cv2.imwrite(str(out/'source-masks'/f'{i+104:06d}.png'),(m*255).astype(np.uint8))
    targets=range(43) if args.target is None else [args.target-104]
    # Fixed donor pool is chosen by temporal coverage, caption sparsity and two
    # no-chroma candidates. It is identical for every target (except itself).
    donor_pool=[104,112,116,128,136,145,146]
    if args.extended:donor_pool=[116,136,145,146,147,148,149,150]
    reports=[];pair_reports=[];candidates={};accepted_masks={};selected_maps={};conf_maps={}
    for i in targets:
        target_index=i+104;mask=cmasks[i];target=images[i]
        pairs=[];indices=[];this_pair_reports=[]
        t=time.perf_counter()
        if mask.any():
            for donor_index in donor_pool:
                if donor_index==target_index:continue
                di=donor_index-104
                p=evaluate_pair(target,images[di],mask,cmasks[di])
                pairs.append(p);indices.append(donor_index)
                this_pair_reports.append(summarise_pair(p,mask,target_index,donor_index))
        shape=mask.shape
        label=np.where(mask,3,0).astype(np.uint8)
        chosen=np.full(shape,-1,np.int16);confidence=np.zeros(shape,np.float32)
        candidate=target.copy();accepted=np.zeros(shape,bool)
        if pairs:
            # Each candidate must agree in actual BGR with at least one other
            # clean aligned donor. Two neighboring donors are correlated evidence.
            for j,p in enumerate(pairs):
                agree=np.zeros(shape,np.uint8)
                for k,q in enumerate(pairs):
                    if j==k:continue
                    diff=np.abs(p["warped"].astype(np.float32)-q["warped"].astype(np.float32)).mean(axis=2)
                    agree += (q["eligible"]&(diff<PARAMS["cross_donor_rgb_mae_max"])).astype(np.uint8)
                p["agreement_count"]=agree
                p["supported"]=p["eligible"]&(agree>=PARAMS["cross_donor_min"]-1)&mask
                # Prefer the same latest source donor throughout the shot where
                # valid; deterministic choice avoids winner changes from tiny noise.
                score=p["confidence"] + (0.20 if indices[j]==146 else .10 if indices[j]==145 else 0)
                update=p["supported"]&(score>confidence)
                candidate[update]=p["warped"][update]
                chosen[update]=indices[j]
                confidence[update]=score[update]
                accepted|=p["supported"]
                this_pair_reports[j]["supported_after_agreement"]=int(p["supported"].sum())
                this_pair_reports[j]["status"]="ACCEPT_PARTIAL" if p["supported"].any() else "REJECT"
                this_pair_reports[j]["reason"]="observed_clean_support_fb_and_cross_donor_agreement" if p["supported"].any() else "no_masked_pixel_passed_all_checks"
            # Preserve uncalibrated confidence, stripping selection-only preference.
            confidence=np.zeros(shape,np.float32)
            for j,p in enumerate(pairs):confidence[chosen==indices[j]]=p["confidence"][chosen==indices[j]]
            any_visible=np.logical_or.reduce([p["valid"]&p["clean"] for p in pairs])
            any_geometric=np.logical_or.reduce([p["valid"]&(p["fb"]<1.) for p in pairs])
            label[mask&~any_visible&any_geometric]=2
            label[mask&~any_geometric]=4
            label[accepted]=1
            # Save per-donor diagnostics for the representative hard frame and
            # compact eligibility/error stacks for every target (lossless NPZ).
            np.savez_compressed(out/'maps'/f'{target_index:06d}.npz',
                donor_indices=np.array(indices,np.int16),
                eligible=np.stack([p['eligible'] for p in pairs]),
                supported=np.stack([p['supported'] for p in pairs]),
                fb_error=np.stack([p['fb'] for p in pairs]).astype(np.float16),
                support_photo_mae=np.stack([p['photo'] for p in pairs]).astype(np.float16),
                support_fraction=np.stack([p['support_fraction'] for p in pairs]).astype(np.float16),
                mappings=np.stack([p['mapping'] for p in pairs]).astype(np.float32),
                selected_donor=chosen,confidence=confidence,labels=label)
            if target_index in (104,120,140):
                for donor_index,p in zip(indices,pairs):
                    cv2.imwrite(str(out/'review'/f'target{target_index}-donor{donor_index}-warped.png'),p['warped'])
        pair_reports.extend(this_pair_reports)
        candidates[i]=candidate;accepted_masks[i]=accepted;selected_maps[i]=chosen;conf_maps[i]=confidence
        cv2.imwrite(str(out/'candidate'/f'{target_index:06d}.png'),candidate)
        cv2.imwrite(str(out/'labels'/f'{target_index:06d}.png'),label)
        cv2.imwrite(str(out/'confidence'/f'{target_index:06d}.png'),(confidence*65535).clip(0,65535).astype(np.uint16))
        cv2.imwrite(str(out/'donor-index'/f'{target_index:06d}.png'),(chosen+1).astype(np.uint16))
        reports.append({'source_frame':target_index,'masked_pixels':int(mask.sum()),
                        'label_counts':{LABELS[k]:int(((label==k)&mask).sum()) for k in range(1,5)},
                        'accepted_fraction':float(accepted.sum()/max(1,mask.sum())),
                        'chosen_donors':{str(k):int((chosen==k).sum()) for k in indices if (chosen==k).any()},
                        'seconds':round(time.perf_counter()-t,3)})
        print(json.dumps(reports[-1]),flush=True)
    # Temporal check against adjacent target coordinates. Failed pixels revert
    # to UNCERTAIN. Neighbor source pixels are allowed only when uncontaminated.
    temporal=[]
    if args.target is None:
        rejected={i:np.zeros_like(cmasks[i]) for i in targets}
        for i in range(42):
            p=evaluate_pair(images[i],images[i+1],cmasks[i],cmasks[i+1])
            warped_candidate=remap(candidates[i+1],p['mapping'])
            valid_neighbor=(remap(accepted_masks[i+1].astype(np.float32),p['mapping'])>.999)|p['clean']
            stable_support=p['valid']&(p['fb']<1.)&valid_neighbor&accepted_masks[i]
            delta=np.abs(candidates[i].astype(np.float32)-warped_candidate.astype(np.float32)).mean(axis=2)
            bad=stable_support&(delta>PARAMS['temporal_consistency_mae_max'])
            rejected[i]|=bad
            temporal.append({'source_frame':i+104,'next_source_frame':i+105,
                             'tested_pixels':int(stable_support.sum()),'rejected_pixels':int(bad.sum()),
                             'mean_warped_rgb_mae':float(delta[stable_support].mean()) if stable_support.any() else None})
        for i in targets:
            bad=rejected[i]
            if bad.any():
                accepted_masks[i][bad]=False;candidates[i][bad]=images[i][bad]
                conf_maps[i][bad]=0;selected_maps[i][bad]=-1
                label=cv2.imread(str(out/'labels'/f'{i+104:06d}.png'),0);label[bad]=3
                cv2.imwrite(str(out/'labels'/f'{i+104:06d}.png'),label)
                cv2.imwrite(str(out/'candidate'/f'{i+104:06d}.png'),candidates[i])
                cv2.imwrite(str(out/'confidence'/f'{i+104:06d}.png'),(conf_maps[i]*65535).astype(np.uint16))
                cv2.imwrite(str(out/'donor-index'/f'{i+104:06d}.png'),(selected_maps[i]+1).astype(np.uint16))
            reports[i]['temporal_rejected_pixels']=int(bad.sum())
            reports[i]['final_accepted_pixels']=int(accepted_masks[i].sum())
        for i in targets:
            np.savez_compressed(out/'maps'/f'{i+104:06d}-final.npz',accepted=accepted_masks[i],
                                confidence=conf_maps[i],selected_donor=selected_maps[i])
    # Visual label legend: green real, magenta synthesis, amber uncertain,
    # blue optical-flow/out-of-frame occlusion proxy; not all colours occur.
    colours=np.array([[0,0,0],[50,205,50],[220,40,220],[0,180,255],[255,90,20]],np.uint8)
    for i in targets:
        lab=cv2.imread(str(out/'labels'/f'{i+104:06d}.png'),0)
        visualization=images[i].copy();active=lab>0
        visualization[active]=(visualization[active].astype(float)*.35+colours[lab[active]]*.65).astype(np.uint8)
        cv2.imwrite(str(out/'review'/f'{i+104:06d}-labels.png'),visualization)
    result={'experiment':'B: real-source temporal references only, same A mask/model composite retained by caller',
            'source':str(args.source),'source_sha256':sha(args.source),'mask_directory':str(args.masks),
            'roi_xywh':ROI,'native_geometry':[1080,1920],'source_scene_inclusive':[104,198],
            'next_scene_cut_frame':199,'target_frames_inclusive':[104,146],
            'donor_pool':donor_pool,'expanded_context':bool(args.extended),'parameters':PARAMS,'labels':LABELS,
            'confidence_is_calibrated_probability':False,
            'colour_decode':'explicit BT.709 TV/limited to full BGR24 via FFmpeg',
            'inventory':[dict(source_frame=i+104,**r) for i,r in enumerate(meta)],
            'frames':reports,'donors':pair_reports,'temporal_checks':temporal,
            'processing_seconds':round(time.perf_counter()-start,3),'gpu_started':False,'gpu_cost_usd':0.,
            'conclusion':'RETEST: evaluate composed A+B master in motion before ACCEPT',
            'limitations':['No clean ground truth and no Vmake pixels used.',
              'Green-style masks plus halo are heuristic; black-only effects outside them are not proven absent.',
              'Flow inside hidden glyphs is interpolated from visible surrounding motion; FB is consistency, not measured true correspondence.',
              'Two aligned donors can share systematic optical-flow error; confidence is not calibrated.',
              'SYNTHESIS_REQUIRED means no observed clean donor in evaluated bounded pool, not proof of global impossibility.',
              'OCCLUDED combines forward/backward inconsistency and out-of-frame mapping; it is an occlusion proxy.',
              'Primary B stays within original 43-frame shot excerpt; full scene104..198 is inventoried separately.',
              'Candidate PNG preserves source RGB only under label1; all other pixels must come from A output, never this candidate.',
              'NPZ pair maps are pre-temporal-veto; final labels PNG / -final.npz are authoritative.']}
    (out/'report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    with (out/'donor-decisions.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=['target_frame','donor_frame','masked_pixels','eligible_before_agreement','supported_after_agreement','mean_fb_error_px','mean_support_photo_mae','mean_confidence','status','reason','rejection_pixels_nonexclusive'])
        writer.writeheader();writer.writerows(pair_reports)
    print(json.dumps({'report':str(out/'report.json'),'processing_seconds':result['processing_seconds']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--masks',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--target',type=int);p.add_argument('--extended',action='store_true')
    run(p.parse_args())
