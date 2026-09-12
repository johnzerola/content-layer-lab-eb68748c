"""Assemble and evaluate Experiment 2 without changing production or B2."""
from __future__ import annotations

import hashlib
import json
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

from phase23_color import COUNT, H, W, rgb_writer
from phase23_donors import PARAMS, evaluate_pair, remap


ROOT = Path(r"G:/dowloand/teste/experiment-2-temporal-context-20260911")
PHASE = Path(r"G:/dowloand/teste/phase-2-3-20260910")
SOURCE = PHASE / "phase2/input.mp4"
PREFIX = PHASE / "phase2/baseline-master.mp4"
B2 = Path(r"G:/dowloand/teste/phase-5-20260911/baseline/B2-finish-OFF-rgb-lossless.mp4")
C2 = PHASE / "candidates/C2-window43/master.mp4"
D2_RAW = ROOT / "model/D2-context95/raw-output"
DONOR_EXPANDED = ROOT / "donors-expanded"
MASKS = PHASE / "phase2/masks"
DONOR_SOURCE = PHASE / "donors/primary/source-crop"
DONOR_MASKS = PHASE / "donors/primary/source-masks"
VMAKE = Path(r"G:/dowloand/teste/VMAKE.IA.mp4")
ROI = (130, 1300, 820, 294)


def digest(path: Path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def assemble_d2():
    out_dir = ROOT / "candidates/D2-context95-model-only"
    out_dir.mkdir(parents=True, exist_ok=True)
    master = out_dir / "master-rgb-lossless.mp4"
    if master.exists():
        return master
    source, prefix = cv2.VideoCapture(str(SOURCE)), cv2.VideoCapture(str(PREFIX))
    writer = rgb_writer(master); x, y, width, height = ROI
    outside_exact = True
    try:
        for index in range(COUNT):
            ok_s, src = source.read(); ok_p, old = prefix.read()
            if not ok_s or not ok_p:
                raise ValueError(f"short source {index}")
            if index < 104:
                candidate = old
            else:
                local = index - 104
                raw = cv2.imread(str(D2_RAW / f"{local:06d}.png"), cv2.IMREAD_COLOR)
                mask = cv2.imread(str(MASKS / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE) > 0
                candidate = src.copy(); selected = mask[y:y+height, x:x+width]
                roi = candidate[y:y+height, x:x+width]; roi[selected] = raw[selected]
                candidate[y:y+height, x:x+width] = roi
                outside_exact &= bool(np.array_equal(candidate[~mask], src[~mask]))
            writer.stdin.write(np.ascontiguousarray(candidate).tobytes())
        writer.stdin.close()
        if writer.wait() != 0:
            raise RuntimeError("lossless writer failed")
    finally:
        source.release(); prefix.release()
        if writer.poll() is None:
            writer.kill()
    (out_dir / "assembly.json").write_text(json.dumps({
        "master": str(master), "sha256": digest(master),
        "outside_composition_mask_exact": outside_exact,
        "donor_blending": False, "finish": False, "sharpening": False,
    }, indent=2), encoding="utf-8")
    return master


def assemble_expanded_donors():
    out_dir = ROOT / "candidates/B2-plus-expanded-donors-rejected"
    out_dir.mkdir(parents=True, exist_ok=True)
    master = out_dir / "master-rgb-lossless.mp4"
    if master.exists():
        return master
    capture = cv2.VideoCapture(str(B2)); writer = rgb_writer(master)
    changed = 0
    try:
        for index in range(COUNT):
            ok, frame = capture.read()
            if not ok: raise ValueError(f"short B2 {index}")
            candidate = frame.copy()
            if index >= 104:
                donor = cv2.imread(str(DONOR_EXPANDED/"candidate-final"/f"{index:06d}.png"))
                data = np.load(DONOR_EXPANDED/"maps"/f"{index:06d}.npz")
                selected = data["newly_recoverable"]
                roi = candidate[1240:1650,130:950]
                roi[selected] = donor[selected]
                candidate[1240:1650,130:950] = roi
                changed += int(selected.sum())
            writer.stdin.write(np.ascontiguousarray(candidate).tobytes())
        writer.stdin.close()
        if writer.wait() != 0: raise RuntimeError("donor master writer")
    finally:
        capture.release()
        if writer.poll() is None: writer.kill()
    (out_dir/"assembly.json").write_text(json.dumps({"master":str(master),"sha256":digest(master),
        "changed_pixel_occurrences":changed,"base":"B2 finish OFF","candidate_status":"REJECTED_BY_GT_GATE",
        "outside_newly_recoverable_exact_B2":True},indent=2),encoding="utf-8")
    return master


def delivery(source: Path, output: Path):
    if output.exists():
        return
    vf = ("scale=out_color_matrix=bt709:in_range=pc:out_range=tv:"
          "flags=accurate_rnd+full_chroma_int,format=yuv420p,setsar=1/1,"
          "setpts=N/(30*TB),setparams=range=tv:color_primaries=bt709:"
          "color_trc=bt709:colorspace=bt709")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-an", "-vf", vf,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                    "-color_range", "tv", "-movflags", "+faststart", "-video_track_timescale", "90000",
                    str(output)], check=True, timeout=300)


def load_video(path: Path):
    cap = cv2.VideoCapture(str(path)); frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    return frames


def full_metrics(master: Path):
    source, prefix, c2, d2 = map(load_video, (SOURCE, PREFIX, C2, master))
    if not all(len(frames) == COUNT for frames in (source, prefix, c2, d2)):
        raise ValueError("frame contract")
    outside_changed = outside_max = green_residual = 0
    prefix_exact = True; rows = []
    for index in range(COUNT):
        mask = cv2.imread(str(MASKS / f"{index:06d}.png"), 0) > 0
        if index < 104:
            prefix_exact &= bool(np.array_equal(d2[index], prefix[index]))
            continue
        delta = d2[index].astype(np.int16) - source[index].astype(np.int16)
        outside_changed += int(np.any(delta[~mask] != 0, axis=1).sum())
        outside_max = max(outside_max, int(np.abs(delta[~mask]).max()))
        b, g, r = [d2[index][..., channel].astype(np.int16) for channel in range(3)]
        green = mask & (g-r > 18) & (g-b > 14) & (g > 45)
        green_residual += int(green.sum())
        selected = mask[1300:1594, 130:950]
        c2_roi = c2[index][1300:1594, 130:950]
        d2_roi = d2[index][1300:1594, 130:950]
        difference = np.abs(c2_roi.astype(np.float32)-d2_roi.astype(np.float32)).mean(axis=2)
        rows.append({"frame": index, "mask_pixels": int(mask.sum()),
                     "D2_vs_C2_masked_mae": float(difference[selected].mean()) if selected.any() else 0})
    # Flow-compensated temporal proxy in the same donor ROI; not ground truth.
    temporal = []
    source_crops = {f: cv2.imread(str(DONOR_SOURCE/f"{f:06d}.png")) for f in range(104,147)}
    source_masks = {f: cv2.imread(str(DONOR_MASKS/f"{f:06d}.png"),0)>0 for f in range(104,147)}
    c2_rois = {f: c2[f][1240:1650,130:950] for f in range(104,147)}
    d2_rois = {f: d2[f][1240:1650,130:950] for f in range(104,147)}
    for frame in range(104,146):
        pair = evaluate_pair(source_crops[frame], source_crops[frame+1],
                             source_masks[frame], source_masks[frame+1])
        support = source_masks[frame] & pair["valid"] & (pair["fb"] < PARAMS["fb_max_px"])
        row = {"frame": frame, "tested_pixels": int(support.sum())}
        for name, values in (("C2", c2_rois), ("D2", d2_rois)):
            warped = remap(values[frame+1], pair["mapping"])
            delta = np.abs(values[frame].astype(np.float32)-warped.astype(np.float32)).mean(axis=2)
            row[f"{name}_warped_rgb_mae"] = float(delta[support].mean()) if support.any() else None
        temporal.append(row)
    return {"regression_gates": {"frames_0_103_exact_prefix": prefix_exact,
                                  "outside_masks_exact_source": outside_changed == 0,
                                  "green_residual_zero": green_residual == 0,
                                  "protected_face_hair_buckle_window_edges_geometry": outside_changed == 0},
            "outside_changed_pixels": outside_changed, "outside_max_delta": outside_max,
            "green_residual_pixels": green_residual, "per_frame": rows, "temporal": temporal,
            "temporal_mean": {name: float(np.mean([row[f"{name}_warped_rgb_mae"] for row in temporal
                                                    if row[f"{name}_warped_rgb_mae"] is not None]))
                              for name in ("C2", "D2")}}


def comparator(paths, labels, output: Path, starts, frames, crop=None, slow=False):
    caps = [cv2.VideoCapture(str(path)) for path in paths]
    for cap, start in zip(caps, starts): cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    if crop:
        x1,y1,x2,y2 = crop; cell_w,cell_h=x2-x1,y2-y1
    else:
        cell_w,cell_h=540,960
    lossless=output.with_suffix(".lossless.mkv")
    writer=cv2.VideoWriter(str(lossless),cv2.VideoWriter_fourcc(*"FFV1"),30,(cell_w*2,cell_h*2))
    for _ in range(frames):
        cells=[]
        for cap,label in zip(caps,labels):
            ok,frame=cap.read()
            if not ok: raise ValueError(f"short comparator {label}")
            frame=frame[y1:y2,x1:x2] if crop else cv2.resize(frame,(cell_w,cell_h),interpolation=cv2.INTER_AREA)
            cv2.rectangle(frame,(0,0),(frame.shape[1],44),(8,8,8),-1)
            cv2.putText(frame,label,(10,31),cv2.FONT_HERSHEY_SIMPLEX,.65,(245,245,245),2,cv2.LINE_AA)
            cells.append(frame)
        writer.write(np.vstack((np.hstack(cells[:2]),np.hstack(cells[2:]))))
    writer.release()
    for cap in caps:cap.release()
    filters="setpts=2*PTS,fps=30," if slow else ""
    subprocess.run(["ffmpeg","-y","-v","error","-i",str(lossless),"-vf",filters+"format=yuv420p,setsar=1/1",
                    "-an","-c:v","libx264","-preset","slow","-crf","16","-color_primaries","bt709",
                    "-color_trc","bt709","-colorspace","bt709","-color_range","tv","-movflags","+faststart",str(output)],
                   check=True,timeout=300)
    return {"path":str(output),"sha256":digest(output),"frames":frames,"starts":starts,
            "labels":labels,"crop":crop,"playback":"0.5x" if slow else "1x"}


def gt_comparator(output: Path, slow=False):
    source_dir=PHASE/"donors/primary/source-crop"; gt=ROOT/"donors-expanded/ground-truth"
    lossless=output.with_suffix(".lossless.mkv");x1,y1,x2,y2=(270,295,590,345)
    cell_w,cell_h=x2-x1,y2-y1
    writer=cv2.VideoWriter(str(lossless),cv2.VideoWriter_fourcc(*"FFV1"),30,(cell_w*3,(cell_h+36)))
    for frame in range(118,130):
        values=[cv2.imread(str(source_dir/f"{frame:06d}.png"))[y1:y2,x1:x2],
                cv2.imread(str(gt/"old"/f"{frame:06d}.png"))[y1:y2,x1:x2],
                cv2.imread(str(gt/"expanded"/f"{frame:06d}.png"))[y1:y2,x1:x2]]
        canvas=np.zeros((cell_h+36,cell_w*3,3),np.uint8)
        for i,(image,label) in enumerate(zip(values,("KNOWN GT","OLD DONORS","EXPANDED"))):
            canvas[36:,i*cell_w:(i+1)*cell_w]=image
            cv2.putText(canvas,label,(i*cell_w+8,25),cv2.FONT_HERSHEY_SIMPLEX,.55,(245,245,245),2,cv2.LINE_AA)
        writer.write(canvas)
    writer.release();vf="setpts=2*PTS,fps=30," if slow else ""
    subprocess.run(["ffmpeg","-y","-v","error","-i",str(lossless),"-vf",vf+"format=yuv420p,setsar=1/1",
                    "-an","-c:v","libx264","-preset","slow","-crf","16","-color_primaries","bt709",
                    "-color_trc","bt709","-colorspace","bt709","-color_range","tv",str(output)],check=True,timeout=120)
    return {"path":str(output),"sha256":digest(output),"frames":12,"labels":["KNOWN GT","OLD DONORS","EXPANDED"],
            "playback":"0.5x" if slow else "1x","crop":[x1,y1,x2,y2]}


def main():
    started=time.perf_counter(); master=assemble_d2(); donor_master=assemble_expanded_donors()
    deliveries=ROOT/"delivery";deliveries.mkdir(exist_ok=True)
    named={"source":SOURCE,"b2":B2,"c2":C2,"d2":master,"b2_expanded_donors":donor_master}
    for name,path in named.items():delivery(path,deliveries/f"{name}-crf16.mp4")
    metrics=full_metrics(master)
    comps=ROOT/"comparators";comps.mkdir(exist_ok=True)
    videos=[]
    standard=[deliveries/f"{name}-crf16.mp4" for name in ("source","b2","c2","d2")]
    labels=["SOURCE (has text)","B2 OFF","C2 43f","D2 context95"]
    videos.append(comparator(standard,labels,comps/"source-b2-c2-d2-1x.mp4",[104]*4,43,
                             crop=(180,1340,900,1545)))
    videos.append(comparator(standard,labels,comps/"source-b2-c2-d2-0.5x.mp4",[104]*4,43,
                             crop=(180,1340,900,1545),slow=True))
    videos.append(comparator([deliveries/"source-crf16.mp4",deliveries/"b2-crf16.mp4",
                              deliveries/"d2-crf16.mp4",VMAKE],
                             ["SOURCE (has text)","B2 OFF","D2 context95","VMAKE visual only"],
                             comps/"source-b2-d2-vmake-reference-1x.mp4",[3,3,3,0],144))
    videos.append(comparator([deliveries/"source-crf16.mp4",deliveries/"b2-crf16.mp4",
                              deliveries/"b2_expanded_donors-crf16.mp4",deliveries/"d2-crf16.mp4"],
                             ["SOURCE (has text)","B2 OFF","B2 + expanded donors","D2 context95"],
                             comps/"source-b2-expanded-d2-1x.mp4",[104]*4,43,crop=(180,1340,900,1545)))
    videos.append(gt_comparator(comps/"gt-old-expanded-1x.mp4"))
    videos.append(gt_comparator(comps/"gt-old-expanded-0.5x.mp4",slow=True))
    report={"candidate_master":str(master),"candidate_sha256":digest(master),"deliveries":{
        name:{"path":str(deliveries/f"{name}-crf16.mp4"),"sha256":digest(deliveries/f"{name}-crf16.mp4")}
        for name in named},"approved_experiment1_delivery_contract":True,"same_crf":16,
        "metrics":metrics,"comparators":videos,"vmake_role":"visual reference only; never donor, GT or model input",
        "seconds":time.perf_counter()-started,"cloud_gpu_cost_usd":0}
    (ROOT/"evaluation.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"report":str(ROOT/"evaluation.json"),"gates":metrics["regression_gates"],
                      "temporal":metrics["temporal_mean"],"seconds":report["seconds"]}))


if __name__=="__main__":main()
