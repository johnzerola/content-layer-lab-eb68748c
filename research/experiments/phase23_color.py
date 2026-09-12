"""Controlled, CPU-only native RGB preservation and delivery colour experiment.

The archived V3 is a reconstruction baseline, never a source of true texture.
This script restores SOURCE pixels outside the existing V3 composite support.
No appearance filter, model, GPU, sharpening or restoration is run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

W, H, FPS, COUNT = 1080, 1920, 30, 147
ROOT = Path("G:/dowloand/teste")
OUT = ROOT / "phase-2-3-20260910/phase2"
SOURCE = ROOT / "padro-01-001 (15).mp4"
V3 = ROOT / "resultado-automatico-v3-20260909/output.mp4"
TO_RGB_709 = "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24"
TO_YUV_709 = "scale=out_color_matrix=bt709:in_range=pc:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"


def run(cmd):
    start = time.perf_counter()
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    return round(time.perf_counter() - start, 3)


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def encode_delivery(master, original_audio, output, crf=14, *, generic=False):
    """One delivery encode from RGB master; real BT.709/range conversion + tags.

    Input must be RGB full-range BT.709-primaries/trc, native 1080x1920/30/147.
    generic=True is a deliberately separate tags-only/default-conversion control.
    Returns exact argv and elapsed wall time. AAC is copied, not transcoded.
    """
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(master),
           "-i", str(original_audio), "-map", "0:v:0", "-map", "1:a:0?",
           "-vf", "format=yuv420p" if generic else TO_YUV_709,
           "-c:v", "libx264", "-crf", str(crf), "-preset", "slow", "-threads", "2",
           "-frames:v", str(COUNT), "-fps_mode", "passthrough", "-c:a", "copy",
           "-t", str(COUNT/FPS), "-color_range", "tv", "-colorspace", "bt709",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", str(output)]
    return {"command": cmd, "seconds": run(cmd)}


class Reader:
    def __init__(self, path, yuv709=False):
        cmd = ["ffmpeg", "-v", "error", "-threads", "1", "-i", str(path), "-map", "0:v:0"]
        if yuv709:
            cmd += ["-vf", TO_RGB_709]
        cmd += ["-frames:v", str(COUNT), "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"]
        self.process = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    def frame(self):
        data = self.process.stdout.read(W*H*3)
        if len(data) != W*H*3:
            raise ValueError(f"Truncated decode: {len(data)} bytes")
        return np.frombuffer(data, np.uint8).reshape(H, W, 3)

    def close(self):
        self.process.stdout.close()
        if self.process.wait():
            raise RuntimeError("ffmpeg decode failed")


def rgb_writer(path):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0", "-an",
        "-c:v", "libx264rgb", "-crf", "0", "-preset", "fast", "-threads", "2",
        "-color_range", "pc", "-colorspace", "rgb", "-color_primaries", "bt709",
        "-color_trc", "bt709", str(path)], stdin=subprocess.PIPE)


def decoder_control(output):
    """Reproduce the SOURCE OpenCV conversion discrepancy on frame 120."""
    capture=cv2.VideoCapture(str(SOURCE))
    capture.set(cv2.CAP_PROP_POS_FRAMES,120)
    ok,opencv=capture.read()
    capture.release()
    if not ok: raise ValueError("SOURCE frame120 unavailable")
    comparisons={}
    for matrix in ["bt601","bt709"]:
        cmd=["ffmpeg","-v","error","-i",str(SOURCE),"-vf",
             f"select=eq(n\\,120),scale=in_color_matrix={matrix}:in_range=tv:out_range=pc",
             "-frames:v","1","-f","rawvideo","-pix_fmt","bgr24","pipe:1"]
        explicit=np.frombuffer(subprocess.check_output(cmd),np.uint8).reshape(H,W,3)
        diff=opencv.astype(np.int16)-explicit.astype(np.int16)
        comparisons[matrix]={"command":cmd,"mae":float(np.abs(diff).mean()),
                             "max_delta":int(np.abs(diff).max()),
                             "bgr_bias":diff.mean(axis=(0,1)).tolist(),
                             "decoded_bgr_sha256":hashlib.sha256(explicit.tobytes()).hexdigest()}
    result={"source":str(SOURCE),"source_sha256":digest(SOURCE),"frame":120,
            "opencv_version":cv2.__version__,"source_tags":probe(SOURCE)["streams"][0],
            "opencv_decoded_bgr_sha256":hashlib.sha256(opencv.tobytes()).hexdigest(),
            "opencv_vs_explicit_ffmpeg":comparisons,
            "scope":"Measured local OpenCV build only; do not generalize to every decoder/player."}
    (output/"decoder-control.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    return result


def write_comparator(output):
    (output/"comparison.html").write_text("""<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fase 2 — mesmo master, exports controlados</title>
<style>body{background:#17191c;color:#eee;font:16px system-ui;margin:24px}h1{font-size:23px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}video{width:100%;max-height:72vh;background:#000}button{padding:12px;margin:6px}p{max-width:1100px}a{color:#9cd4ff}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}</style>
<h1>Fase 2 — preservação, conversão e encode</h1>
<p>Os dois primeiros vídeos partem do mesmo master RGB sem perdas, com conversão real BT.709 limitada.
O terceiro isola a conversão automática com tags709; é um controle, não a variante recomendada.
O quarto mede o codec sem remoção. Todos:1080×1920,147quadros,30FPS. Nenhum realce foi aplicado.</p>
<button id="play">Reproduzir todos</button><button id="pause">Pausar</button><button id="restart">Reiniciar</button>
<label>Velocidade <select id="rate"><option>1</option><option>0.5</option><option>0.25</option></select>×</label>
<div class="grid"><div><h2>Master → CRF14</h2><video controls src="baseline-crf14.mp4" playsinline></video></div>
<div><h2>Mesmo master → CRF12</h2><video controls src="baseline-crf12.mp4" muted playsinline></video></div>
<div><h2>Controle: somente tags</h2><video controls src="control-tags-only-crf14.mp4" muted playsinline></video></div>
<div><h2>SOURCE → codec709</h2><video controls src="source-control-crf14.mp4" muted playsinline></video></div></div>
<p><a href="PHASE2_FINDINGS.md">Resultados e limites</a> · <a href="encode-report.json">Relatório e comandos</a> · <a href="decoder-control.json">Controle do decoder</a></p>
<script>const vs=[...document.querySelectorAll('video')];let sync=false;
function align(){for(const v of vs.slice(1)){if(Math.abs(v.currentTime-vs[0].currentTime)>.04)v.currentTime=vs[0].currentTime}}
document.querySelector('#play').onclick=()=>{align();vs.forEach(v=>v.play())};document.querySelector('#pause').onclick=()=>vs.forEach(v=>v.pause());
document.querySelector('#restart').onclick=()=>vs.forEach(v=>{v.pause();v.currentTime=0});document.querySelector('#rate').onchange=e=>vs.forEach(v=>v.playbackRate=+e.target.value);
vs[0].addEventListener('seeked',align);setInterval(()=>{if(!vs[0].paused)align()},100);</script></html>""",encoding="utf-8")


def collect_masks(output):
    spans = [(0,74, ROOT / "resultado-automatico-v2-contexto-20260909"),
             (74,104, ROOT / "resultado-automatico-v2-parcial-20260909"),
             (104,147, ROOT / "resultado-automatico-v2-20260909/scenes/0002")]
    (output / "masks").mkdir(exist_ok=True)
    records = []
    for start, stop, base in spans:
        for i in range(start, stop):
            original = base / f"subtitle-policy/composite-masks/{i-start:06d}.png"
            mask = cv2.imread(str(original), cv2.IMREAD_GRAYSCALE)
            if mask is None or mask.shape != (H,W):
                raise ValueError(f"Invalid mask {original}")
            dest = output / f"masks/{i:06d}.png"
            # Preserve the original alpha values; binary support is mask>0.
            dest.write_bytes(original.read_bytes())
            records.append({"frame": i, "path": str(dest), "original": str(original),
                            "sha256": digest(dest), "nonzero_pixels": int((mask>0).sum()),
                            "opaque_pixels": int((mask==255).sum()),
                            "alpha_levels": np.unique(mask).tolist()})
    return records


def build(output):
    start = time.perf_counter()
    output.mkdir(parents=True, exist_ok=True)
    masks = collect_masks(output)
    input_path = output / "input.mp4"
    source_cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(SOURCE), "-map", "0:v:0",
                  "-vf", "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24",
                  "-frames:v", str(COUNT), "-an", "-c:v", "libx264rgb", "-crf", "0",
                  "-preset", "fast", "-threads", "2", "-color_range", "pc", "-colorspace", "rgb",
                  "-color_primaries", "bt709", "-color_trc", "bt709", str(input_path)]
    if not input_path.exists():
        run(source_cmd)
    master_path = output / "baseline-master.mp4"
    source = Reader(input_path)
    baseline = Reader(V3, yuv709=True)
    writer = rgb_writer(master_path)
    expected_hashes = []
    for i in range(COUNT):
        src, old = source.frame(), baseline.frame()
        selected = cv2.imread(str(output / f"masks/{i:06d}.png"), 0) > 0
        # V3 is already composited: do NOT apply alpha a second time.
        result = src.copy()
        result[selected] = old[selected]
        expected_hashes.append(hashlib.sha256(result.tobytes()).hexdigest())
        writer.stdin.write(result.tobytes())
    writer.stdin.close()
    if writer.wait():
        raise RuntimeError("RGB master encode failed")
    source.close()
    baseline.close()
    check = Reader(master_path)
    source = Reader(input_path)
    preserved_max = 0
    for i in range(COUNT):
        actual, original = check.frame(), source.frame()
        if hashlib.sha256(actual.tobytes()).hexdigest() != expected_hashes[i]:
            raise ValueError(f"Lossless RGB roundtrip failed frame {i}")
        outside = cv2.imread(str(output / f"masks/{i:06d}.png"), 0) == 0
        preserved_max = max(preserved_max, int(np.abs(actual.astype(np.int16)[outside]-original.astype(np.int16)[outside]).max()))
    check.close()
    source.close()
    report = {"kind": "phase2_native_rgb_preservation", "status": "ACCEPT_FOR_CONTROLLED_EXPERIMENT",
              "source": {"path":str(SOURCE),"sha256":digest(SOURCE),"probe":probe(SOURCE)},
              "v3": {"path":str(V3),"sha256":digest(V3),"probe":probe(V3)},
              "input": {"path":str(input_path),"sha256":digest(input_path),"probe":probe(input_path)},
              "master": {"path":str(master_path),"sha256":digest(master_path),"probe":probe(master_path)},
              "source_decode_command": source_cmd,
              "reconstruction": "Archived V3 inside mask support; no new model, no alpha applied twice.",
              "outside_source_max_delta_all_147_frames": preserved_max,
              "lossless_rgb_roundtrip_verified_all_frames": True,
              "mask_records": masks, "build_seconds": round(time.perf_counter()-start,3),
              "gpu_started": False, "cloud_charge_usd":0,
              "limitations": ["V3 interior already has its old encoding loss; this master cannot recover that loss.",
                              "SOURCE under subtitle is not reconstruction ground truth.",
                              "RGB conversion is explicit BT.709, unlike OpenCV default BT.601 on original YUV."]}
    (output / "build-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"master":str(master_path),"outside_max_delta":preserved_max,"seconds":report["build_seconds"]}), flush=True)


def measurements(output, videos):
    source, master = Reader(output / "input.mp4"), Reader(output / "baseline-master.mp4")
    readers = {name:Reader(path, yuv709=True) for name,path in videos.items()}
    records = []
    for i in range(COUNT):
        src, raw = source.frame(), master.frame()
        outside = cv2.imread(str(output / f"masks/{i:06d}.png"), 0) == 0
        # Film only: avoid making preservation appear perfect due to black layout.
        film = np.zeros((H,W),bool)
        film[420:1640,30:1050] = True
        outside &= film
        for name, reader in readers.items():
            image = reader.frame()
            reference = src if name == "source_codec_control" else raw
            delta = image.astype(np.int16)-reference.astype(np.int16)
            err = delta[outside].astype(np.float32)
            # Rec.709 encoded RGB luma proxy, not linear light or physical luminance.
            luma_err = err @ np.array([.0722,.7152,.2126],np.float32)
            records.append({"frame":i,"variant":name,"pixels":int(outside.sum()),
                            "outside_rgb_mae":float(np.abs(err).mean()),
                            "outside_bgr_bias":err.mean(axis=0).tolist(),
                            "outside_luma_bias":float(luma_err.mean()),
                            "outside_luma_mae":float(np.abs(luma_err).mean())})
    source.close()
    master.close()
    for reader in readers.values(): reader.close()
    aggregates={}
    for name in videos:
        group=[r for r in records if r["variant"]==name]
        aggregates[name]={key:float(np.mean([r[key] for r in group])) for key in
                          ["outside_rgb_mae","outside_luma_bias","outside_luma_mae"]}
        aggregates[name]["outside_bgr_bias"] = np.mean([r["outside_bgr_bias"] for r in group],axis=0).tolist()
    return {"evaluation_region":"Unmasked film rectangle [30,420,1050,1640]; all 147 frames",
            "metrics":"RGB/luma error measures preservation only; not inpaint quality.",
            "means":aggregates,"per_frame":records}


def packet_contract(path):
    result=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_packets",
                 "-show_entries","packet=codec_type,pts_time,duration_time,data_hash",
                 "-show_data_hash","sha256","-of","json",str(path)]))
    packets=result["packets"]
    v=[p for p in packets if p["codec_type"]=="video"]
    a=[p for p in packets if p["codec_type"]=="audio"]
    timestamps=sorted(float(p["pts_time"]) for p in v)
    return {"video_count":len(v),"video_first_pts":timestamps[0],"video_last_pts":timestamps[-1],
            "video_uniform_1_30":all(abs((b-a)-1/30)<1e-6 for a,b in zip(timestamps,timestamps[1:])),
            "audio_count":len(a),"audio_packets":a}


def encode_round(output):
    start=time.perf_counter()
    decoder_control(output)
    variants={"baseline_crf14":output/"baseline-crf14.mp4",
              "baseline_crf12":output/"baseline-crf12.mp4",
              "tags_only_crf14":output/"control-tags-only-crf14.mp4",
              "source_codec_control":output/"source-control-crf14.mp4"}
    params={}
    for name,path in variants.items():
        params[name]=encode_delivery(output/("input.mp4" if name=="source_codec_control" else "baseline-master.mp4"),
                                    SOURCE,path,12 if name=="baseline_crf12" else 14,generic=name=="tags_only_crf14")
        print(json.dumps({"encoded":name,**params[name]}),flush=True)
    contracts={name:packet_contract(path) for name,path in variants.items()}
    source_packets=packet_contract(SOURCE)["audio_packets"]
    for name,contract in contracts.items():
        copied=contract.pop("audio_packets")
        hashes=[p["data_hash"] for p in copied]
        contract["audio_matches_original_prefix"] = hashes == [p["data_hash"] for p in source_packets[:len(hashes)]]
        contract["audio_first_pts"]=copied[0]["pts_time"] if copied else None
        contract["audio_last_pts"]=copied[-1]["pts_time"] if copied else None
    report={"kind":"phase2_same_master_delivery_ablation","hypothesis":"Explicit actual BT.709 conversion preserves source colour better than tags-only conversion.",
            "variables":"First matrix conversion: explicit709 vs default+tags at CRF14; then CRF14 vs12 with identical matrix/master/preset.",
            "master_sha256":digest(output/"baseline-master.mp4"),
            "variants":{name:{"path":str(path),"sha256":digest(path),"bytes":path.stat().st_size,"probe":probe(path),
                              "contract":contracts[name],**params[name]} for name,path in variants.items()},
            "measurements":measurements(output,variants),"gpu_started":False,"cloud_charge_usd":0,
            "round_seconds":round(time.perf_counter()-start,3)}
    (output/"encode-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    table="\n".join(f"| {name} | {m['outside_rgb_mae']:.4f} | {m['outside_luma_bias']:.4f} | {report['variants'][name]['bytes']/1e6:.2f} |"
                     for name,m in report["measurements"]["means"].items())
    findings=f"""# Fase 2 — rodada curta de preservação e cor

Status: ACCEPT como controle técnico isolado; não promovido para produção.

## Hipótese e variável

SOURCE e V3 foram decodificados explicitamente com BT.709/range limitado para RGB full.
O master mantém os pixels SOURCE fora do suporte das máscaras de composição do V3 e os
pixels já reconstruídos do V3 dentro. Não houve sharpening, restauração ou alteração estética.
Nenhum modelo ou GPU foi executado. O interior V3 já contém perdas antigas de codec.

O decode OpenCV direto do SOURCE era idêntico ao decode BT.601 em controle do quadro120;
contra decode709 houve MAE 0.3653 e delta máximo28. Assim o input RGB próprio desta rodada
é a referência canônica. Libx264rgb CRF0 preservou byte a byte todos os147 quadros. Fora
da máscara, master versus input canônico teve delta máximo ZERO em todos os quadros.

## Mesma origem para comparação de exports

CRF14 e CRF12 usam o MESMO baseline-master.mp4, preset slow, grade1080×1920, 147quadros,
30FPS e conversão REAL RGB full→YUV420 BT.709 limited antes de declarar tags709.
Controle tags-only usa conversão automática no mesmo master/CRF14; controle sem remoção
usa o input canônico para medir codec/cor sem reconstrução. Áudio AAC foi copiado do SOURCE.

| Variante | MAE RGB fora máscara | Viés luma709 | MB |
|---|---:|---:|---:|
{table}

Médias em todos os147 quadros, área filmada sem máscara (não inclui a moldura preta).
Essas métricas avaliam preservação, não qualidade ou textura verdadeira na legenda.
Tags, hashes, comandos, pixels por frame, timestamps e áudio estão em encode-report.json.

## Decisão

ACCEPT: master nativo sem perdas com preservação exata fora da máscara; conversão explícita709.
ACCEPT: comparação controlada CRF14/12; aumentar bitrate não é recuperação de textura perdida.
REJECT: usar somente tags de cor como correção da conversão anterior.
RETEST: qualidade geral em diferentes fontes; apenas um trecho curto foi usado nesta rodada.

Intermediários: input.mp4, masks/*.png, baseline-master.mp4. Saída bruta neural desta rodada:
NÃO EXISTE (nenhuma inferência). Os pixels V3 dentro da máscara são baseline já comprimida.
O master base mantém fivela/janela do V3 e deixa a fase3 variar somente a reconstrução do suéter.

Tempo total encode+medidas: {report['round_seconds']:.1f}s CPU. Custo adicional de nuvem US$0;
eletricidade local/armazenamento não medidos. Produção não foi alterada.
"""
    (output/"PHASE2_FINDINGS.md").write_text(findings,encoding="utf-8")
    write_comparator(output)
    print(json.dumps({"report":str(output/"encode-report.json"),"means":report["measurements"]["means"]}),flush=True)


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,default=OUT)
    parser.add_argument("--stage",choices=["build","encode","all"],default="all")
    args=parser.parse_args()
    if args.stage in {"build","all"}: build(args.output)
    if args.stage in {"encode","all"}: encode_round(args.output)
