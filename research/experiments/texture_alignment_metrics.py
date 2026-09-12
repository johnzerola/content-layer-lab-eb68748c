"""Local, source-referenced texture audit. Commercial reference is not ground truth."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from skimage.metrics import structural_similarity

CONTENT = (25, 540, 1055, 1660)
SELECTED = [30, 50, 60, 70, 75, 85, 90, 100, 106, 115, 120, 130, 140]
CROPS = {
    0: {"garment_untouched": (640, 900, 890, 1120), "background": (70, 620, 340, 900), "face_hair": (650, 650, 970, 880), "edited_band": (210, 1360, 900, 1490)},
    1: {"garment_untouched": (380, 1010, 520, 1260), "background": (60, 650, 270, 900), "face_hair": (510, 605, 695, 885), "edited_band": (325, 1390, 800, 1490)},
    2: {"garment_untouched": (500, 1260, 900, 1330), "garment_bottom": (290, 1580, 870, 1640), "face": (355, 670, 625, 970), "hair": (650, 670, 860, 1110), "beard": (350, 1000, 675, 1190), "background": (60, 620, 215, 960), "edited_band": (330, 1370, 795, 1490)},
}

def dump(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def probe(path):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration,bit_rate,pix_fmt,color_range,color_space,color_transfer,color_primaries", "-of", "json", str(path)], text=True))["streams"][0]

def signatures(path):
    # Decode directly to thumbnails; no full-resolution sequence held in RAM.
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-an", "-vf", "crop=1030:1120:25:540,scale=128:140:flags=area,format=gray", "-vsync", "0", "-f", "rawvideo", "-"])
    thumbs = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 140, 128)
    # Exclude subtitle band entirely, remove global luma/contrast and fine sharpening.
    reduced = np.stack([cv2.GaussianBlur(t, (3, 3), .8) for t in thumbs]).astype(np.float32)
    reduced = np.concatenate([reduced[:, :97], reduced[:, 129:]], axis=1).reshape(len(thumbs), -1)
    reduced -= reduced.mean(axis=1, keepdims=True)
    reduced /= np.maximum(np.linalg.norm(reduced, axis=1, keepdims=True), 1e-6)
    return reduced

def cuts(sig):
    vals = 1 - np.sum(sig[1:] * sig[:-1], axis=1)
    return [{"frame": int(i + 1), "distance": float(vals[i])} for i in np.where(vals > .20)[0]]

def alignment(left, right):
    candidates = []
    for off in range(-15, 16):
        lo, hi = max(0, -off), min(len(left), len(right) - off)
        distances = 1 - np.sum(left[lo:hi] * right[lo + off:hi + off], axis=1)
        candidates.append({"offset": off, "mean_cosine_distance": float(distances.mean()), "median_cosine_distance": float(np.median(distances)), "frames": hi-lo})
    pairings = []
    for i, sig in enumerate(left):
        lo, hi = max(0, i-15), min(len(right), i+16)
        ds = 1 - right[lo:hi] @ sig
        order = np.argsort(ds)
        j = int(lo+order[0])
        pairings.append({"source_frame": i, "reference_frame": j, "offset": j-i, "distance": float(ds[order[0]]), "runner_up_gap": float(ds[order[1]]-ds[order[0]])})
    return {"method": "blurred normalized luma cosine matching within film rectangle, subtitle band excluded; +/-15 frames; not exact decoded-pixel equivalence", "global_candidates": candidates, "best_global": min(candidates, key=lambda x: x["mean_cosine_distance"]), "per_frame": pairings, "source_cuts": cuts(left), "reference_cuts": cuts(right)}

def read_frames(path, indices):
    result = {}
    capture = cv2.VideoCapture(str(path))
    for i in sorted(set(indices)):
        capture.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = capture.read()
        if not ok:
            raise RuntimeError(f"Cannot read frame {i}: {path}")
        result[i] = frame
    capture.release()
    return result

def feature_check(left, right):
    x0,y0,x1,y1=CONTENT
    a=cv2.cvtColor(left[y0:y1,x0:x1],cv2.COLOR_BGR2GRAY)
    b=cv2.cvtColor(right[y0:y1,x0:x1],cv2.COLOR_BGR2GRAY)
    mask=np.full_like(a,255);mask[1330-y0:1565-y0]=0
    orb=cv2.ORB_create(nfeatures=3000, fastThreshold=10)
    ka,da=orb.detectAndCompute(a,mask);kb,db=orb.detectAndCompute(b,mask)
    if da is None or db is None:
        return {"affine": None, "reason": "insufficient descriptors"}
    matches=cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da,db,k=2)
    good=[pair[0] for pair in matches if len(pair)==2 and pair[0].distance < .75*pair[1].distance]
    if len(good)<8:
        return {"affine": None, "matches":len(good),"reason":"insufficient matches"}
    pa=np.float32([ka[m.queryIdx].pt for m in good]);pb=np.float32([kb[m.trainIdx].pt for m in good])
    mat,inliers=cv2.estimateAffinePartial2D(pa,pb,method=cv2.RANSAC,ransacReprojThreshold=2.0)
    if mat is None:
        return {"affine":None,"reason":"RANSAC failure"}
    selected=inliers.ravel().astype(bool)
    pred=pa @ mat[:,:2].T + mat[:,2]
    errors=np.linalg.norm(pred-pb,axis=1)
    return {"affine":mat.tolist(),"matches":len(good),"inliers":int(selected.sum()),"inlier_ratio":float(selected.mean()),"median_reprojection_error_px":float(np.median(errors[selected])),"scale":float(np.hypot(mat[0,0],mat[1,0])),"translation_px":mat[:,2].tolist(),"note":"Consistency check only; no geometry-equivalence claim. Metrics/crops are not warped."}

def descriptive(frame):
    gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY).astype(np.float32)
    dx=cv2.Sobel(gray,cv2.CV_32F,1,0,ksize=3)/8
    dy=cv2.Sobel(gray,cv2.CV_32F,0,1,ksize=3)/8
    hf=gray-cv2.GaussianBlur(gray,(0,0),1.0)
    mu=cv2.GaussianBlur(gray,(0,0),2.0)
    local=np.sqrt(np.maximum(cv2.GaussianBlur(gray*gray,(0,0),2.0)-mu*mu,0))
    hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
    return {"luma_mean":float(gray.mean()),"luma_std":float(gray.std()),"luma_p05":float(np.percentile(gray,5)),"luma_p95":float(np.percentile(gray,95)),"saturation_mean_0_255":float(hsv[:,:,1].mean()),"high_frequency_rms_sigma1":float(np.sqrt(np.mean(hf**2))),"gradient_mean":float(np.mean(np.hypot(dx,dy))),"local_contrast_std_sigma2":float(local.mean()),"laplacian_variance":float(cv2.Laplacian(gray,cv2.CV_32F).var())}

def preservation(source, candidate):
    a=cv2.cvtColor(source,cv2.COLOR_BGR2GRAY).astype(np.float32)
    b=cv2.cvtColor(candidate,cv2.COLOR_BGR2GRAY).astype(np.float32)
    ga=np.hypot(cv2.Sobel(a,cv2.CV_32F,1,0,ksize=3),cv2.Sobel(a,cv2.CV_32F,0,1,ksize=3))
    gb=np.hypot(cv2.Sobel(b,cv2.CV_32F,1,0,ksize=3),cv2.Sobel(b,cv2.CV_32F,0,1,ksize=3))
    ea=cv2.Canny(a.astype(np.uint8),50,100)>0;eb=cv2.Canny(b.astype(np.uint8),50,100)>0
    nearby=cv2.dilate(eb.astype(np.uint8),np.ones((3,3),np.uint8))>0
    return {"ssim_luma":float(structural_similarity(a,b,data_range=255,gaussian_weights=True,sigma=1.5,use_sample_covariance=False)),"luma_mae":float(np.mean(abs(a-b))),"bgr_mae":float(np.mean(abs(source.astype(np.float32)-candidate.astype(np.float32)))),"gradient_magnitude_correlation":float(np.corrcoef(ga.ravel(),gb.ravel())[0,1]),"source_edge_recall_within_1px":float(np.mean(nearby[ea])) if ea.any() else None,"candidate_edge_density":float(eb.mean()),"source_edge_density":float(ea.mean())}

def sheet(path, label, crops):
    names=list(crops);h,w=next(iter(crops.values())).shape[:2]
    # All saved cells retain original decoded pixel dimensions.
    canvas=np.full((h+65,len(names)*w,3),20,np.uint8)
    for k,name in enumerate(names):
        cv2.putText(canvas,name,(k*w+6,23),cv2.FONT_HERSHEY_SIMPLEX,.43,(240,240,240),1,cv2.LINE_AA)
        cv2.putText(canvas,label,(k*w+6,48),cv2.FONT_HERSHEY_SIMPLEX,.36,(180,180,180),1,cv2.LINE_AA)
        canvas[65:,k*w:(k+1)*w]=crops[name]
    cv2.imwrite(str(path),canvas)

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--root",type=Path,default=Path("G:/dowloand/teste"));parser.add_argument("--output",type=Path,default=Path("G:/dowloand/teste/analise-microtextura-20260910"));args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    paths={"SOURCE":args.root/"padro-01-001 (15).mp4","INPUT":args.root/"resultado-automatico-v3-20260909/input.mp4","V3":args.root/"resultado-automatico-v3-20260909/output.mp4","PHASE1":args.root/"resultado-fase1-preservacao-b-20260910/output-crf14.mp4","PHASE2":args.root/"resultado-fase2-juncoes-20260910/reference.mp4","VMAKE":args.root/"VMAKE.IA.mp4"}
    sigs={name:signatures(path) for name,path in paths.items() if name in ["SOURCE","INPUT","VMAKE"]}
    # Search actual 80-second source, rather than assume cached input starts at zero.
    source_anchors=[]
    for i in [15,30,50,85,120,140]:
        ds=1-sigs["SOURCE"]@sigs["INPUT"][i]
        j=int(np.argmin(ds));source_anchors.append({"input_frame":i,"source_frame":j,"offset":j-i,"distance":float(ds[j])})
    source_offset=int(np.median([a["offset"] for a in source_anchors]))
    if any(abs(a["offset"]-source_offset)>1 for a in source_anchors):
        raise RuntimeError(f"Source mapping not constant; inspect {source_anchors}")
    ali=alignment(sigs["INPUT"],sigs["VMAKE"])
    ali["full_source_match"]={"anchors":source_anchors,"offset":source_offset}
    dump(args.output/"alignment.json",ali)
    print(json.dumps({"source_offset":source_offset,"best_global":ali["best_global"],"cuts":{k:ali[k] for k in ["source_cuts","reference_cuts"]},"selected_matching":[ali["per_frame"][i] for i in SELECTED]}),flush=True)
    frames={name:read_frames(path,[i+source_offset if name=="SOURCE" else ali["per_frame"][i]["reference_frame"] if name=="VMAKE" else i for i in SELECTED]) for name,path in paths.items()}
    data=[];features=[]
    for i in SELECTED:
        scene=0 if i<74 else 1 if i<104 else 2
        matched={name:frames[name][i+source_offset if name=="SOURCE" else ali["per_frame"][i]["reference_frame"] if name=="VMAKE" else i] for name in paths}
        features.append({"input_frame":i,"vmake_frame":ali["per_frame"][i]["reference_frame"],**feature_check(matched["INPUT"],matched["VMAKE"])})
        for region,box in CROPS[scene].items():
            x0,y0,x1,y1=box;patches={name:f[y0:y1,x0:x1] for name,f in matched.items()}
            row={"frame":i,"vmake_frame":ali["per_frame"][i]["reference_frame"],"scene":scene,"region":region,"xyxy":box,"source_contains_overlay":region=="edited_band","descriptive":{name:descriptive(patch) for name,patch in patches.items()},"preservation_against_source":None,"preservation_against_cached_input":None}
            if region!="edited_band":
                row["preservation_against_source"]={name:preservation(patches["SOURCE"],patch) for name,patch in patches.items() if name!="SOURCE"}
                row["preservation_against_cached_input"]={name:preservation(patches["INPUT"],patch) for name,patch in patches.items() if name!="INPUT"}
            else:
                row["preservation_unavailable_reason"]="Source contains subtitle pixels. No unobstructed ground truth; SSIM/LPIPS cannot score reconstruction quality here."
            if i in [50,90,120,140]:
                filename=f"frame-{i:03d}-{region}.png";sheet(args.output/filename,f"f{i}/v{row['vmake_frame']}",patches);row["sheet"]=filename
            data.append(row)
    report={"kind":"commercial_reference_without_ground_truth","sources":{name:{"path":str(path),"sha256":sha256(path),"probe":probe(path)} for name,path in paths.items()},"alignment":ali,"feature_checks":features,"crops":data,"lpips":None,"lpips_unavailable_reason":"lpips package is not installed locally; no model download or GPU job was started.","cost_usd":None,"cost_reason":"Local analysis of existing files. No billable GPU job.","limits":["One source video with three scenes, not independent validation cases.","Vmake matches are visual nearest matches; not exact same decoded original frames.","Crops are not geometrically warped; spatial or temporal differences affect pixel metrics.","High-frequency energy and Laplacian also reward noise, sharpening and compression artifacts.","Preservation metrics only outside known subtitle/inference band; no reconstruction quality score within removed text.","PHASE2 here is reference.mp4 experiment; not production deployment proof."]}
    dump(args.output/"report.json",report)
    print(json.dumps({"output":str(args.output),"rows":len(data),"features":features}),flush=True)

if __name__=="__main__":
    main()
